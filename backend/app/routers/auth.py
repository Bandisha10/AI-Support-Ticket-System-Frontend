import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
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
from backend.app.core.supabase_client import make_anon_client,supabase_admin
from backend.app.database import get_db
from backend.app.dependencies import get_access_token, get_current_user, get_token_claims
from backend.app.models.department import Department
from backend.app.models.enums import UserRole
from backend.app.models.user import User
from backend.app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    PasswordChangedResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignUpRequest,
    TokenResponse,
)
from backend.app.schemas.user import UserProfileUpdate, UserRead
from backend.app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Auth"])

def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.FORCE_HTTPS or settings.FRONTEND_URL.startswith("https"),
        samesite="lax",
        path="/auth/refresh",
        max_age=30 * 24 * 3600,  # 30 days
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        path="/auth/refresh",
        httponly=True,
        samesite="lax",
    )

def _verify_password(email: str, password: str):
    """Confirm a password against Supabase Auth and return the auth user."""
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


async def _apply_new_password(
    db: AsyncSession, *, auth_user_id: str, email: str, new_password: str
) -> None:
    try:
        await run_in_threadpool(
            supabase_admin.auth.admin.update_user_by_id,
            auth_user_id,
            {"password": new_password},
        )
    except Exception as exc:
        logger.warning("Password update rejected for %s: %s", email, exc)
        raise HTTPException(400, "Password update rejected. Please try a different password.")


    result = await db.execute(select(User).where(User.email == email))
    profile = result.scalar_one_or_none()
    if profile is not None:
        profile.must_change_password = False
        profile.password_changed_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("/signup", status_code=201)
async def signup(payload: SignUpRequest, db: AsyncSession = Depends(get_db)):
    if not settings.ALLOW_PUBLIC_SIGNUP:
        raise HTTPException(403, "Public signup is disabled. Ask an administrator for an account.")
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
            raise HTTPException(409, "Phone number is already registered with another account")

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
                }
            }
        )
    except Exception as exc:
        err_str = str(exc).lower()
        if "already registered" in err_str or "already exists" in err_str or "duplicate" in err_str:
            raise HTTPException(409, "Email already registered")
        logger.exception("Supabase signup error for %s: %s", payload.email, exc)
        raise HTTPException(400, f"Signup failed: {exc}")

    user = res.user
    if not user:
        raise HTTPException(400, "Signup failed")

    user_uuid = UUID(user.id)
    email = user.email or payload.email

    # Check if Supabase DB trigger already created the user row in public.users
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
        # Clean both public.users trigger row and Supabase Auth
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

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.strip().lower()
    password = payload.password 

    client = make_anon_client()
    try:
        res = await run_in_threadpool(
            client.auth.sign_in_with_password,
            {"email": email, "password": password}
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

    # Attach HttpOnly cookie scoped strictly to /auth/refresh
    _set_refresh_cookie(response, session.refresh_token)

    return TokenResponse(
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

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Prefer HttpOnly cookie; fallback to request body for non-browser/OAuth clients
    token = request.cookies.get("refresh_token") or (payload.refresh_token if payload else None)
    if not token:
        raise HTTPException(401, "Missing refresh token")

    client = make_anon_client()
    try:
        res = client.auth.refresh_session(token)
    except Exception:
        _delete_refresh_cookie(response)
        raise HTTPException(401, "Invalid or expired refresh token")
    finally:
        try:
            client.auth.sign_out(options={"scope": "local"})
        except Exception:
            pass

    session = res.session
    user = res.user
    if session is None or user is None:
        _delete_refresh_cookie(response)
        raise HTTPException(401, "Invalid refresh token")

    _set_refresh_cookie(response, session.refresh_token)

    result = await db.execute(select(User).where(User.id == user.id))
    profile = result.scalar_one_or_none()

    return TokenResponse(
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

@router.post("/logout")
async def logout(
    response: Response,
    token: str = Depends(get_access_token),
    claims: dict = Depends(get_token_claims),
):
    # Clear the refresh cookie on logout
    _delete_refresh_cookie(response)
    revoked = True
    try:
        await run_in_threadpool(supabase_admin.auth.admin.sign_out, token, "local")
    except Exception as exc:
        revoked = False
        logger.warning("Supabase sign_out failed for sub=%s: %s", claims.get("sub"), exc)
    return {"message": "Logged out", "session_revoked": revoked}


@router.get("/me", response_model=UserRead)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
        phone_number=current_user.phone_number,
        invited_by=current_user.invited_by,
        invited_by_email=invited_by_email,
        invited_at=current_user.invited_at,
        must_change_password=current_user.must_change_password,
    )


@router.put("/me", response_model=UserRead)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows the signed-in user to update their own contact information."""
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip()
    if payload.phone_number is not None:
        clean_phone = payload.phone_number.strip() or None
        if clean_phone:
            # Check if another user already has this phone number
            existing = await db.execute(
                select(User).where(User.phone_number == clean_phone, User.id != current_user.id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(409, "This phone number is already in use by another account.")
        current_user.phone_number = clean_phone

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This phone number is already in use by another account.")

    await db.refresh(current_user)
    return await me(current_user=current_user, db=db)

@router.post("/change-password", response_model=PasswordChangedResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Signed-in password change (also clears the first-login flag)."""
    auth_user = await run_in_threadpool(
        _verify_password, current_user.email, payload.current_password
    )
    if auth_user is None:
        raise HTTPException(401, "Current password is incorrect")

    await _apply_new_password(
        db,
        auth_user_id=str(current_user.id),
        email=current_user.email,
        new_password=payload.new_password,
    )
    return PasswordChangedResponse(message="Password updated")

@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/hour")
async def forgot_password(request:Request,payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send a verification email with a reset link."""
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
            raise HTTPException(500, "Failed to send verification email. Please try again later.")

    return ForgotPasswordResponse(
        message="If an account with this email exists, a verification link has been sent."
    )


@router.get("/verify-reset-token")
async def verify_reset_token(token: str):
    """Verify if the token is valid before displaying the password reset form."""
    try:
        claims = verify_password_reset_token(token)
        return {"valid": True, "email": claims.get("email")}
    except TokenExpiredError as exc:
        raise HTTPException(400, str(exc))
    except TokenInvalidError as exc:
        raise HTTPException(400, str(exc))


@router.post("/reset-password", response_model=PasswordChangedResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Apply new password using the verified reset token."""
    try:
        claims = verify_password_reset_token(payload.token)
    except TokenExpiredError as exc:
        raise HTTPException(400, str(exc))
    except TokenInvalidError as exc:
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

    # Replay guard: reject if password was already changed after this token was issued
    token_iat = claims.get("iat", 0)
    if user.password_changed_at and user.password_changed_at.timestamp() > token_iat:
        raise HTTPException(400, "This reset link has already been used. Request a new one.")

    await _apply_new_password(
        db,
        auth_user_id=str(user.id),
        email=user.email,
        new_password=payload.new_password,
    )
    return PasswordChangedResponse(
        message="Password updated successfully. Sign in with your new password."
    )

