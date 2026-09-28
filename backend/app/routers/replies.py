"""
Replies Router.
Delegates authorization and reply creation to reply_service.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.crud.base import CRUDBase
from backend.app.database import get_db
from backend.app.dependencies import get_current_user, require_role
from backend.app.models.enums import UserRole
from backend.app.models.reply import Reply
from backend.app.models.user import User
from backend.app.schemas.reply import ReplyCreate, ReplyRead
from backend.app.services import reply_service

router = APIRouter(prefix="/replies", tags=["Replies"])
crud = CRUDBase(Reply)


@router.post("/", response_model=ReplyRead, status_code=201)
async def create_reply(
    payload: ReplyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await reply_service.create_reply_workflow(payload, db, current_user)


@router.get("/ticket/{ticket_id}", response_model=list[ReplyRead])
async def list_replies_for_ticket(
    ticket_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await reply_service.get_replies_for_ticket(ticket_id, db, current_user)


@router.get(
    "/{reply_id}",
    response_model=ReplyRead,
    dependencies=[Depends(get_current_user)],
)
async def get_reply(reply_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, reply_id)
    if not obj:
        raise HTTPException(404, "Reply not found")
    return obj


@router.delete(
    "/{reply_id}",
    status_code=204,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def delete_reply(reply_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, reply_id)
    if not obj:
        raise HTTPException(404, "Reply not found")
    await crud.delete(db, obj)
