import logging
import sentry_sdk
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import settings
from backend.app.core.security import (
    TokenExpiredError,
    TokenInvalidError,
    TokenMissingSubjectError,
    decode_supabase_jwt,
)
from backend.app.database import get_db
from backend.app.models.enums import AgentTier, UserRole
from backend.app.models.user import User

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="SupabaseAccessToken",
    description="Supabase access_token from POST /auth/login or /auth/refresh.",
)

# Endpoints an agent on a temporary password may still reach, so the forced
# password change cannot lock them out of fixing it.
PASSWORD_CHANGE_EXEMPT_PATHS = {
    "/auth/change-password",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-reset-token",
    "/auth/logout",
    "/auth/refresh",
    "/auth/me",
    "/health",
}


def _www_authenticate() -> dict[str, str]:
    return {"WWW-Authenticate": "Bearer"}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers=_www_authenticate()
    )


def _redact(value: str, keep: int = 16) -> str:
    if len(value) <= keep:
        return value
    return f"{value[:keep]}... ({len(value)} chars)"


async def get_access_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raw = request.headers.get("Authorization")
        if not raw or not raw.strip():
            raise _unauthorized(
                "Missing Authorization header. Send 'Authorization: Bearer <access_token>'."
            )
        scheme, _, param = raw.partition(" ")
        if not param.strip():
            if scheme.count(".") == 2:
                raise _unauthorized(
                    "Authorization header looks like a bare token. It must be "
                    "'Bearer <access_token>', separated by a single space."
                )
            raise _unauthorized(
                f"Authorization header has scheme '{_redact(scheme)}' but no token "
                "after it. If you are using a template variable, it resolved to an "
                "empty string."
            )
        raise _unauthorized(
            f"Unsupported authorization scheme '{_redact(scheme)}'. "
            "Use 'Bearer <access_token>'."
        )

    token = credentials.credentials.strip()
    if not token:
        raise _unauthorized(
            "Bearer token is empty. If you are using a template variable, it resolved "
            "to an empty string."
        )
    if token[0] in "\"'" or token.startswith("{{"):
        raise _unauthorized(
            "Bearer token is not a JWT - it still contains quotes or an unresolved "
            "template placeholder. Send the raw access_token value."
        )
    return token


async def get_token_claims(token: str = Depends(get_access_token)) -> dict:
    try:
        return decode_supabase_jwt(token)
    except TokenExpiredError:
        raise _unauthorized(
            "Access token has expired. Call POST /auth/refresh and retry."
        ) from None
    except TokenMissingSubjectError as exc:
        logger.warning("Rejected subject-less bearer token: %s", exc)
        raise _unauthorized(
            "Token has no 'sub' claim, so it is not a user access token. "
            "Do not send the anon or service-role key here."
        ) from None
    except TokenInvalidError as exc:
        logger.warning("Rejected access token: %s", exc)
        detail = "Invalid access token."
        if settings.DEBUG:
            detail = f"Invalid access token: {exc}"
        raise _unauthorized(detail) from None


async def get_current_user(
    request: Request,
    claims: dict = Depends(get_token_claims),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id = UUID(str(claims["sub"]))
    except (ValueError, TypeError, KeyError):
        raise _unauthorized("Token 'sub' claim is not a valid UUID.") from None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    # JIT (just-in-time) provisioning for OAuth users (e.g. Google sign-in).
    # Supabase creates auth.users but nothing creates public.users for OAuth.
    if not user:
        email = claims.get("email")
        if not email:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "User profile not found and token has no email claim.",
            )
        # Block company-domain users from self-provisioning via OAuth
        from backend.app.core.roles import is_company_domain

        if is_company_domain(email):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Agent accounts must be created by an administrator.",
            )
        user = User(
            id=user_id,
            email=email,
            password_hash="MANAGED_BY_SUPABASE_AUTH",
            role=UserRole.customer,
            agent_tier=None,
            is_active=True,
            must_change_password=False,
        )

        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except Exception:
            await db.rollback()
            # Race condition: another request may have created the row
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "Failed to create user profile.",
                )

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This account has been deactivated."
        )
    # Invited agents are still on the admin-generated temporary password: block
    # everything except the endpoints needed to replace it.
    if (
        settings.ENFORCE_PASSWORD_CHANGE
        and getattr(user, "must_change_password", False)
        and request.url.path not in PASSWORD_CHANGE_EXEMPT_PATHS
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Password change required. Call POST /auth/change-password first.",
        )

    # Tag Sentry events with who made the request (id only — no PII by default).
    sentry_sdk.set_user({"id": str(user.id)})
    sentry_sdk.set_tag("user.role", user.role.value)

    return user

def require_role(*roles: UserRole):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user
    return checker
