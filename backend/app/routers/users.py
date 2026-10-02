"""
Users Router.
Clean HTTP controller delegating user management and availability to user_service.
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_db
from backend.app.dependencies import get_current_user, require_role
from backend.app.models.enums import AgentTier, UserRole
from backend.app.models.user import User
from backend.app.schemas.user import (
    AgentAvailabilityUpdate,
    AgentInvite,
    AgentInviteResponse,
    DepartmentTeamMemberRead,
    UserRead,
    UserUpdate,
)
from backend.app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])

@router.post(
    "/invite-agent",
    response_model=AgentInviteResponse,
    status_code=201,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def invite_agent(
    payload: AgentInvite,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Invite and provision a new agent."""
    return await user_service.invite_agent_workflow(payload, db, admin)


@router.get(
    "/",
    response_model=list[UserRead],
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    includes_archived: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await user_service.list_users_workflow(
        db=db, skip=skip, limit=limit, includes_archived=includes_archived
    )


@router.get(
    "/{user_id}",
    response_model=UserRead,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def get_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    return await user_service.get_user_workflow(user_id, db)


@router.put(
    "/{user_id}",
    response_model=UserRead,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await user_service.update_user_workflow(
        user_id, payload, db, current_user
    )


@router.delete(
    "/{user_id}",
    status_code=204,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    await user_service.archive_user_workflow(user_id, db)


@router.post(
    "/{user_id}/archive",
    response_model=UserRead,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def archive_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    return await user_service.archive_user_workflow(user_id, db)


@router.post(
    "/{user_id}/unarchive",
    response_model=UserRead,
    dependencies=[Depends(require_role(UserRole.admin))],
)
async def unarchive_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    return await user_service.unarchive_user_workflow(user_id, db)


@router.patch("/{user_id}/availability", response_model=UserRead)
async def update_agent_availability(
    user_id: UUID,
    payload: AgentAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await user_service.update_agent_availability_workflow(
        user_id=user_id,
        is_active=payload.is_active,
        db=db,
        current_user=current_user,
    )


@router.get("/department/team", response_model=list[DepartmentTeamMemberRead])
async def list_department_team(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_manager = (
        current_user.role == UserRole.agent
        and getattr(current_user, "agent_tier", None) == AgentTier.manager
    )
    if not is_manager and current_user.role != UserRole.admin:
        raise HTTPException(
            403, "Only Managers and Admins can view department team members"
        )

    dept_id = current_user.department_id
    if not dept_id:
        return []

    return await user_service.get_department_team_workflow(dept_id, db)
