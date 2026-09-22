import logging
import os
import re
import uuid as uuid_pkg
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import RedirectResponse, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, func as sa_func, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import settings
from backend.app.core.supabase_client import supabase_admin
from backend.app.database import get_db
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.models.sla_state import SLAState
from backend.app.models.department import Department
from backend.app.models.attachment import Attachment
from backend.app.models.enums import UserRole, TicketStatus, TicketPriority
from backend.app.schemas.ticket import TicketCreate, TicketUpdate, TicketRead, AttachmentRead
from backend.app.crud.base import CRUDBase
from backend.app.dependencies import get_current_user, require_role
from backend.app.ai.classify_ticket import classify_ticket
from backend.app.models.ticket_rating import TicketRating
from backend.app.schemas.ticket_rating import TicketRatingCreate, TicketRatingRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tickets", tags=["Tickets"])
crud = CRUDBase(Ticket)

STORAGE_BUCKET = getattr(settings, "SUPABASE_STORAGE_BUCKET", "ticket-attachments")
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx", ".txt"}


def _format_size(size_bytes: int | None) -> str:
    if not size_bytes:
        return "0 Bytes"
    k = 1024.0
    sizes = ["Bytes", "KB", "MB", "GB"]
    i = 0
    val = float(size_bytes)
    while val >= k and i < len(sizes) - 1:
        val /= k
        i += 1
    return f"{val:.1f} {sizes[i]}"


def _sanitize_filename(filename: str) -> str:
    base = os.path.basename(filename)
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", base)


async def _get_signed_url_safe(ticket_id: UUID, filename: str, expires_in: int = 3600) -> str:
    """Generate a temporary signed URL from Supabase Storage for secure direct access."""
    storage_path = f"{ticket_id}/{filename}"
    try:
        data = await run_in_threadpool(
            supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url,
            storage_path,
            expires_in,
        )
        return data.get("signedURL") or data.get("signedUrl") or f"/tickets/{ticket_id}/attachments/{filename}"
    except Exception as exc:
        logger.warning("Could not generate signed URL for %s: %s", storage_path, exc)
        return f"/tickets/{ticket_id}/attachments/{filename}"


async def _get_ticket_attachments(ticket_id: UUID, db: AsyncSession) -> list[AttachmentRead]:
    attachments: list[AttachmentRead] = []
    try:
        result = await db.execute(select(Attachment).where(Attachment.ticket_id == ticket_id))
        rows = result.scalars().all()
        for r in rows:
            formatted_sz = _format_size(r.file_size)
            signed_url = await _get_signed_url_safe(ticket_id, r.filename)
            attachments.append(
                AttachmentRead(
                    id=r.id,
                    ticket_id=r.ticket_id,
                    filename=r.filename,
                    name=r.original_filename,
                    url=signed_url,
                    content_type=r.content_type,
                    size=formatted_sz,
                    file_size=r.file_size,
                    size_formatted=formatted_sz,
                    created_at=r.created_at,
                )
            )
    except Exception as exc:
        logger.error("Failed to query attachments for ticket %s: %s", ticket_id, exc)

    return attachments

def _ticket_to_read(
    ticket: Ticket,
    customer_email: str | None,
    sla_due_at=None,
    attachments: list[AttachmentRead] | None = None,
) -> TicketRead:
    """Build a TicketRead-compatible object from a Ticket ORM object + joined fields."""
    return TicketRead(
        id=ticket.id,
        customer_id=ticket.customer_id,
        customer_email=customer_email,
        category_id=ticket.category_id,
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

@router.post("/", response_model=TicketRead, status_code=201)
async def create_ticket(payload: TicketCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    ai_result = classify_ticket(payload.subject, payload.body)

    department_row = (await db.execute(
        select(Department).where(Department.name == ai_result["category"]["label"])
    )).scalar_one_or_none()

    data = {
        "customer_id": current_user.id,
        "subject": payload.subject,
        "body_redacted": ai_result["body_redacted"],
        "category_id": None,
        "department_id": department_row.id if department_row else None,
        "priority": ai_result["priority"]["label"],
        "classification_confidence": ai_result["category"]["confidence"],
        "status": "human_review" if ai_result["category"]["needs_human_review"] else "open",
    }
    return await crud.create(db, data)

@router.get("/", response_model=list[TicketRead])
async def list_tickets(
    status_: TicketStatus | None = Query(None, alias="status"),
    priority: TicketPriority | None = None,
    department_id: UUID | None = None,
    assigned_to_me: bool | None = Query(None),
    unassigned: bool | None = Query(None),
    needs_triage: bool | None = Query(None),  # <--- NEW PARAM
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Ticket, User.email.label("customer_email"), SLAState.resolution_due_at)
        .outerjoin(User, Ticket.customer_id == User.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
    )

        # Role-based filtering
    if current_user.role == UserRole.customer:
        query = query.where(Ticket.customer_id == current_user.id)
    elif current_user.role == UserRole.agent:
        if assigned_to_me:
            query = query.where(Ticket.assigned_agent_id == current_user.id)
        elif unassigned:
            query = query.where(
                Ticket.department_id == current_user.department_id,
                Ticket.assigned_agent_id.is_(None)
            )
        else:
            query = query.where(
                (Ticket.department_id == current_user.department_id) |
                (Ticket.assigned_agent_id == current_user.id)
            )
    elif current_user.role == UserRole.admin:
        if not status_:
            query = query.where(Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]))

    # Query param filters
    if status_:
        query = query.where(Ticket.status == status_)
    if priority:
        query = query.where(Ticket.priority == priority)
    if department_id:
        query = query.where(Ticket.department_id == department_id)
    if assigned_to_me and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id == current_user.id)
    if unassigned and current_user.role != UserRole.agent:
        query = query.where(Ticket.assigned_agent_id.is_(None))

    # Triage Panel filtering - Admins only
    if needs_triage is not None and current_user.role == UserRole.admin:
        if needs_triage:
            query = query.where(
                # If it's NOT manually overridden by an admin (1.0)
                (Ticket.classification_confidence.is_(None) | (Ticket.classification_confidence != 1.0)) &
                (
                    (Ticket.department_id.is_(None)) |
                    (Ticket.classification_confidence < 0.6)
                )
            )
        else:
            query = query.where(
                # If it WAS manually overridden (1.0) OR it successfully passed AI triage automatically
                (Ticket.classification_confidence == 1.0) |
                (
                    (Ticket.classification_confidence >= 0.6) &
                    (Ticket.department_id.is_not(None))
                )
            )
    query = query.order_by(Ticket.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    return [
        _ticket_to_read(ticket, customer_email, sla_due_at)
        for ticket, customer_email, sla_due_at in rows
    ]


def _build_date_filters(
    date_range: str | None,
    start_date: str | None,
    end_date: str | None,
    base_filters: list | None = None,
) -> list:
    filters = list(base_filters) if base_filters else []
    now = datetime.now()
    if date_range == "week":
        filters.append(Ticket.created_at >= now - timedelta(days=7))
    elif date_range == "month":
        filters.append(Ticket.created_at >= now - timedelta(days=30))
    elif date_range == "custom" or start_date or end_date:
        if start_date:
            try:
                s_dt = datetime.fromisoformat(start_date.replace("Z", ""))
                filters.append(Ticket.created_at >= datetime(s_dt.year, s_dt.month, s_dt.day, 0, 0, 0))
            except Exception:
                pass
        if end_date:
            try:
                e_dt = datetime.fromisoformat(end_date.replace("Z", ""))
                filters.append(Ticket.created_at <= datetime(e_dt.year, e_dt.month, e_dt.day, 23, 59, 59))
            except Exception:
                pass
    return filters

@router.get("/analytics")
async def get_analytics(
    date_range: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.agent))
):
    now = datetime.now()
    five_days_ago = now - timedelta(days=5)
    ten_days_ago = now - timedelta(days=10)

    filters = _build_date_filters(date_range, start_date, end_date)

    # 1. Totals & Trend
    total_query = select(sa_func.count()).select_from(Ticket).where(*filters)
    total_tickets = (await db.execute(total_query)).scalar() or 0

    recent_query = select(sa_func.count()).select_from(Ticket).where(Ticket.created_at >= five_days_ago)
    recent_tickets = (await db.execute(recent_query)).scalar() or 0

    past_query = select(sa_func.count()).select_from(Ticket).where(Ticket.created_at >= ten_days_ago, Ticket.created_at < five_days_ago)
    past_tickets = (await db.execute(past_query)).scalar() or 0

    if past_tickets > 0:
        total_tickets_trend = round(((recent_tickets - past_tickets) / past_tickets) * 100, 1)
    else:
        total_tickets_trend = 100.0 if recent_tickets > 0 else 0.0

    # 2. Status Counts
    status_counts_query = (
        select(Ticket.status, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.status)
    )
    status_counts_rows = (await db.execute(status_counts_query)).all()
    status_counts = {k.name if hasattr(k, "name") else str(k): v for k, v in status_counts_rows}

    open_count = status_counts.get("open", 0)
    in_progress_count = status_counts.get("in_progress", 0)
    pending_count = status_counts.get("pending", 0)
    resolved_count = status_counts.get("resolved", 0)
    closed_count = status_counts.get("closed", 0)

    tickets_by_status = [
        {"name": "open", "count": open_count},
        {"name": "in_progress", "count": in_progress_count},
        {"name": "pending", "count": pending_count},
        {"name": "resolved", "count": resolved_count},
        {"name": "closed", "count": closed_count},
    ]

    # 3. Department Breakdown
    dept_query = (
        select(Department.name, sa_func.count())
        .select_from(Ticket)
        .join(Department, Ticket.department_id == Department.id)
        .where(*filters)
        .group_by(Department.name)
    )
    dept_rows = (await db.execute(dept_query)).all()
    tickets_by_category = [{"name": r[0], "count": r[1]} for r in dept_rows]

    # 4. CSAT (Average Rating)
    csat_query = (
        select(sa_func.avg(TicketRating.rating))
        .select_from(TicketRating)
        .join(Ticket, TicketRating.ticket_id == Ticket.id)
        .where(*filters)
    )
    csat_val = (await db.execute(csat_query)).scalar()
    csat = round(float(csat_val), 1) if csat_val is not None else None

    # 5. Agent Performance
    agent_query = (
        select(
            User.id,
            User.email,
            sa_func.sum(case((Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]), 1), else_=0)),
            sa_func.sum(case((Ticket.status == TicketStatus.closed, 1), else_=0)).label("closed_count"),
            sa_func.avg(TicketRating.rating)
        )
        .select_from(Ticket)
        .join(User, Ticket.assigned_agent_id == User.id)
        .outerjoin(TicketRating, TicketRating.ticket_id == Ticket.id)
        .where(
            User.role == UserRole.agent,
            User.must_change_password.is_(False),
            *filters
        )
        .group_by(User.id, User.email)
        .having(sa_func.sum(case((Ticket.status == TicketStatus.closed, 1), else_=0)) > 0)
        .order_by(sa_func.sum(case((Ticket.status == TicketStatus.closed, 1), else_=0)).desc())
    )

    agent_rows = (await db.execute(agent_query)).all()
    
    agent_performance = []
    for row in agent_rows:
        agent_rating_val = row[4]
        agent_rating = round(float(agent_rating_val), 1) if agent_rating_val is not None else None
        agent_performance.append({
            "id": str(row[0]),
            "name": row[1].split('@')[0],
            "unresolved_count": int(row[2] or 0),
            "closed_count": int(row[3] or 0),
            "avg_time": "1h",
            "rating": agent_rating
        })

    return {
        "total_tickets": total_tickets,
        "total_tickets_trend": total_tickets_trend,
        "avg_response_label": "1h 30m",
        "avg_response_trend": 0.0,
        "resolved_count": resolved_count,
        "closed_count": closed_count,
        "open_count": open_count,
        "sla_compliance": {
            "csat": csat
        },
        "tickets_by_category": tickets_by_category,
        "tickets_by_status": tickets_by_status,
        "agent_performance": agent_performance
    }

@router.get("/analytics/agent")
async def get_agent_analytics(
    date_range: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
):
    """Analytics for an individual agent based on tickets assigned to them."""
    now = datetime.now()
    filters = _build_date_filters(
        date_range, start_date, end_date, [Ticket.assigned_agent_id == current_user.id]
    )

    # 1. Total Assigned Tickets
    total_query = select(sa_func.count()).select_from(Ticket).where(*filters)
    total_tickets = (await db.execute(total_query)).scalar() or 0

    # 2. Status Breakdown
    status_query = (
        select(Ticket.status, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.status)
    )

    status_rows = (await db.execute(status_query)).all()
    status_counts = {k.name if hasattr(k, "name") else str(k): v for k, v in status_rows}

    open_count = status_counts.get("open", 0)
    in_progress_count = status_counts.get("in_progress", 0)
    pending_count = status_counts.get("pending", 0)
    resolved_count = status_counts.get("resolved", 0)
    closed_count = status_counts.get("closed", 0)

    tickets_by_status = [
        {"name": "open", "count": open_count},
        {"name": "in_progress", "count": in_progress_count},
        {"name": "pending", "count": pending_count},
        {"name": "resolved", "count": resolved_count},
        {"name": "closed", "count": closed_count},
    ]


    # 3. Priority Breakdown
    priority_query = (
        select(Ticket.priority, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.priority)
    )
    priority_rows = (await db.execute(priority_query)).all()
    priority_counts = {k.name if hasattr(k, "name") else str(k): v for k, v in priority_rows if k is not None}
    tickets_by_priority = [
        {"name": "high", "count": priority_counts.get("high", 0)},
        {"name": "medium", "count": priority_counts.get("medium", 0)},
        {"name": "low", "count": priority_counts.get("low", 0)},
    ]


    # 4. Department Breakdown
    dept_query = (
        select(Department.name, sa_func.count())
        .select_from(Ticket)
        .join(Department, Ticket.department_id == Department.id)
        .where(*filters)
        .group_by(Department.name)
    )
    dept_rows = (await db.execute(dept_query)).all()
    tickets_by_category = [{"name": r[0], "count": r[1]} for r in dept_rows]

    # 5. CSAT & Feedback Count for this Agent
    csat_query = (
        select(sa_func.avg(TicketRating.rating), sa_func.count(TicketRating.id))
        .select_from(TicketRating)
        .join(Ticket, TicketRating.ticket_id == Ticket.id)
        .where(Ticket.assigned_agent_id == current_user.id)
    )
    csat_res = (await db.execute(csat_query)).first()
    csat_val = csat_res[0] if csat_res else None
    csat_count = csat_res[1] if csat_res else 0
    csat = round(float(csat_val), 1) if csat_val is not None else None

    # 6. Resolution Rate
    resolved_and_closed = resolved_count + closed_count
    resolution_rate = round((resolved_and_closed / total_tickets * 100), 1) if total_tickets > 0 else 0.0

    # 7. Recent Resolved Tickets by this Agent
    recent_query = (
        select(Ticket.id, Ticket.subject, Ticket.status, Ticket.updated_at, TicketRating.rating, TicketRating.feedback)
        .select_from(Ticket)
        .outerjoin(TicketRating, TicketRating.ticket_id == Ticket.id)
        .where(Ticket.assigned_agent_id == current_user.id, Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]))
        .order_by(Ticket.updated_at.desc())
        .limit(5)
    )
    recent_rows = (await db.execute(recent_query)).all()
    recent_activity = [
        {
            "id": str(r[0]),
            "subject": r[1],
            "status": r[2].name if hasattr(r[2], "name") else str(r[2]),
            "resolved_at": r[3].isoformat() if r[3] else None,
            "rating": r[4],
            "feedback": r[5],
        }
        for r in recent_rows
    ]

    return {
        "agent_name": current_user.email.split("@")[0],
        "agent_email": current_user.email,
        "total_tickets": total_tickets,
        "open_count": open_count,
        "in_progress_count": in_progress_count,
        "pending_count": pending_count,
        "resolved_count": resolved_count,
        "closed_count": closed_count,
        "active_count": open_count + in_progress_count + pending_count,
        "resolution_rate": resolution_rate,
        "avg_response_label": "45m",
        "sla_compliance": {
            "csat": csat,
            "ratings_count": csat_count,
        },
        "tickets_by_status": tickets_by_status,
        "tickets_by_priority": tickets_by_priority,
        "tickets_by_category": tickets_by_category,
        "recent_activity": recent_activity,
    }

@router.post("/{ticket_id}/rate", response_model=TicketRatingRead, status_code=201)
async def rate_ticket(
    ticket_id: UUID, 
    payload: TicketRatingCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Verify ticket belongs to customer and is resolved/closed
    ticket = await crud.get(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")
    if ticket.status not in (TicketStatus.resolved, TicketStatus.closed):
        raise HTTPException(400, "Can only rate resolved or closed tickets")
        
    # Check if already rated
    existing = (await db.execute(select(TicketRating).where(TicketRating.ticket_id == ticket_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Ticket already rated")
        
    rating = TicketRating(
        ticket_id=ticket_id,
        rating=payload.rating,
        feedback=payload.feedback
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)
    return rating

@router.post("/{ticket_id}/attachments", response_model=list[AttachmentRead], status_code=201)
async def upload_attachments(
    ticket_id: UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = await crud.get(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")

    saved_attachments: list[AttachmentRead] = []

    for file in files:
        if not file.filename:
            continue

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            allowed_list_str = ", ".join(sorted(ALLOWED_EXTENSIONS))
            raise HTTPException(
                400,
                f"File '{file.filename}' has unsupported extension '{ext}'. Allowed extensions are: {allowed_list_str}",
            )

        safe_orig_name = _sanitize_filename(file.filename)
        unique_prefix = uuid_pkg.uuid4().hex[:8]
        disk_filename = f"{unique_prefix}_{safe_orig_name}"
        storage_path = f"{ticket_id}/{disk_filename}"

        # 1. Read file bytes and validate max size
        content = await file.read()
        file_size = len(content)
        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                400,
                f"File '{file.filename}' exceeds maximum allowed size of 5 MB.",
            )

        # 2. Upload to Supabase Storage
        content_type = file.content_type or "application/octet-stream"
        try:
            await run_in_threadpool(
                supabase_admin.storage.from_(STORAGE_BUCKET).upload,
                storage_path,
                content,
                {"content-type": content_type},
            )
        except Exception as exc:
            logger.exception("Failed to upload %s to Supabase Storage: %s", storage_path, exc)
            raise HTTPException(500, f"Failed to upload file '{file.filename}' to storage: {exc}")

        # 3. Create attachment record in DB
        attachment_id = uuid_pkg.uuid4()
        formatted_sz = _format_size(file_size)

        try:
            db_att = Attachment(
                id=attachment_id,
                ticket_id=ticket_id,
                filename=disk_filename,
                original_filename=file.filename,
                content_type=file.content_type,
                file_size=file_size,
            )
            db.add(db_att)
            await db.commit()
            await db.refresh(db_att)

            signed_url = await _get_signed_url_safe(ticket_id, disk_filename)
            saved_attachments.append(
                AttachmentRead(
                    id=db_att.id,
                    ticket_id=ticket_id,
                    filename=disk_filename,
                    name=file.filename,
                    url=signed_url,
                    content_type=file.content_type,
                    size=formatted_sz,
                    file_size=file_size,
                    size_formatted=formatted_sz,
                    created_at=db_att.created_at,
                )
            )
        except Exception as exc:
            await db.rollback()
            # Clean up uploaded storage object if DB insert fails
            try:
                await run_in_threadpool(
                    supabase_admin.storage.from_(STORAGE_BUCKET).remove,
                    [storage_path],
                )
            except Exception:
                pass
            logger.exception("Database error while saving attachment for ticket %s: %s", ticket_id, exc)
            raise HTTPException(500, f"Failed to record attachment '{file.filename}' in database")

    return saved_attachments

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
    ticket = await crud.get(db, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role == UserRole.customer and ticket.customer_id != current_user.id:
        raise HTTPException(403, "Not allowed")

    safe_name = os.path.basename(filename)
    signed_url = await _get_signed_url_safe(ticket_id, safe_name, expires_in=300)

    # Redirect client directly to the fast, temporary CDN signed link
    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return RedirectResponse(url=signed_url, status_code=307)

    # Fallback: stream file bytes directly from Supabase Storage
    try:
        storage_path = f"{ticket_id}/{safe_name}"
        file_bytes = await run_in_threadpool(
            supabase_admin.storage.from_(STORAGE_BUCKET).download,
            storage_path,
        )
        return Response(
            content=file_bytes,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )
    except Exception:
        raise HTTPException(404, "Attachment file not found in storage")

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


@router.put("/{ticket_id}", response_model=TicketRead, dependencies=[Depends(require_role(UserRole.admin, UserRole.agent))])
async def update_ticket(ticket_id: UUID, payload: TicketUpdate, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, ticket_id)
    if not obj:
        raise HTTPException(404, "Ticket not found")
    updated = await crud.update(db, obj, payload.model_dump(exclude_unset=True))

    # Fetch joined data for response
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

    attachments = await _get_ticket_attachments(updated.id, db)
    return _ticket_to_read(updated, customer_email, sla_due_at, attachments)


@router.delete("/{ticket_id}", status_code=204, dependencies=[Depends(require_role(UserRole.admin))])
async def delete_ticket(ticket_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, ticket_id)
    if not obj:
        raise HTTPException(404, "Ticket not found")
    await crud.delete(db, obj)