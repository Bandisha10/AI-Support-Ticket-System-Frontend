import logging
from datetime import datetime, timedelta, time
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.ai.classify_ticket import classify_ticket
from backend.app.core import mailer
from backend.app.crud.base import CRUDBase
from backend.app.models.department import Department
from backend.app.models.enums import (
    AgentTier,
    TicketPriority,
    TicketSentiment,
    TicketStatus,
    UserRole,
)
from backend.app.models.reply import Reply
from backend.app.models.sla_policy import SLAPolicy
from backend.app.models.sla_state import SLAState
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.schemas.ticket import (
    AttachmentRead,
    TicketCreate,
    TicketRead,
    TicketUpdate,
)
from backend.app.services.manager_service import get_active_department_manager
from backend.app.services.storage_service import get_ticket_attachments
from backend.app.models.ticket_rating import TicketRating
from backend.app.schemas.ticket_rating import TicketRatingCreate, TicketRatingRead

logger = logging.getLogger(__name__)
ticket_crud = CRUDBase(Ticket)


def _val(x) -> str:
    """Return the string value of an enum (or str) safely."""
    return x.value if hasattr(x, "value") else str(x)


def _is_high_risk(priority, sentiment) -> bool:
    """A ticket is high-risk only when it is BOTH high priority AND negative sentiment."""
    return priority == TicketPriority.high and sentiment == TicketSentiment.negative


def ticket_to_read(
    ticket: Ticket,
    customer_email: str | None,
    sla_due_at=None,
    attachments: list[AttachmentRead] | None = None,
) -> TicketRead:
    """Constructs a TicketRead response object."""
    return TicketRead(
        id=ticket.id,
        customer_id=ticket.customer_id,
        customer_email=customer_email,
        department_id=ticket.department_id,
        assigned_agent_id=ticket.assigned_agent_id,
        priority=ticket.priority,
        sentiment=ticket.sentiment,
        status=ticket.status,
        subject=ticket.subject,
        body_redacted=ticket.body_redacted,
        classification_confidence=ticket.classification_confidence,
        sla_due_at=sla_due_at,
        attachments=attachments or [],
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


async def create_ticket_workflow(
    payload: TicketCreate,
    db: AsyncSession,
    current_user: User,
) -> TicketRead:
    """Classifies ticket, assigns manager if high risk, creates SLA state, and notifies."""
    # 1. AI Classification
    try:
        ai_result = classify_ticket(payload.subject, payload.body)
    except Exception as exc:
        logger.warning("Classification error during ticket creation: %s", exc)
        ai_result = {
            "body_redacted": payload.body,
            "category": {
                "label": "general",
                "confidence": 0.5,
                "needs_human_review": True,
            },
            "priority": {
                "label": "medium",
                "confidence": 0.5,
                "needs_human_review": True,
            },
            "sentiment": {
                "label": "neutral",
                "confidence": 0.5,
                "needs_human_review": True,
            },
        }

    # 2. Resolve Department
    category_label = ai_result.get("category", {}).get("label", "general")
    department_row = None
    if category_label:
        department_row = (
            await db.execute(
                select(Department).where(
                    sa_func.lower(Department.name) == category_label.lower()
                )
            )
        ).scalar_one_or_none()

    # 3. Resolve Priority & Sentiment
    raw_priority = str(ai_result.get("priority", {}).get("label", "medium")).lower()
    priority_val = TicketPriority.medium
    if raw_priority in (
        TicketPriority.low.value,
        TicketPriority.medium.value,
        TicketPriority.high.value,
    ):
        priority_val = TicketPriority(raw_priority)

    raw_sentiment = str(ai_result.get("sentiment", {}).get("label", "neutral")).lower()
    sentiment_val = TicketSentiment.neutral
    if raw_sentiment in (
        TicketSentiment.positive.value,
        TicketSentiment.neutral.value,
        TicketSentiment.negative.value,
    ):
        sentiment_val = TicketSentiment(raw_sentiment)

    raw_conf = ai_result.get("category", {}).get("confidence", 0.5)
    try:
        conf_val = round(float(raw_conf), 3)
    except Exception:
        conf_val = 0.5

    # 4. Check for Manager Auto-Escalation
    assigned_mgr_id = None
    mgr_routed = False
    is_escalation = _is_high_risk(priority_val, sentiment_val)

    manager = None
    if is_escalation and department_row:
        manager = await get_active_department_manager(db, department_row.id)
        if manager:
            assigned_mgr_id = manager.id
            mgr_routed = True

    data = {
        "customer_id": current_user.id,
        "subject": payload.subject,
        "body_redacted": ai_result.get("body_redacted", payload.body),
        "department_id": department_row.id if department_row else None,
        "assigned_agent_id": assigned_mgr_id,
        "priority": priority_val,
        "sentiment": sentiment_val,
        "classification_confidence": conf_val,
        "status": TicketStatus.in_progress if mgr_routed else TicketStatus.open,
    }

    ticket = await ticket_crud.create(db, data)

    # 5. Attach SLA State
    sla_policy = (
        await db.execute(select(SLAPolicy).where(SLAPolicy.priority == ticket.priority))
    ).scalar_one_or_none()

    if sla_policy:
        now = datetime.now()
        sla_state = SLAState(
            ticket_id=ticket.id,
            sla_policy_id=sla_policy.id,
            response_due_at=now + timedelta(minutes=sla_policy.response_minutes),
            resolution_due_at=now + timedelta(minutes=sla_policy.resolution_minutes),
        )
        db.add(sla_state)
        await db.commit()

    # 6. Audit Note & Manager Email Alert
    if mgr_routed and manager:
        db.add(
            Reply(
                ticket_id=ticket.id,
                author_id=manager.id,
                body=(
                    f"Automated Escalation: Ticket flagged with priority '{priority_val.value}' and "
                    f"sentiment '{sentiment_val.value}'. Assigned directly to Department Manager ({manager.email})."
                ),
                is_system_log=True,
            )
        )
        await db.commit()
        # The ticket is already saved; a mail failure must not turn into a 500.
        try:
            await run_in_threadpool(
                mailer.send_manager_ticket_escalation_email,
                manager_email=manager.email,
                manager_name=manager.first_name,
                ticket_id=str(ticket.id),
                ticket_subject=ticket.subject,
                reason="High Priority and Negative Sentiment ticket auto-escalation",
                priority=priority_val.value,
                sentiment=sentiment_val.value,
            )
        except Exception as exc:
            logger.warning("Failed to send manager escalation email: %s", exc)

    return ticket_to_read(ticket, current_user.email, attachments=[])


async def update_ticket_workflow(
    ticket_id: UUID,
    payload: TicketUpdate,
    db: AsyncSession,
    current_user: User,
) -> TicketRead:
    """Validates assignment boundaries, prevents unauthorized claims, handles mid-flight escalation."""
    obj = await ticket_crud.get(db, ticket_id)
    if not obj:
        raise HTTPException(404, "Ticket not found")

    is_admin = current_user.role == UserRole.admin
    is_manager = (
        current_user.role == UserRole.agent
        and getattr(current_user, "agent_tier", None) == AgentTier.manager
    )
    # 1. Delegation & Reassignment RBAC Boundaries
    if "assigned_agent_id" in payload.model_fields_set:
        new_agent_id = payload.assigned_agent_id
        if not is_admin and not is_manager:
            # Prevent regular agents from unassigning tickets back to the queue
            if new_agent_id is None and obj.assigned_agent_id is not None:
                raise HTTPException(
                    403,
                    "Only Department Managers and Admins can unassign tickets back to the queue.",
                )
            # Prevent regular agents from delegating / reassigning tickets to peers
            if new_agent_id is not None and new_agent_id != current_user.id:
                raise HTTPException(
                    403,
                    "Only Department Managers and Admins can delegate or reassign tickets to other agents.",
                )
            # Prevent regular agents from stealing tickets already assigned to another agent
            if (
                obj.assigned_agent_id is not None
                and obj.assigned_agent_id != current_user.id
            ):
                raise HTTPException(
                    403,
                    "This ticket is already assigned to another agent. Only Managers and Admins can reassign it.",
                )
    # 2. Department Transfer & Triage RBAC Boundaries
    if "department_id" in payload.model_fields_set:
        new_dept_id = payload.department_id
        if new_dept_id != obj.department_id and not is_admin and not is_manager:
            raise HTTPException(
                403,
                "Only Department Managers and Admins can transfer tickets or send them back to triage.",
            )
    # 3. Assigned Agent Status & Department Validation
    if payload.assigned_agent_id is not None:
        agent = await db.get(User, payload.assigned_agent_id)
        if not agent or agent.role != UserRole.agent:
            raise HTTPException(400, "Assigned user must be a valid support agent")
        if getattr(agent, "is_archive", False):
            raise HTTPException(400, "Cannot assign tickets to an archived agent")
        if not agent.is_active:
            raise HTTPException(
                400, "Cannot assign tickets to a suspended/inactive agent"
            )
        if obj.department_id and agent.department_id != obj.department_id:
            raise HTTPException(
                400, "Cannot assign ticket to an agent outside of this department"
            )
        # Prevent Regular Agents from Claiming High-Risk Escalations
        is_high_risk = _is_high_risk(obj.priority, obj.sentiment)
        if (
            is_high_risk
            and not is_admin
            and not is_manager
            and payload.assigned_agent_id == current_user.id
        ):
            dept_manager = await get_active_department_manager(db, obj.department_id)
            if dept_manager:
                raise HTTPException(
                    403,
                    f"High-priority and negative-sentiment tickets are reserved for Department Manager ({dept_manager.email}) or Admins.",
                )

    # 4. Check for Mid-Lifecycle Escalation
    new_priority = payload.priority or obj.priority
    new_sentiment = payload.sentiment or obj.sentiment
    was_high_risk = _is_high_risk(obj.priority, obj.sentiment)
    is_now_high_risk = _is_high_risk(new_priority, new_sentiment)

    updates = payload.model_dump(exclude_unset=True)

    # When sending a ticket back to admin triage (department_id set to None),
    # ensure it is unassigned and reset to open status
    if (
        "department_id" in payload.model_fields_set
        and updates.get("department_id") is None
    ):
        updates["assigned_agent_id"] = None
        if payload.status is None:
            updates["status"] = TicketStatus.open

    # Auto-advance ticket status to in_progress if open and assigned
    if (
        updates.get("assigned_agent_id")
        and (payload.status is None)
        and obj.status == TicketStatus.open
    ):
        updates["status"] = TicketStatus.in_progress

    # Create an internal audit note when delegated to another agent
    if (
        updates.get("assigned_agent_id")
        and updates["assigned_agent_id"] != obj.assigned_agent_id
    ):
        target_agent = await db.get(User, updates["assigned_agent_id"])
        if target_agent and current_user.id != target_agent.id:
            actor_role = (
                "Department Manager"
                if getattr(current_user, "agent_tier", None) == AgentTier.manager
                else "Administrator"
            )
            target_name = (
                f"{target_agent.first_name} {target_agent.last_name}".strip()
                if target_agent.first_name
                else target_agent.email
            )
            db.add(
                Reply(
                    ticket_id=obj.id,
                    author_id=current_user.id,
                    body=f"Delegation Audit: {actor_role} ({current_user.email}) delegated ticket to {target_name} ({target_agent.email}).",
                    is_system_log=True,
                )
            )
            # Send email notification to the delegated agent
            dept_name = "General Support"
            if obj.department_id:
                dept_obj = await db.get(Department, obj.department_id)
                if dept_obj:
                    dept_name = dept_obj.name
            delegator_label = (
                f"{current_user.first_name} {current_user.last_name}".strip()
                if current_user.first_name
                else (current_user.email or actor_role)
            )
            try:
                await run_in_threadpool(
                    mailer.send_agent_ticket_delegated_email,
                    agent_email=target_agent.email,
                    agent_name=target_agent.first_name,
                    ticket_id=str(obj.id),
                    ticket_subject=obj.subject,
                    department_name=dept_name,
                    delegated_by_name=f"{delegator_label} ({actor_role})",
                    priority=_val(new_priority),
                )
            except Exception as exc:
                logger.warning("Failed to send agent ticket delegated email: %s", exc)

    # 5. Route high-risk tickets to the Department Manager
    target_dept_id = updates.get("department_id", obj.department_id)
    dept_just_assigned_or_changed = (
        "department_id" in updates
        and updates["department_id"] is not None
        and updates["department_id"] != obj.department_id
    )
    newly_high_risk = is_now_high_risk and not was_high_risk

    # If the caller explicitly picked an assignee (e.g. an admin delegating), respect it.
    explicit_assignee = updates.get("assigned_agent_id") is not None

    # Escalate when:
    #  1. priority/sentiment just became high-risk (mid-lifecycle), or
    #  2. a high-risk ticket was just given/moved to a department (triage / transfer)
    should_escalate_to_manager = (
        is_now_high_risk
        and bool(target_dept_id)
        and not explicit_assignee
        and (newly_high_risk or dept_just_assigned_or_changed)
    )

    manager_email_payload = None
    if should_escalate_to_manager:
        manager = await get_active_department_manager(db, target_dept_id)
        # Skip if the ticket is already with the manager (avoids duplicate notes/emails)
        if manager and obj.assigned_agent_id != manager.id:
            updates["assigned_agent_id"] = manager.id
            if payload.status is None and obj.status == TicketStatus.open:
                updates["status"] = TicketStatus.in_progress
            reason = (
                "Mid-ticket escalation to High Priority and Negative Sentiment"
                if newly_high_risk
                else "Triage Escalation: High-priority/negative-sentiment ticket assigned to department"
            )
            db.add(
                Reply(
                    ticket_id=obj.id,
                    author_id=manager.id,
                    body=f"{reason}. Reassigned to Department Manager ({manager.email}).",
                    is_system_log=True,
                )
            )
            manager_email_payload = dict(
                manager_email=manager.email,
                manager_name=manager.first_name,
                ticket_id=str(obj.id),
                ticket_subject=obj.subject,
                reason=reason,
                priority=_val(new_priority),
                sentiment=_val(new_sentiment),
            )

    updated = await ticket_crud.update(db, obj, updates)

    # Send the manager alert only after the change is saved, and never fail the request over it
    if manager_email_payload:
        try:
            await run_in_threadpool(
                mailer.send_manager_ticket_escalation_email,
                **manager_email_payload,
            )
        except Exception as exc:
            logger.warning("Failed to send manager escalation email: %s", exc)

    # Fetch joined SLA state for response
    query = (
        select(User.email, SLAState.resolution_due_at)
        .select_from(Ticket)
        .outerjoin(User, Ticket.customer_id == User.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
        .where(Ticket.id == ticket_id)
    )
    result = await db.execute(query)
    row = result.first()
    customer_email = row[0] if row else None
    sla_due_at = row[1] if row else None

    attachments = await get_ticket_attachments(updated.id, db)
    return ticket_to_read(updated, customer_email, sla_due_at, attachments)

# Lines 455-470 in backend/app/services/ticket_service.py
async def list_tickets_workflow(
    db: AsyncSession,
    current_user: User,
    status_: TicketStatus | None = None,
    priority: TicketPriority | None = None,
    department_id: UUID | None = None,
    assigned_to_me: bool | None = None,
    unassigned: bool | None = None,
    escalated: bool | None = None,
    assigned_agent_id: UUID | None = None,
    sla_status: str | None = None,
    needs_triage: bool | None = None,
    is_history: bool | None = None,
    created_at: str | None = None,
    date_range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[TicketRead]:
    """Builds filtered ticket queries according to user role, SLA status, and triage rules."""
    query = (
        select(Ticket, User.email.label("customer_email"), SLAState.resolution_due_at)
        .outerjoin(User, Ticket.customer_id == User.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
    )

    if sla_status:
        now_dt = datetime.now(timezone.utc) if hasattr(timezone, "utc") else datetime.utcnow()
        query = query.where(
            Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
        )
        if sla_status == "breached":
            query = query.where(
                (SLAState.breached.is_(True)) | (SLAState.resolution_due_at <= now_dt)
            )
        elif sla_status == "at_risk":
            risk_window = now_dt + timedelta(minutes=60)
            query = query.where(
                SLAState.breached.is_(False),
                SLAState.resolution_due_at > now_dt,
                SLAState.resolution_due_at <= risk_window,
            )
        elif sla_status in ("all_risk", "at_risk_or_breached"):
            risk_window = now_dt + timedelta(minutes=60)
            query = query.where(
                (SLAState.breached.is_(True))
                | (SLAState.resolution_due_at <= risk_window)
            )

    if current_user.role == UserRole.customer:
        query = query.where(Ticket.customer_id == current_user.id)
        
    elif current_user.role == UserRole.agent:
        if assigned_to_me:
            query = query.where(Ticket.assigned_agent_id == current_user.id)
        elif unassigned:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None)),
                Ticket.assigned_agent_id.is_(None),
            )
        elif assigned_agent_id:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None)),
                Ticket.assigned_agent_id == assigned_agent_id,
            )
        else:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None))
                | (Ticket.assigned_agent_id == current_user.id)
            )

    elif current_user.role == UserRole.admin:
        if not status_ and not is_history:
            query = query.where(
                Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
            )

    if is_history:
        query = query.where(
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed])
        )

    elif status_:
        query = query.where(Ticket.status == status_)

    elif not status_ and (assigned_to_me or unassigned):
        query = query.where(
            Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
        )

    if priority:
        query = query.where(Ticket.priority == priority)

    if department_id:
        query = query.where(Ticket.department_id == department_id)

    # Created At / Date Filtering
    if created_at:
        try:
            clean_date = created_at.strip().split("T")[0]
            dt = datetime.fromisoformat(clean_date)
            start_of_day = datetime.combine(dt.date(), time.min)
            end_of_day = datetime.combine(dt.date(), time.max)
            query = query.where(
                Ticket.created_at >= start_of_day,
                Ticket.created_at <= end_of_day,
            )
        except Exception as exc:
            logger.warning("Invalid created_at parameter '%s': %s", created_at, exc)
    elif date_range or start_date or end_date:
        now = datetime.now()
        if date_range == "today":
            start_of_today = datetime.combine(now.date(), time.min)
            end_of_today = datetime.combine(now.date(), time.max)
            query = query.where(
                Ticket.created_at >= start_of_today,
                Ticket.created_at <= end_of_today,
            )
        elif date_range == "week":
            query = query.where(Ticket.created_at >= now - timedelta(days=7))
        elif date_range == "month":
            query = query.where(Ticket.created_at >= now - timedelta(days=30))
        elif date_range == "custom" or start_date or end_date:
            if start_date:
                try:
                    s_clean = start_date.strip().split("T")[0]
                    s_dt = datetime.fromisoformat(s_clean)
                    query = query.where(
                        Ticket.created_at >= datetime.combine(s_dt.date(), time.min)
                    )
                except Exception as exc:
                    logger.warning("Invalid start_date '%s': %s", start_date, exc)
            if end_date:
                try:
                    e_clean = end_date.strip().split("T")[0]
                    e_dt = datetime.fromisoformat(e_clean)
                    query = query.where(
                        Ticket.created_at <= datetime.combine(e_dt.date(), time.max)
                    )
                except Exception as exc:
                    logger.warning("Invalid end_date '%s': %s", end_date, exc)


    if escalated:
        query = query.where(
            (Ticket.priority == TicketPriority.high)
            | (Ticket.sentiment == TicketSentiment.negative)
        )

    if assigned_to_me and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id == current_user.id)

    if unassigned and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id.is_(None))

    if assigned_agent_id and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id == assigned_agent_id)

    if needs_triage is not None and current_user.role == UserRole.admin:
        if needs_triage:
            query = query.where(
                (
                    Ticket.classification_confidence.is_(None)
                    | (Ticket.classification_confidence != 1.0)
                )
                & (
                    (Ticket.department_id.is_(None))
                    | (Ticket.classification_confidence < 0.6)
                )
            )
        else:
            query = query.where(
                (Ticket.classification_confidence == 1.0)
                | (
                    (Ticket.classification_confidence >= 0.6)
                    & (Ticket.department_id.is_not(None))
                )
            )

    query = query.order_by(Ticket.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    return [
        ticket_to_read(ticket, customer_email, sla_due_at)
        for ticket, customer_email, sla_due_at in rows
    ]


async def get_ticket_workflow(
    ticket_id: UUID,
    db: AsyncSession,
    current_user: User,
) -> TicketRead:
    """Retrieves single ticket with SLA status and attachments, enforcing customer RBAC."""
    query = (
        select(Ticket, User.email.label("customer_email"), SLAState.resolution_due_at)
        .outerjoin(User, Ticket.customer_id == User.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
        .where(Ticket.id == ticket_id)
    )
    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(404, "Ticket not found")

    ticket, customer_email, sla_due_at = row
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")
    
    if current_user.role == UserRole.agent:
        is_in_dept = (
            ticket.department_id is None
            or current_user.department_id is None
            or ticket.department_id == current_user.department_id
        )
        if not is_in_dept and ticket.assigned_agent_id != current_user.id:
            raise HTTPException(403, "Not allowed to view tickets outside your department")


    attachments = await get_ticket_attachments(ticket.id, db)
    return ticket_to_read(ticket, customer_email, sla_due_at, attachments)


async def rate_ticket_workflow(
    ticket_id: UUID,
    payload: TicketRatingCreate,
    db: AsyncSession,
    current_user: User,
) -> TicketRating:
    """Records customer satisfaction rating for a resolved/closed ticket."""
    ticket = await ticket_crud.get(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")
    if ticket.status not in (TicketStatus.resolved, TicketStatus.closed):
        raise HTTPException(400, "Can only rate resolved or closed tickets")

    existing = (
        await db.execute(
            select(TicketRating).where(TicketRating.ticket_id == ticket_id)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Ticket already rated")

    rating = TicketRating(
        ticket_id=ticket_id, rating=payload.rating, feedback=payload.feedback
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)
    return rating


async def delete_ticket_workflow(ticket_id: UUID, db: AsyncSession) -> None:
    """Deletes a ticket."""
    obj = await ticket_crud.get(db, ticket_id)
    if not obj:
        raise HTTPException(404, "Ticket not found")
    await ticket_crud.delete(db, obj)
