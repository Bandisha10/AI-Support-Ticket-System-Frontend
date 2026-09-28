"""
Tickets Router.
Dispatches requests to ticket_service, analytics_service, and storage_service.
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.crud.base import CRUDBase
from backend.app.database import get_db
from backend.app.dependencies import get_current_user, require_role
from backend.app.models.enums import (
    TicketPriority,
    TicketSentiment,
    TicketStatus,
    UserRole,
)
from backend.app.models.sla_state import SLAState
from backend.app.models.ticket import Ticket
from backend.app.models.ticket_rating import TicketRating
from backend.app.models.user import User
from backend.app.schemas.ticket import (
    AttachmentRead,
    TicketCreate,
    TicketRead,
    TicketUpdate,
)
from backend.app.schemas.ticket_rating import TicketRatingCreate, TicketRatingRead
from backend.app.services import analytics_service, storage_service, ticket_service
from backend.app.services.storage_service import (
    get_ticket_attachments as _get_ticket_attachments,
)
from backend.app.services.ticket_service import ticket_to_read as _ticket_to_read

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tickets", tags=["Tickets"])
crud = CRUDBase(Ticket)


@router.post("/", response_model=TicketRead, status_code=201)
async def create_ticket(
    payload: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await ticket_service.create_ticket_workflow(payload, db, current_user)


@router.get("/", response_model=list[TicketRead])
async def list_tickets(
    status_: TicketStatus | None = Query(None, alias="status"),
    priority: TicketPriority | None = None,
    department_id: UUID | None = None,
    assigned_to_me: bool | None = Query(None),
    unassigned: bool | None = Query(None),
    escalated: bool | None = Query(None),
    assigned_agent_id: UUID | None = Query(None),
    sla_status: str | None = Query(
        None, description="'breached', 'at_risk', or 'all_risk'"
    ),
    needs_triage: bool | None = Query(None),
    is_history: bool | None = Query(None),
    skip: int = Query(0, ge=0, description="Pagination offset (>= 0)"),
    limit: int = Query(50, ge=1, le=100, description="Max items per page (1-100)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    status_val = status_ if not hasattr(status_, "default") else status_.default
    priority_val = priority if not hasattr(priority, "default") else priority.default
    dept_id_val = (
        department_id
        if not hasattr(department_id, "default")
        else department_id.default
    )
    assigned_to_me_val = (
        assigned_to_me
        if not hasattr(assigned_to_me, "default")
        else assigned_to_me.default
    )
    unassigned_val = (
        unassigned if not hasattr(unassigned, "default") else unassigned.default
    )
    escalated_val = (
        escalated if not hasattr(escalated, "default") else escalated.default
    )
    assigned_agent_id_val = (
        assigned_agent_id
        if not hasattr(assigned_agent_id, "default")
        else assigned_agent_id.default
    )
    sla_status_val = (
        sla_status if not hasattr(sla_status, "default") else sla_status.default
    )
    needs_triage_val = (
        needs_triage if not hasattr(needs_triage, "default") else needs_triage.default
    )
    is_history_val = (
        is_history if not hasattr(is_history, "default") else is_history.default
    )
    skip_val = int(skip if not hasattr(skip, "default") else (skip.default or 0))
    limit_val = int(limit if not hasattr(limit, "default") else (limit.default or 50))

    query = (
        select(Ticket, User.email.label("customer_email"), SLAState.resolution_due_at)
        .outerjoin(User, Ticket.customer_id == User.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
    )

    if sla_status_val:
        now_dt = datetime.now(timezone.utc)
        query = query.where(
            Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
        )
        if sla_status_val == "breached":
            query = query.where(
                (SLAState.breached.is_(True)) | (SLAState.resolution_due_at <= now_dt)
            )
        elif sla_status_val == "at_risk":
            risk_window = now_dt + timedelta(minutes=60)
            query = query.where(
                SLAState.breached.is_(False),
                SLAState.resolution_due_at > now_dt,
                SLAState.resolution_due_at <= risk_window,
            )
        elif sla_status_val in ("all_risk", "at_risk_or_breached"):
            risk_window = now_dt + timedelta(minutes=60)
            query = query.where(
                (SLAState.breached.is_(True))
                | (SLAState.resolution_due_at <= risk_window)
            )

    if current_user.role == UserRole.customer:
        query = query.where(Ticket.customer_id == current_user.id)
    elif current_user.role == UserRole.agent:
        if assigned_to_me_val:
            query = query.where(Ticket.assigned_agent_id == current_user.id)
        elif unassigned_val:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None)),
                Ticket.assigned_agent_id.is_(None),
            )
        elif assigned_agent_id_val:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None)),
                Ticket.assigned_agent_id == assigned_agent_id_val,
            )
        else:
            query = query.where(
                (Ticket.department_id == current_user.department_id)
                | (Ticket.department_id.is_(None))
                | (Ticket.assigned_agent_id == current_user.id)
            )
    elif current_user.role == UserRole.admin:
        if not status_val:
            query = query.where(
                Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
            )

    if is_history_val:
        query = query.where(
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed])
        )
    elif status_val:
        query = query.where(Ticket.status == status_val)
    elif not status_val and (assigned_to_me_val or unassigned_val):
        query = query.where(
            Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed])
        )

    if priority_val:
        query = query.where(Ticket.priority == priority_val)
    if dept_id_val:
        query = query.where(Ticket.department_id == dept_id_val)
    if escalated_val:
        query = query.where(
            (Ticket.priority == TicketPriority.high)
            | (Ticket.sentiment == TicketSentiment.negative)
        )
    if assigned_to_me_val and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id == current_user.id)
    if unassigned_val and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id.is_(None))
    if assigned_agent_id_val and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id == assigned_agent_id_val)

    if needs_triage_val is not None and current_user.role == UserRole.admin:
        if needs_triage_val:
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

    query = query.order_by(Ticket.created_at.desc()).offset(skip_val).limit(limit_val)
    result = await db.execute(query)
    rows = result.all()

    return [
        _ticket_to_read(ticket, customer_email, sla_due_at)
        for ticket, customer_email, sla_due_at in rows
    ]


@router.get("/analytics")
async def get_analytics(
    date_range: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    department_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.agent)),
):
    return await analytics_service.get_dashboard_analytics(
        db=db,
        current_user=current_user,
        date_range=date_range,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
    )


@router.get("/analytics/agent")
async def get_agent_analytics(
    date_range: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
):
    return await analytics_service.get_agent_analytics(
        db=db,
        current_user=current_user,
        date_range=date_range,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/{ticket_id}/rate", response_model=TicketRatingRead, status_code=201)
async def rate_ticket(
    ticket_id: UUID,
    payload: TicketRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = await crud.get(db, ticket_id)
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


@router.post(
    "/{ticket_id}/attachments",
    response_model=list[AttachmentRead],
    status_code=201,
)
async def upload_attachments(
    ticket_id: UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await storage_service.upload_attachments_workflow(
        ticket_id, files, db, current_user
    )


@router.get("/{ticket_id}/attachments", response_model=list[AttachmentRead])
async def list_ticket_attachments(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = await crud.get(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")

    return await _get_ticket_attachments(ticket_id, db)


@router.get("/{ticket_id}/attachments/{filename}")
async def download_ticket_attachment(
    ticket_id: UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await storage_service.get_attachment_download_response(
        ticket_id, filename, db, current_user
    )


@router.get("/{ticket_id}", response_model=TicketRead)
async def get_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    attachments = await _get_ticket_attachments(ticket.id, db)
    return _ticket_to_read(ticket, customer_email, sla_due_at, attachments)


@router.put(
    "/{ticket_id}",
    response_model=TicketRead,
    dependencies=[Depends(require_role(UserRole.admin, UserRole.agent))],
)
async def update_ticket(
    ticket_id: UUID,
    payload: TicketUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await ticket_service.update_ticket_workflow(
        ticket_id, payload, db, current_user
    )


@router.delete(
    "/{ticket_id}",
    status_code=204,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def delete_ticket(ticket_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, ticket_id)
    if not obj:
        raise HTTPException(404, "Ticket not found")
    await crud.delete(db, obj)
