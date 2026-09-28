"""
Reply Service Module.
Handles validation, RBAC checks, internal note visibility, and CRUD operations for ticket replies.
"""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.crud.base import CRUDBase
from backend.app.models.enums import UserRole
from backend.app.models.reply import Reply
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.schemas.reply import ReplyCreate, ReplyRead

reply_crud = CRUDBase(Reply)


async def create_reply_workflow(
    payload: ReplyCreate,
    db: AsyncSession,
    current_user: User,
) -> ReplyRead:
    """Validates ticket access rights and creates a reply or internal note."""
    ticket = (
        await db.execute(select(Ticket).where(Ticket.id == payload.ticket_id))
    ).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    # Customers can only reply to their own tickets
    if current_user.role == UserRole.customer:
        if ticket.customer_id != current_user.id:
            raise HTTPException(403, "Not allowed to reply to this ticket")

    # Agents can only reply to tickets in their department or assigned to them
    elif current_user.role == UserRole.agent:
        is_in_dept = (
            (ticket.department_id is None)
            or (current_user.department_id is None)
            or (ticket.department_id == current_user.department_id)
        )
        is_assigned = (ticket.assigned_agent_id is None) or (
            ticket.assigned_agent_id == current_user.id
        )
        if not (is_in_dept or is_assigned):
            raise HTTPException(403, "Ticket is not assigned to you or your department")

    data = payload.model_dump()
    data["author_id"] = current_user.id
    if current_user.role == UserRole.customer:
        # Force-override: customers cannot write internal notes or mark auto-replies
        data["is_internal_note"] = False
        data["is_auto_reply"] = False

    new_reply = await reply_crud.create(db, data)
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


async def get_replies_for_ticket(
    ticket_id: UUID,
    db: AsyncSession,
    current_user: User,
) -> list[ReplyRead]:
    """Retrieves all replies for a ticket, automatically hiding internal notes from customers."""
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

    return [
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
        for r, author_email in rows
    ]
