import uuid
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.models.user import User
from backend.app.models.ticket import Ticket
from backend.app.models.reply import Reply
from backend.app.models.enums import UserRole, AgentTier, TicketStatus
from backend.app.core import mailer

logger = logging.getLogger(__name__)


async def get_active_department_manager(db: AsyncSession, department_id: uuid.UUID | None) -> User | None:
    """Find the single active manager for a department."""
    if not department_id:
        return None
    query = select(User).where(
        User.department_id == department_id,
        User.role == UserRole.agent,
        User.agent_tier == AgentTier.manager,
        User.is_active.is_(True),
        User.is_archive.is_(False),
    )
    result = await db.execute(query)
    return result.scalars().first()


async def validate_single_department_manager(
    db: AsyncSession, department_id: uuid.UUID, exclude_user_id: uuid.UUID | None = None
) -> None:
    """Ensure a department does not already have an active Manager."""
    if not department_id:
        return
    query = select(User).where(
        User.department_id == department_id,
        User.role == UserRole.agent,
        User.agent_tier == AgentTier.manager,
        User.is_active.is_(True),
        User.is_archive.is_(False),
    )
    if exclude_user_id:
        query = query.where(User.id != exclude_user_id)

    existing = (await db.execute(query)).scalars().first()
    if existing:
        name = f"{existing.first_name or ''} {existing.last_name or ''}".strip() or existing.email
        raise ValueError(
            f"Department already has an active Manager: {name} ({existing.email}). "
            "Only one manager per department is permitted."
        )


async def reroute_agent_tickets_on_absence(
    db: AsyncSession, agent: User, reason: str = "Agent became unavailable"
) -> int:
    """Reassign all open/in_progress tickets from an absent agent to their Department Manager."""
    open_tickets_query = select(Ticket).where(
        Ticket.assigned_agent_id == agent.id,
        Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]),
    )
    tickets = (await db.execute(open_tickets_query)).scalars().all()
    if not tickets:
        return 0

    manager = await get_active_department_manager(db, agent.department_id)
    reassigned_count = 0

    for t in tickets:
        if manager and manager.id != agent.id:
            t.assigned_agent_id = manager.id
            note = f"Automated Action: {reason}. Ticket reassigned to Department Manager ({manager.email})."
        else:
            t.assigned_agent_id = None
            note = f"Automated Action: {reason}. No active manager available; ticket returned to Department Unassigned Queue."

        db.add(Reply(
            ticket_id=t.id,
            author_id=agent.id,
            body=note,
            is_system_log=True,
        ))
        reassigned_count += 1

    await db.commit()

    if manager and reassigned_count > 0:
        try:
            await run_in_threadpool(
                mailer.send_manager_ticket_escalation_email,
                manager_email=manager.email,
                manager_name=manager.first_name,
                ticket_id=str(tickets[0].id),
                ticket_subject=f"Workload Handover: {reassigned_count} tickets from {agent.email}",
                reason=reason,
                priority="high",
                sentiment="neutral",
            )
        except Exception as exc:
            logger.warning("Failed to send manager handover alert: %s", exc)

    return reassigned_count

async def reroute_manager_tickets_on_demotion(
    db: AsyncSession, former_manager: User, new_manager: User | None = None
) -> int:
    """
    When a Manager is demoted or steps down, reroute their active tickets.
    - If a new Manager exists, handover tickets to the new Manager.
    - If no Manager exists, unassign tickets so they return to the Department Queue for triage.
    """
    open_tickets_query = select(Ticket).where(
        Ticket.assigned_agent_id == former_manager.id,
        Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]),
    )
    tickets = (await db.execute(open_tickets_query)).scalars().all()
    if not tickets:
        return 0

    if not new_manager and former_manager.department_id:
        new_manager = await get_active_department_manager(db, former_manager.department_id)

    reassigned_count = 0
    for t in tickets:
        if new_manager and new_manager.id != former_manager.id:
            t.assigned_agent_id = new_manager.id
            note = f"Automated Action: Manager demoted to regular agent. Ticket reassigned to new Department Manager ({new_manager.email})."
        else:
            t.assigned_agent_id = None
            note = "Automated Action: Manager demoted to regular agent. Ticket unassigned and returned to Department Queue for manager triage."

        db.add(Reply(
            ticket_id=t.id,
            author_id=former_manager.id,
            body=note,
            is_system_log=True,
        ))
        reassigned_count += 1

    await db.commit()
    return reassigned_count