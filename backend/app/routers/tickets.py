"""
Tickets Router.
Dispatches requests to ticket_service, analytics_service, and storage_service.
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.limiter import limiter
from backend.app.database import get_db
from backend.app.dependencies import get_current_user, require_role
from backend.app.models.enums import (
    TicketPriority,
    TicketStatus,
    UserRole,
)
from backend.app.models.ticket import Ticket
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.post("/", response_model=TicketRead, status_code=201)
@limiter.limit("15/minute")
async def create_ticket(
    request: Request,
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
    created_at: str | None = Query(None, description="Exact date YYYY-MM-DD"),
    date_range: str | None = Query(None, description="'today', 'week', 'month', 'custom'"),
    start_date: str | None = Query(None, description="Created at >= start_date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Created at <= end_date (YYYY-MM-DD)"),
    skip: int = Query(0, ge=0, description="Pagination offset (>= 0)"),
    limit: int = Query(50, ge=1, le=100, description="Max items per page (1-100)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await ticket_service.list_tickets_workflow(
        db=db,
        current_user=current_user,
        status_=status_,
        priority=priority,
        department_id=department_id,
        assigned_to_me=assigned_to_me,
        unassigned=unassigned,
        escalated=escalated,
        assigned_agent_id=assigned_agent_id,
        sla_status=sla_status,
        needs_triage=needs_triage,
        is_history=is_history,
        created_at=created_at,
        date_range=date_range,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
    )



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
    return await ticket_service.rate_ticket_workflow(ticket_id, payload, db, current_user)


@router.post("/{ticket_id}/attachments", response_model=list[AttachmentRead])
@limiter.limit("10/minute")
async def upload_attachments(
    request: Request,
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
    ticket = await db.get(Ticket, ticket_id)
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
    return await ticket_service.get_ticket_workflow(ticket_id, db, current_user)



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
    await ticket_service.delete_ticket_workflow(ticket_id, db)