import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, func as sa_func

from backend.app.core import mailer
from backend.app.core.roles import is_company_domain
from backend.app.core.supabase_client import supabase_admin
from backend.app.crud.base import CRUDBase
from backend.app.database import get_db
from backend.app.dependencies import get_current_user, require_role
from backend.app.models.department import Department
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.models.enums import AgentTier, UserRole, TicketStatus
from backend.app.services import user_service
from backend.app.schemas.user import (
    AgentInvite,
    AgentInviteResponse,
    UserRead,
    UserUpdate,
    AgentAvailabilityUpdate,
    DepartmentTeamMemberRead,
)
from backend.app.services.manager_service import (
    validate_single_department_manager,
    reroute_agent_tickets_on_absence,
    reroute_manager_tickets_on_demotion,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])
crud = CRUDBase(User)

SUPER_ADMIN_EMAIL = "admin@test.com"

def is_super_admin(user: User) -> bool:
    return user.email.strip().lower() == SUPER_ADMIN_EMAIL

_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_LOWER = "abcdefghjkmnpqrstuvwxyz"
_DIGITS = "23456789"
_PW_SYMBOLS = "!@#$%*"

def generate_temp_password(length: int = 10) -> str:
    """Generate a clean, unambiguous temporary password (between 8 and 16 characters)."""
    length = max(8, min(length, 16))
    pools = (_UPPER, _LOWER, _DIGITS, _PW_SYMBOLS)
    alphabet = "".join(pools)
    # Guarantee at least 1 from each pool to satisfy password complexity rules
    chars = [secrets.choice(p) for p in pools]
    chars += [secrets.choice(alphabet) for _ in range(length - len(pools))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _find_auth_user_id_by_email(email: str) -> str | None:
    """Page through Supabase Auth looking for an existing account.
    Needed because `create_user` fails when the address already exists in
    auth.users, and the Table Editor never shows that schema.
    """
    target = email.strip().lower()
    for page in range(1, 26):
        try:
            res = supabase_admin.auth.admin.list_users(page=page, per_page=200)
        except TypeError:  # older gotrue signature
            res = supabase_admin.auth.admin.list_users()
        users = getattr(res, "users", res) or []
        for candidate in users:
            if (getattr(candidate, "email", "") or "").strip().lower() == target:
                return str(candidate.id)
        if len(users) < 200:
            break
    return None


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


async def _delete_auth_user_quietly(auth_user_id: str) -> None:
    try:
        await run_in_threadpool(supabase_admin.auth.admin.delete_user, auth_user_id)
    except Exception:
        logger.exception("Failed to clean up auth user %s", auth_user_id)


@router.get("/", response_model=list[UserRead], dependencies=[Depends(require_role(UserRole.admin))])
async def list_users(
    skip: int = 0, 
    limit: int = 100, 
    includes_archived: bool = False,
    db: AsyncSession = Depends(get_db)):
    query=select(User).where(User.email!=SUPER_ADMIN_EMAIL)
    if not includes_archived:
        query=query.where(User.is_archive.is_(False))
    result = await db.execute(
        query
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserRead, dependencies=[Depends(require_role(UserRole.admin))])
async def get_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, user_id)
    if not obj or is_super_admin(obj):
        raise HTTPException(404, "User not found")
    return obj


@router.put("/{user_id}", response_model=UserRead, dependencies=[Depends(require_role(UserRole.admin))])
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be changed")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return obj

    target_tier = updates.get("agent_tier", obj.agent_tier)
    target_dept = updates.get("department_id", obj.department_id)
    promoted_to_manager = (
        target_tier == AgentTier.manager and obj.agent_tier != AgentTier.manager
    )
    existing_manager = None
    handover_count = 0

    if target_tier == AgentTier.manager:
        if not target_dept:
            raise HTTPException(400, "A Department Manager must be assigned to a valid department")
        # Automatic Manager Succession: if another active manager exists in this department,
        # step them down to regular agent and hand over their tickets directly to the new manager.
        query = select(User).where(
            User.department_id == target_dept,
            User.role == UserRole.agent,
            User.agent_tier == AgentTier.manager,
            User.is_active.is_(True),
            User.is_archive.is_(False),
            User.id != obj.id,
        )
        existing_manager = (await db.execute(query)).scalars().first()
        if existing_manager:
            existing_manager.agent_tier = AgentTier.regular
            await db.flush()
            handover_count = await reroute_manager_tickets_on_demotion(db, existing_manager, new_manager=obj)

    was_active = obj.is_active

    # Role / Department validation
    if "role" in updates or "department_id" in updates:
        next_role = updates.get("role", obj.role)
        next_department_id = updates.get("department_id", obj.department_id)

        if next_role == UserRole.admin:
            if next_department_id:
                dept = await db.get(Department, next_department_id)
                if not dept:
                    raise HTTPException(400, "Department not found")
            updates["role"] = UserRole.admin
            updates["department_id"] = next_department_id
        elif next_role == UserRole.agent:
            if not next_department_id:
                raise HTTPException(400, "Agents must be assigned to a department")
            dept = await db.get(Department, next_department_id)
            if not dept:
                raise HTTPException(400, "Department not found")
            updates["role"] = UserRole.agent
            updates["department_id"] = next_department_id
        elif next_role == UserRole.customer:
            updates["role"] = UserRole.customer
            updates["department_id"] = None

    was_manager = (obj.role == UserRole.agent and obj.agent_tier == AgentTier.manager)
    old_dept_id = obj.department_id
    updated = await crud.update(db, obj, updates)

    # Resolve department name for email notifications
    dept_name = "General Department"
    effective_dept_id = updated.department_id or target_dept
    if effective_dept_id:
        dept_obj = await db.get(Department, effective_dept_id)
        if dept_obj:
            dept_name = dept_obj.name

    # 1. If an existing manager was demoted during succession
    if existing_manager:
        new_mgr_label = (
            f"{updated.first_name} {updated.last_name}".strip()
            if updated.first_name
            else updated.email
        )
        try:
            await run_in_threadpool(
                mailer.send_manager_demoted_email,
                agent_email=existing_manager.email,
                agent_name=existing_manager.first_name,
                department_name=dept_name,
                new_manager_name=new_mgr_label,
                reassigned_ticket_count=handover_count,
            )
        except Exception as exc:
            logger.warning("Failed to send demotion email to previous manager: %s", exc)

    # 2. If the user was promoted/assigned as Manager
    if promoted_to_manager and updated.agent_tier == AgentTier.manager:
        assigned_by = (
            f"{current_user.first_name} {current_user.last_name}".strip()
            if current_user.first_name
            else (current_user.email or "Administrator")
        )
        try:
            await run_in_threadpool(
                mailer.send_manager_assigned_email,
                manager_email=updated.email,
                manager_name=updated.first_name,
                department_name=dept_name,
                assigned_by_name=assigned_by,
                reassigned_ticket_count=handover_count,
            )
        except Exception as exc:
            logger.warning("Failed to send manager assigned email: %s", exc)

    # 3. If Manager was demoted to regular agent directly (not via succession)
    is_demoted = was_manager and (
        updated.role != UserRole.agent or updated.agent_tier != AgentTier.manager
    )
    if is_demoted and not existing_manager:
        demoted_handover_count = await reroute_manager_tickets_on_demotion(db, obj)
        try:
            await run_in_threadpool(
                mailer.send_manager_demoted_email,
                agent_email=updated.email,
                agent_name=updated.first_name,
                department_name=dept_name,
                new_manager_name=None,
                reassigned_ticket_count=demoted_handover_count,
            )
        except Exception as exc:
            logger.warning("Failed to send demotion email: %s", exc)

    # 4. If agent transferred departments, handover old department tickets
    if obj.role == UserRole.agent and updates.get("department_id") and updates["department_id"] != old_dept_id:
        temp_user = User(
            id=obj.id,
            email=obj.email,
            department_id=old_dept_id,
            first_name=obj.first_name,
            role=UserRole.agent,
        )
        await reroute_agent_tickets_on_absence(
            db, temp_user, reason="Agent transferred to another department"
        )

    # 5. If agent was marked inactive
    if was_active and not updated.is_active and updated.role == UserRole.agent:
        await reroute_agent_tickets_on_absence(db, updated, reason="Agent marked inactive by Administrator")

    return updated


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_role(UserRole.admin))])
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Soft-delete (archive) the user and reroute their active tickets."""
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be deleted or archived")

    obj.is_archive = True
    obj.is_active = False
    if obj.role == UserRole.agent:
        await reroute_agent_tickets_on_absence(db, obj, reason="Agent deleted/archived by Administrator")
    await db.commit()
    await _delete_auth_user_quietly(str(user_id))

@router.post("/{user_id}/archive", response_model=UserRead, dependencies=[Depends(require_role(UserRole.admin))])
async def archive_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be archived")

    obj.is_archive = True
    obj.is_active = False
    if obj.role == UserRole.agent:
        await reroute_agent_tickets_on_absence(db, obj, reason="Agent archived by Administrator")
    await db.commit()
    await db.refresh(obj)
    await _delete_auth_user_quietly(str(user_id))
    return obj

@router.post("/{user_id}/unarchive", response_model=UserRead, dependencies=[Depends(require_role(UserRole.admin))])
async def unarchive_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be modified")

    obj.is_archive = False
    # Note: account remains inactive until admin explicitly re-activates it
    await db.commit()
    await db.refresh(obj)
    return obj

@router.patch("/{user_id}/availability", response_model=UserRead)
async def update_agent_availability(
    user_id: UUID,
    payload: AgentAvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allows Admins or Department Managers to toggle agent availability."""
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(404, "User not found")

    is_admin = current_user.role == UserRole.admin
    is_manager = (
        current_user.role == UserRole.agent
        and getattr(current_user, "agent_tier", None) == AgentTier.manager
    )

    if not is_admin:
        if not is_manager:
            raise HTTPException(403, "Only Admins and Managers can modify agent availability")
        if target_user.department_id != current_user.department_id:
            raise HTTPException(403, "Managers can only manage agents within their own department")
        if target_user.id == current_user.id:
            raise HTTPException(400, "Managers cannot set themselves inactive via team panel")
        if target_user.role != UserRole.agent or target_user.agent_tier == AgentTier.manager:
            raise HTTPException(403, "Managers cannot modify other managers or admins")

    was_active = target_user.is_active
    target_user.is_active = payload.is_active
    await db.commit()
    await db.refresh(target_user)

    if was_active and not target_user.is_active:
        actor = f"Manager {current_user.email}" if is_manager else "Administrator"
        await reroute_agent_tickets_on_absence(db, target_user, reason=f"Agent marked off-duty by {actor}")

    return target_user


@router.get("/department/team", response_model=list[DepartmentTeamMemberRead])
async def list_department_team(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all agents in the current user's department with active ticket counts."""
    is_manager = (
        current_user.role == UserRole.agent
        and getattr(current_user, "agent_tier", None) == AgentTier.manager
    )
    if not is_manager and current_user.role != UserRole.admin:
        raise HTTPException(403, "Only Managers and Admins can view department team members")

    dept_id = current_user.department_id
    if not dept_id:
        return []

    # Subquery to count active (open / in_progress / pending) tickets per agent
    active_subq = (
        select(Ticket.assigned_agent_id, sa_func.count(Ticket.id).label("ticket_count"))
        .where(Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]))
        .group_by(Ticket.assigned_agent_id)
        .subquery()
    )

    query = (
        select(
            User,
            sa_func.coalesce(active_subq.c.ticket_count, 0).label("active_tickets_count"),
        )
        .outerjoin(active_subq, User.id == active_subq.c.assigned_agent_id)
        .where(
            User.department_id == dept_id,
            User.role == UserRole.agent,
            User.is_archive.is_(False),
        )
        .order_by(User.first_name.asc())
    )

    rows = (await db.execute(query)).all()
    members = []
    for user_obj, count in rows:
        setattr(user_obj, "active_tickets_count", int(count or 0))
        members.append(DepartmentTeamMemberRead.model_validate(user_obj))
    return members