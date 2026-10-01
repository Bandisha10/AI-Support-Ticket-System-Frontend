"""
Auth Router.
Clean HTTP controller delegating authentication workflows to auth_service.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.config import settings
from backend.app.core.limiter import limiter
from backend.app.core.supabase_client import supabase_admin
from backend.app.database import get_db
from backend.app.dependencies import (
    get_access_token,
    get_current_user,
    get_token_claims,
)
from backend.app.models.department import Department
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
from backend.app.services import auth_service

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


@router.post("/signup", status_code=201)
async def signup(payload: SignUpRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.signup_user_workflow(payload, db)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    token_resp, refresh_token = await auth_service.login_user_workflow(payload, db)
    _set_refresh_cookie(response, refresh_token)
    return token_resp


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get("refresh_token") or (
        payload.refresh_token if payload else None
    )
    if not token:
        raise HTTPException(401, "Missing refresh token")

    try:
        token_resp, new_refresh_token = await auth_service.refresh_session_workflow(
            token, db
        )
    except HTTPException:
        _delete_refresh_cookie(response)
        raise

    _set_refresh_cookie(response, new_refresh_token)
    return token_resp


@router.post("/logout")
async def logout(
    response: Response,
    token: str = Depends(get_access_token),
    claims: dict = Depends(get_token_claims),
):
    _delete_refresh_cookie(response)
    revoked = True
    try:
        await run_in_threadpool(supabase_admin.auth.admin.sign_out, token, "local")
    except Exception as exc:
        revoked = False
        logger.warning(
            "Supabase sign_out failed for sub=%s: %s", claims.get("sub"), exc
        )
    return {"message": "Logged out", "session_revoked": revoked}


@router.get("/me", response_model=UserRead)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.get_me_workflow(current_user, db)


@router.put("/me", response_model=UserRead)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows the signed-in user to update their own contact information."""
    return await auth_service.update_my_profile_workflow(payload, current_user, db)


@router.post("/change-password", response_model=PasswordChangedResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_password_workflow(current_user, payload, db)
    return PasswordChangedResponse(message="Password updated")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    response: Response,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    await auth_service.forgot_password_workflow(payload, db)
    return ForgotPasswordResponse(
        message="If an account with this email exists, a verification link has been sent."
    )


@router.get("/verify-reset-token")
async def verify_reset_token(token: str):
    return auth_service.verify_reset_token_workflow(token)


@router.post("/reset-password", response_model=PasswordChangedResponse)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    await auth_service.reset_password_workflow(payload, db)
    return PasswordChangedResponse(
        message="Password updated successfully. Sign in with your new password."
    )
