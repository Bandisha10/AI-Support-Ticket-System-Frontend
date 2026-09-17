import logging
import secrets
import string
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.core import mailer
from backend.app.core.roles import is_company_domain
from backend.app.core.supabase_client import supabase_admin
from backend.app.crud.base import CRUDBase
from backend.app.database import get_db
from backend.app.dependencies import require_role
from backend.app.models.department import Department
from backend.app.models.enums import UserRole
from backend.app.models.user import User
from backend.app.schemas.user import AgentInvite, AgentInviteResponse, UserRead, UserUpdate

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


@router.post("/invite-agent", response_model=AgentInviteResponse, status_code=201)
@router.post(
    "/invite",
    response_model=AgentInviteResponse,
    status_code=201,
    include_in_schema=False,
)
async def invite_agent(
    payload: AgentInvite,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    """Create (or re-invite) a support agent and email them their credentials."""
    email = str(payload.email).strip().lower()

    if not is_company_domain(email):
        raise HTTPException(400, "Invalid user domain name")

    department = await db.get(Department, payload.department_id)
    if not department:
        raise HTTPException(400, "Department not found")

    temp_password = generate_temp_password()
    created_auth_user = False
    reinvited = False

    # 1) Supabase Auth ----------------------------------------------------
    try:
        res = await run_in_threadpool(
            supabase_admin.auth.admin.create_user,
            {
                "email": email,
                "password": temp_password,
                "email_confirm": True,  # skip the confirm-email round trip
                "user_metadata": {
                    "role": "agent",
                    "department": department.name,
                    "first_name": payload.first_name,
                    "last_name": payload.last_name,
                },
            },
        )
        auth_user = getattr(res, "user", None)
        if not auth_user:
            raise HTTPException(502, "Supabase returned no user for the new agent")
        auth_user_id = str(auth_user.id)
        created_auth_user = True
    except HTTPException:
        raise
    except Exception as exc:
        existing_id = await run_in_threadpool(_find_auth_user_id_by_email, email)
        if not existing_id:
            raise HTTPException(400, f"Could not create the agent in Supabase Auth: {exc}")
        # Address already exists -> treat this as a re-invite: rotate the
        # temporary password on the existing auth account.
        try:
            await run_in_threadpool(
                supabase_admin.auth.admin.update_user_by_id,
                existing_id,
                {"password": temp_password, "email_confirm": True},
            )
        except Exception as inner_exc:
            raise HTTPException(
                400,
                "Agent already exists in Supabase Auth but the temporary password "
                f"could not be reset: {inner_exc}",
            )
        auth_user_id = existing_id
        reinvited = True

    # 2) public.users -----------------------------------------------------
    now = datetime.now(timezone.utc)
    try:
        result = await db.execute(select(User).where(User.email == email))
        profile = result.scalar_one_or_none()
        if profile is None:
            profile = await db.get(User, UUID(auth_user_id))
        elif str(profile.id) != auth_user_id:
            raise HTTPException(
                409,
                f"A profile for {email} already exists with id {profile.id}, but "
                f"Supabase Auth has {auth_user_id}. Delete the stale user in "
                "Settings (or Supabase Auth) and invite again.",
            )

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
            if is_super_admin(profile):
                raise HTTPException(403, "The seeded Super Admin cannot be re-invited")
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
            await _delete_auth_user_quietly(auth_user_id)
        raise
    except Exception:
        await db.rollback()
        logger.exception("Failed to persist invited agent %s", email)
        if created_auth_user:
            # Never leave an auth.users row without its public.users twin.
            await _delete_auth_user_quietly(auth_user_id)
        raise HTTPException(500, "Agent created in Auth but the profile write failed")

    # 3) Brevo email ------------------------------------------------------
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
        else "Agent created, but the invitation email could not be sent. "
             "Share the temporary password below manually."
    )
    return AgentInviteResponse(
        user=UserRead.model_validate(profile),
        department_name=department.name,
        email_sent=email_sent,
        reinvited=reinvited,
        detail=detail,
        temporary_password=None if email_sent else temp_password,
    )


async def _delete_auth_user_quietly(auth_user_id: str) -> None:
    try:
        await run_in_threadpool(supabase_admin.auth.admin.delete_user, auth_user_id)
    except Exception:
        logger.exception("Failed to clean up auth user %s", auth_user_id)


@router.get("/", response_model=list[UserRead], dependencies=[Depends(require_role(UserRole.admin))])
async def list_users(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User)
        .where(User.email != SUPER_ADMIN_EMAIL)
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
async def update_user(user_id: UUID, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be changed")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return obj

    # Role/department validation only applies when one of them is being changed.
    # (Previously next_role was read even for an is_active-only payload, which
    # raised UnboundLocalError -> 500.)
    if "role" in updates or "department_id" in updates:
        next_role = updates.get("role", obj.role)
        next_department_id = updates.get("department_id", obj.department_id)

        if next_role == UserRole.admin:
            if not next_department_id:
                raise HTTPException(400, "Admins must be assigned to the Administration department")
            department = await db.get(Department, next_department_id)
            if not department:
                raise HTTPException(400, "Department not found")
            if not department.name.strip().lower().startswith("administration"):
                raise HTTPException(400, "Only the Administration department can assign admin role")
            updates["department_id"] = next_department_id
        elif next_role == UserRole.agent:
            if not next_department_id:
                raise HTTPException(400, "Agents must be assigned to a department")
            department = await db.get(Department, next_department_id)
            if not department:
                raise HTTPException(400, "Department not found")
            if department.name.strip().lower().startswith("administration"):
                updates["role"] = UserRole.admin
            else:
                updates["role"] = UserRole.agent
            updates["department_id"] = next_department_id
        else:
            raise HTTPException(400, "Role management only supports Admin or Agent + Department")

    return await crud.update(db, obj, updates)


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_role(UserRole.admin))])
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    obj = await crud.get(db, user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if is_super_admin(obj):
        raise HTTPException(403, "The seeded Super Admin cannot be changed")

    await crud.delete(db, obj)
    # Drop the Supabase Auth account too, otherwise auth.users keeps a row that
    # can still authenticate and then 404s on every endpoint.
    await _delete_auth_user_quietly(str(user_id))