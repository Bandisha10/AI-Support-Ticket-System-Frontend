"""
Authentication & Identity Service.
Handles Supabase user registration, authentication verification, session refreshing,
password reset token lifecycle, and credential changes.
"""
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.core import mailer
from backend.app.core.roles import is_company_domain
from backend.app.core.security import (
    TokenExpiredError,
    TokenInvalidError,
    create_password_reset_token,
    verify_password_reset_token,
)
from backend.app.core.supabase_client import make_anon_client, supabase_admin
from backend.app.models.enums import UserRole
from backend.app.models.user import User
from backend.app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignUpRequest,
    TokenResponse,
)
from backend.app.models.department import Department
from backend.app.schemas.user import UserProfileUpdate, UserRead

logger = logging.getLogger(__name__)


def verify_password(email: str, password: str):
    """Confirm user credentials against Supabase Auth and return the auth user."""
    client = make_anon_client()
    try:
        res = client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception:
        return None
    finally:
        try:
            client.auth.sign_out(options={"scope": "local"})
        except Exception:
            pass
    return getattr(res, "user", None)


async def apply_new_password(
    db: AsyncSession, *, auth_user_id: str, email: str, new_password: str
) -> None:
    """Updates the user password in Supabase Auth and updates local change flags."""
    try:
        await run_in_threadpool(
            supabase_admin.auth.admin.update_user_by_id,
            auth_user_id,
            {"password": new_password},
        )
    except Exception as exc:
        logger.warning("Password update rejected for %s: %s", email, exc)
        raise HTTPException(
            400, "Password update rejected. Please try a different password."
        )

    result = await db.execute(select(User).where(User.email == email))
    profile = result.scalar_one_or_none()
    if profile is not None:
        profile.must_change_password = False
        profile.password_changed_at = datetime.now(timezone.utc)
        await db.commit()


async def signup_user_workflow(payload: SignUpRequest, db: AsyncSession) -> dict:
    """Provisions a new customer account in Supabase Auth and mirrors to public.users."""
    if not settings.ALLOW_PUBLIC_SIGNUP:
        raise HTTPException(
            403, "Public signup is disabled. Ask an administrator for an account."
        )
    payload.email = payload.email.strip().lower()

    if is_company_domain(payload.email):
        domain = payload.email.rsplit("@", 1)[-1]
        raise HTTPException(
            403,
            f"User with @{domain} cannot create account here. Agent accounts are created by an administrator.",
        )

    # Check if user already exists in DB
    existing_user = await db.execute(select(User).where(User.email == payload.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    # Pre-check phone uniqueness BEFORE creating account in Supabase
    if payload.phone_number:
        existing_phone = await db.execute(
            select(User).where(User.phone_number == payload.phone_number)
        )
        if existing_phone.scalar_one_or_none():
            raise HTTPException(
                409, "Phone number is already registered with another account"
            )

    user_uuid = None
    try:
        res = await run_in_threadpool(
            supabase_admin.auth.admin.create_user,
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "first_name": payload.first_name,
                    "last_name": payload.last_name,
                },
            },
        )
    except Exception as exc:
        err_str = str(exc).lower()
        if (
            "already registered" in err_str
            or "already exists" in err_str
            or "duplicate" in err_str
        ):
            raise HTTPException(409, "Email already registered")
        logger.exception("Supabase signup error for %s: %s", payload.email, exc)
        raise HTTPException(400, f"Signup failed: {exc}")

    user = res.user
    if not user:
        raise HTTPException(400, "Signup failed")

    user_uuid = UUID(user.id)
    email = user.email or payload.email

    # Check if trigger already created the user row in public.users
    result = await db.execute(select(User).where(User.id == user_uuid))
    profile = result.scalar_one_or_none()

    if profile:
        profile.first_name = payload.first_name
        profile.last_name = payload.last_name
        profile.phone_number = payload.phone_number
        profile.role = UserRole.customer
        profile.must_change_password = False
    else:
        profile = User(
            id=user_uuid,
            email=email,
            password_hash="MANAGED_BY_SUPABASE_AUTH",
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone_number=payload.phone_number,
            role=UserRole.customer,
            must_change_password=False,
        )
        db.add(profile)

    try:
        await db.commit()
        await db.refresh(profile)
        return {"message": "Signup successful", "user_id": str(profile.id)}
    except IntegrityError:
        await db.rollback()
        await db.execute(delete(User).where(User.id == user_uuid))
        await db.commit()
        await run_in_threadpool(supabase_admin.auth.admin.delete_user, user.id)
        raise HTTPException(409, "Phone number or email is already registered")
    except Exception as exc:
        await db.rollback()
        await db.execute(delete(User).where(User.id == user_uuid))
        await db.commit()
        await run_in_threadpool(supabase_admin.auth.admin.delete_user, user.id)
        raise HTTPException(500, f"Database save failed: {exc}")


async def login_user_workflow(
    payload: LoginRequest, db: AsyncSession
) -> tuple[TokenResponse, str]:
    """Authenticates against Supabase, verifies profile, and returns token response + refresh token."""
    email = payload.email.strip().lower()
    password = payload.password

    client = make_anon_client()
    try:
        res = await run_in_threadpool(
            client.auth.sign_in_with_password, {"email": email, "password": password}
        )
    except Exception:
        raise HTTPException(401, "Invalid email or password")
    finally:
        try:
            await run_in_threadpool(client.auth.sign_out, {"scope": "local"})
        except Exception:
            pass

    session = res.session
    user = res.user
    if session is None or user is None:
        raise HTTPException(401, "Invalid credentials")

    result = await db.execute(select(User).where(User.id == user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(404, "User profile not found. Please sign up first.")

    token_resp = TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user={
            "id": user.id,
            "email": user.email,
            "role": profile.role.value,
            "must_change_password": profile.must_change_password,
        },
    )
    return token_resp, session.refresh_token


async def refresh_session_workflow(
    refresh_token: str, db: AsyncSession
) -> tuple[TokenResponse, str]:
    """Refreshes an active session using the refresh token."""
    client = make_anon_client()
    try:
        res = await run_in_threadpool(client.auth.refresh_session, refresh_token)
    except Exception:
        raise HTTPException(401, "Invalid or expired refresh token")
    finally:
        try:
            await run_in_threadpool(client.auth.sign_out, {"scope": "local"})
        except Exception:
            pass


    session = res.session
    user = res.user
    if session is None or user is None:
        raise HTTPException(401, "Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user.id))
    profile = result.scalar_one_or_none()

    token_resp = TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user={
            "id": user.id,
            "email": user.email,
            "role": profile.role.value if profile else None,
            "must_change_password": profile.must_change_password if profile else False,
        },
    )
    return token_resp, session.refresh_token


async def change_password_workflow(
    current_user: User, payload: ChangePasswordRequest, db: AsyncSession
) -> None:
    """Verifies existing password and updates to the new one."""
    auth_user = await run_in_threadpool(
        verify_password, current_user.email, payload.current_password
    )
    if auth_user is None:
        raise HTTPException(401, "Current password is incorrect")

    await apply_new_password(
        db,
        auth_user_id=str(current_user.id),
        email=current_user.email,
        new_password=payload.new_password,
    )


async def forgot_password_workflow(
    payload: ForgotPasswordRequest, db: AsyncSession
) -> None:
    """Issues a password reset token and dispatches the reset email via Brevo."""
    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is not None and user.is_active:
        token = create_password_reset_token(email=user.email, user_id=str(user.id))
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        try:
            await run_in_threadpool(
                mailer.send_password_reset_email,
                to=user.email,
                reset_url=reset_url,
            )
        except Exception as exc:
            logger.exception("Failed to send verification email to %s: %s", email, exc)
            raise HTTPException(
                500, "Failed to send verification email. Please try again later."
            )


def verify_reset_token_workflow(token: str) -> dict:
    """Decodes and validates a password reset token."""
    try:
        claims = verify_password_reset_token(token)
        return {"valid": True, "email": claims.get("email")}
    except (TokenExpiredError, TokenInvalidError) as exc:
        raise HTTPException(400, str(exc))


async def reset_password_workflow(
    payload: ResetPasswordRequest, db: AsyncSession
) -> None:
    """Applies new password using a verified token with token replay protection."""
    try:
        claims = verify_password_reset_token(payload.token)
    except (TokenExpiredError, TokenInvalidError) as exc:
        raise HTTPException(400, str(exc))

    user_id = claims.get("sub")
    try:
        parsed_id = UUID(user_id)
    except Exception:
        raise HTTPException(400, "Invalid user identifier in reset token")

    result = await db.execute(select(User).where(User.id == parsed_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(404, "User account not found or deactivated")

    token_iat = claims.get("iat", 0)
    if user.password_changed_at and user.password_changed_at.timestamp() > token_iat:
        raise HTTPException(
            400, "This reset link has already been used. Request a new one."
        )

    await apply_new_password(
        db,
        auth_user_id=str(user.id),
        email=user.email,
        new_password=payload.new_password,
    )


async def get_me_workflow(current_user: User, db: AsyncSession) -> UserRead:
    """Builds the comprehensive UserRead representation for the active session."""
    department_name = None
    if current_user.department_id:
        dept = await db.get(Department, current_user.department_id)
        if dept:
            department_name = dept.name

    invited_by_email = None
    if current_user.invited_by:
        inviter = await db.get(User, current_user.invited_by)
        if inviter:
            invited_by_email = inviter.email

    return UserRead(
        id=current_user.id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        agent_tier=current_user.agent_tier,
        role=current_user.role,
        department_id=current_user.department_id,
        department_name=department_name,
        created_at=current_user.created_at or datetime.now(timezone.utc),
        is_active=current_user.is_active,
        is_archive=bool(getattr(current_user, "is_archive", False) or False),
        phone_number=current_user.phone_number,
        invited_by=current_user.invited_by,
        invited_by_email=invited_by_email,
        invited_at=current_user.invited_at,
        must_change_password=current_user.must_change_password,
    )


async def update_my_profile_workflow(
    payload: UserProfileUpdate,
    current_user: User,
    db: AsyncSession,
) -> UserRead:
    """Updates user contact details and validates phone number uniqueness."""
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip()
    if payload.phone_number is not None:
        clean_phone = payload.phone_number.strip() or None
        if clean_phone:
            existing = await db.execute(
                select(User).where(
                    User.phone_number == clean_phone, User.id != current_user.id
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    409, "This phone number is already in use by another account."
                )
        current_user.phone_number = clean_phone

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409, "This phone number is already in use by another account."
        )

    await db.refresh(current_user)
    return await get_me_workflow(current_user=current_user, db=db)
