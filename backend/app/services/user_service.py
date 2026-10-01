"""
User Management Service Module.
Handles staff invitations, manager succession, role updates, ticket rerouting on absence,
availability toggles, and archiving workflows.
"""
import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.core import mailer
from backend.app.core.supabase_client import supabase_admin
from backend.app.crud.base import CRUDBase
from backend.app.models.department import Department
from backend.app.models.enums import AgentTier, TicketStatus, UserRole
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.schemas.user import (
    AgentInvite,
    AgentInviteResponse,
    DepartmentTeamMemberRead,
    UserRead,
    UserUpdate,
)
from backend.app.services.manager_service import (
    reroute_agent_tickets_on_absence,
    reroute_manager_tickets_on_demotion,
    validate_single_department_manager,
)

logger = logging.getLogger(__name__)
user_crud = CRUDBase(User)

SUPER_ADMIN_EMAIL = "admin@test.com"

def generate_temp_password(length: int = 16) -> str:
    """Generates a temporary password meeting complexity requirements."""
    if length < 4:
        length = 4
    specials = "!@#$%&*"
    chars = [
        secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ"),
        secrets.choice("abcdefghijklmnopqrstuvwxyz"),
        secrets.choice("23456789"),
        secrets.choice(specials),
    ]
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*"
    chars += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)



def is_super_admin(user: User) -> bool:
    """Checks whether a user is the root super admin."""
    return user.email.strip().lower() == SUPER_ADMIN_EMAIL


async def delete_auth_user_quietly(auth_user_id: str) -> None:
    """Removes a user from Supabase auth without raising exceptions."""
    try:
        await run_in_threadpool(supabase_admin.auth.admin.delete_user, auth_user_id)
    except Exception:
        logger.exception("Failed to clean up auth user %s", auth_user_id)


def find_auth_user_id_by_email(email: str) -> str | None:
    """Paginates through Supabase Auth to find existing auth user ID."""
    page = 1
    per_page = 50
    target = email.strip().lower()
    while True:
        res = supabase_admin.auth.admin.list_users(page=page, per_page=per_page)
        users = getattr(res, "users", None) or []
        for u in users:
            if getattr(u, "email", "").strip().lower() == target:
                return str(u.id)
        if len(users) < per_page:
            return None
        page += 1


async def invite_agent_workflow(
    payload: AgentInvite,
    db: AsyncSession,
    admin: User,
) -> AgentInviteResponse:
    """Provisions Supabase Auth account, local profile, and Brevo invite email."""
    email = payload.email.strip().lower()
    department = await db.get(Department, payload.department_id)
    if not department:
        raise HTTPException(400, "Department not found")

    temp_password = f"Ag!{secrets.token_urlsafe(9)}"

    created_auth_user = False
    reinvited = False
    try:
        res = await run_in_threadpool(
            supabase_admin.auth.admin.create_user,
            {
                "email": email,
                "password": temp_password,
                "email_confirm": True,
                "user_metadata": {
                    "first_name": payload.first_name,
                    "last_name": payload.last_name,
                    "role": "agent",
                },
            },
        )
        auth_user_id = str(res.user.id)
        created_auth_user = True
    except HTTPException:
        raise
    except Exception as exc:
        existing_id = await run_in_threadpool(find_auth_user_id_by_email, email)
        if not existing_id:
            raise HTTPException(
                400, f"Could not create the agent in Supabase Auth: {exc}"
            )
        try:
            await run_in_threadpool(
                supabase_admin.auth.admin.update_user_by_id,
                existing_id,
                {"password": temp_password, "email_confirm": True},
            )
        except Exception as inner_exc:
            raise HTTPException(
                400,
                f"Agent already exists in Supabase Auth but password could not be reset: {inner_exc}",
            )
        auth_user_id = existing_id
        reinvited = True

    now = datetime.now(timezone.utc)
    try:
        result = await db.execute(select(User).where(User.email == email))
        profile = result.scalar_one_or_none()
        if profile is None:
            profile = await db.get(User, UUID(auth_user_id))
        elif str(profile.id) != auth_user_id:
            raise HTTPException(
                409,
                f"A profile for {email} already exists with id {profile.id}, but Supabase Auth has {auth_user_id}.",
            )

        if payload.agent_tier == AgentTier.manager:
            try:
                await validate_single_department_manager(
                    db, department.id, exclude_user_id=profile.id if profile else None
                )
            except ValueError as exc:
                raise HTTPException(400, str(exc))

        if profile is None:
            profile = User(
                id=UUID(auth_user_id),
                email=email,
                password_hash="MANAGED_BY_SUPABASE_AUTH",
                role=UserRole.agent,
                department_id=department.id,
                is_active=True,
                first_name=payload.first_name,
                last_name=payload.last_name,
                agent_tier=payload.agent_tier,
                must_change_password=True,
                invited_at=now,
                invited_by=admin.id,
            )
            db.add(profile)
        else:
            profile.role = UserRole.agent
            profile.department_id = department.id
            profile.first_name = payload.first_name
            profile.last_name = payload.last_name
            profile.agent_tier = payload.agent_tier
            profile.is_active = True
            profile.must_change_password = True
            profile.invited_at = now
            profile.invited_by = admin.id
            reinvited = True

        await db.commit()
        await db.refresh(profile)
    except HTTPException:
        await db.rollback()
        if created_auth_user:
            await delete_auth_user_quietly(auth_user_id)
        raise
    except Exception:
        await db.rollback()
        logger.exception("Failed to persist invited agent %s", email)
        if created_auth_user:
            await delete_auth_user_quietly(auth_user_id)
        raise HTTPException(500, "Agent created in Auth but the profile write failed")

    email_sent = True
    try:
        await run_in_threadpool(
            mailer.send_agent_invite_email,
            to=email,
            temporary_password=temp_password,
            department_name=department.name,
            first_name=payload.first_name,
            last_name=payload.last_name,
            agent_tier=payload.agent_tier,
        )
    except Exception as exc:
        email_sent = False
        logger.warning("Brevo email send failed for %s: %s", email, exc)

    detail = (
        f"Invitation emailed to {email}"
        if email_sent
        else "Agent created, but the invitation email could not be sent. Share password manually."
    )

    return AgentInviteResponse(
        user=UserRead.model_validate(profile),
        department_name=department.name,
        email_sent=email_sent,
        reinvited=reinvited,
        detail=detail,
        temporary_password=None if email_sent else temp_password,
    )


async def update_user_workflow(
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession,
    current_user: User,
) -> User:
    """Updates user roles/tiers, handles manager succession and demotions, and reroutes tickets."""
    obj = await user_crud.get(db, user_id)
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
            raise HTTPException(
                400, "A Department Manager must be assigned to a valid department"
            )
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
            handover_count = await reroute_manager_tickets_on_demotion(
                db, existing_manager, new_manager=obj
            )

    was_active = obj.is_active

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

    was_manager = obj.role == UserRole.agent and obj.agent_tier == AgentTier.manager
    old_dept_id = obj.department_id
    updated = await user_crud.update(db, obj, updates)

    dept_name = "General Department"
    effective_dept_id = updated.department_id or target_dept
    if effective_dept_id:
        dept_obj = await db.get(Department, effective_dept_id)
        if dept_obj:
            dept_name = dept_obj.name

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

    if (
        obj.role == UserRole.agent
        and updates.get("department_id")
        and updates["department_id"] != old_dept_id
    ):
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

    if was_active and not updated.is_active and updated.role == UserRole.agent:
        await reroute_agent_tickets_on_absence(
            db, updated, reason="Agent marked inactive by Administrator"
        )

    return updated


async def archive_user_workflow(user_id: UUID, db: AsyncSession) -> User:
    """Soft-deletes/archives a user and reroutes their assigned tickets."""
    obj = await user_crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be archived")

    obj.is_archive = True
    obj.is_active = False
    if obj.role == UserRole.agent:
        await reroute_agent_tickets_on_absence(
            db, obj, reason="Agent archived by Administrator"
        )
    await db.commit()
    await db.refresh(obj)
    await delete_auth_user_quietly(str(user_id))
    return obj


async def unarchive_user_workflow(user_id: UUID, db: AsyncSession) -> User:
    """Unarchives a user account."""
    obj = await user_crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be modified")

    obj.is_archive = False
    await db.commit()
    await db.refresh(obj)
    return obj


async def update_agent_availability_workflow(
    user_id: UUID,
    is_active: bool,
    db: AsyncSession,
    current_user: User,
) -> User:
    """Allows Admins or Department Managers to toggle agent on-duty status."""
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
            raise HTTPException(
                403, "Only Admins and Managers can modify agent availability"
            )
        if target_user.department_id != current_user.department_id:
            raise HTTPException(
                403, "Managers can only manage agents within their own department"
            )
        if target_user.id == current_user.id:
            raise HTTPException(
                400, "Managers cannot set themselves inactive via team panel"
            )
        if (
            target_user.role != UserRole.agent
            or target_user.agent_tier == AgentTier.manager
        ):
            raise HTTPException(403, "Managers cannot modify other managers or admins")

    was_active = target_user.is_active
    target_user.is_active = is_active
    await db.commit()
    await db.refresh(target_user)

    if was_active and not target_user.is_active:
        actor = f"Manager {current_user.email}" if is_manager else "Administrator"
        await reroute_agent_tickets_on_absence(
            db, target_user, reason=f"Agent marked off-duty by {actor}"
        )

    return target_user


async def get_department_team_workflow(
    dept_id: UUID,
    db: AsyncSession,
) -> list[DepartmentTeamMemberRead]:
    """Retrieves all agents within a department with current unresolved ticket counts."""
    active_subq = (
        select(
            Ticket.assigned_agent_id, sa_func.count(Ticket.id).label("ticket_count")
        )
        .where(Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]))
        .group_by(Ticket.assigned_agent_id)
        .subquery()
    )

    query = (
        select(
            User,
            sa_func.coalesce(active_subq.c.ticket_count, 0).label(
                "active_tickets_count"
            ),
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

async def list_users_workflow(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    includes_archived: bool = False,
) -> list[User]:
    """Fetches non-superadmin users with archive filtering and pagination."""
    query = select(User).where(User.email != SUPER_ADMIN_EMAIL)
    if not includes_archived:
        query = query.where(User.is_archive.is_(False))
    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()


async def get_user_workflow(user_id: UUID, db: AsyncSession) -> User:
    """Fetches a user profile by ID, hiding super admin."""
    obj = await user_crud.get(db, user_id)
    if not obj or is_super_admin(obj):
        raise HTTPException(404, "User not found")
    return obj
