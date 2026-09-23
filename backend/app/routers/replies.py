from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.database import get_db
from backend.app.models.reply import Reply
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.models.enums import UserRole
from backend.app.schemas.reply import ReplyCreate, ReplyRead
from backend.app.crud.base import CRUDBase
from backend.app.dependencies import get_current_user, require_role

router = APIRouter(prefix="/replies", tags=["Replies"])
crud = CRUDBase(Reply)

@router.post("/", response_model=ReplyRead, status_code=201)
async def create_reply(payload: ReplyCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # --- RBAC: Load ticket and verify access ---
    ticket = (await db.execute(
        select(Ticket).where(Ticket.id == payload.ticket_id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    # Customers can only reply to their own tickets
    if current_user.role == UserRole.customer:
        if ticket.customer_id != current_user.id:
            raise HTTPException(403, "Not allowed to reply to this ticket")

    # Agents can only reply to tickets in their department or assigned to them
    elif current_user.role == UserRole.agent:
        is_in_dept = (ticket.department_id is None) or (current_user.department_id is None) or (ticket.department_id == current_user.department_id)
        is_assigned = (ticket.assigned_agent_id is None) or (ticket.assigned_agent_id == current_user.id)
        if not (is_in_dept or is_assigned):
            raise HTTPException(403, "Ticket is not assigned to you or your department")

    data = payload.model_dump()
    data["author_id"] = current_user.id
    if current_user.role == UserRole.customer:
        # Force-override: customers never set internal notes or auto-reply flags
        data["is_internal_note"] = False
        data["is_auto_reply"] = False
    new_reply = await crud.create(db, data)
    return ReplyRead(
        id=new_reply.id,
        ticket_id=new_reply.ticket_id,
        author_id=new_reply.author_id,
        author_email=current_user.email,
        is_auto_reply=new_reply.is_auto_reply,
        is_internal_note=new_reply.is_internal_note,
        body=new_reply.body,
        created_at=new_reply.created_at,
    )

@router.get("/ticket/{ticket_id}", response_model=list[ReplyRead])
async def list_replies_for_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Reply, User.email.label("author_email"))
        .outerjoin(User, Reply.author_id == User.id)
        .where(Reply.ticket_id == ticket_id)
    )
    if current_user.role == UserRole.customer:
        query = query.where(Reply.is_internal_note.is_(False))
    query = query.order_by(Reply.created_at)
    result = await db.execute(query)
    rows = result.all()
    replies = []
    for r, author_email in rows:
        replies.append(
            ReplyRead(
                id=r.id,
                ticket_id=r.ticket_id,
                author_id=r.author_id,
                author_email=author_email,
                is_auto_reply=r.is_auto_reply,
                is_internal_note=r.is_internal_note,
                body=r.body,
                created_at=r.created_at,
            )
        )
    return replies

@router.get("/{reply_id}", response_model=ReplyRead, dependencies=[Depends(get_current_user)])
async def get_reply(reply_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, reply_id)
    if not obj:
        raise HTTPException(404, "Reply not found")
    return obj

@router.delete("/{reply_id}", status_code=204, dependencies=[Depends(require_role(UserRole.admin))])
async def delete_reply(reply_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, reply_id)
    if not obj:
        raise HTTPException(404, "Reply not found")
    await crud.delete(db, obj)