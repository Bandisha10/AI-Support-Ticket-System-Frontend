import threading
import time
import httpx
import jwt
from jwt.exceptions import PyJWTError as JWTError, ExpiredSignatureError
from backend.app.config import settings

AUDIENCE = "authenticated"

_JWKS_URL = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_JWKS_TTL_SECONDS = 600
_jwks_lock = threading.Lock()
_jwks_cache: dict = {"keys": []}
_jwks_fetched_at = 0.0

def _get_jwks(force: bool = False) -> dict:
    global _jwks_cache, _jwks_fetched_at
    fresh = _jwks_cache["keys"] and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
    if fresh and not force:
        return _jwks_cache
    with _jwks_lock:  # double-checked lock: avoid a thundering herd on cold start
        fresh = _jwks_cache["keys"] and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
        if fresh and not force:
            return _jwks_cache
        resp = httpx.get(_JWKS_URL, timeout=5.0)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = time.monotonic()
        return _jwks_cache

_REQUIRED_CLAIMS = {
    "require_exp": True,
    "require_aud": True,
    "require_sub": True,
    "verify_iat": False,
}

class TokenError(Exception):
    """Base for access-token verification failures."""

class TokenExpiredError(TokenError):
    """Signature was valid but the token is past its ``exp``.

    Kept distinct because it is the one *actionable* failure: the client should
    call ``POST /auth/refresh`` and retry. Supabase access tokens live 3600s by
    default, so this is the single most common auth failure in practice.
    """

class TokenMissingSubjectError(TokenError):
    """Verified, but carries no ``sub`` -- so it is not a *user* token.

    The fingerprint of sending ``SUPABASE_ANON_KEY`` or
    ``SUPABASE_SERVICE_ROLE_KEY`` as a bearer token. Both are legacy HS256 JWTs
    signed with ``SUPABASE_JWT_SECRET``, so their signatures verify; they carry
    ``role``/``iss``/``exp`` but no ``sub``. The anon key is public by design, so
    accepting one as proof of identity would be an auth bypass.
    """

class TokenInvalidError(TokenError):
    """Malformed token, wrong signing key, wrong audience, or missing claims."""

def decode_supabase_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise TokenInvalidError(str(exc)) from exc

    if header.get("alg") == "HS256":
        key, allowed = settings.SUPABASE_JWT_SECRET, ["HS256"]
    else:
        # Asymmetric: select the public JWK whose kid matches the header,
        # refreshing the cache once if the kid is unknown (key rotation).
        kid = header.get("kid")
        jwks = _get_jwks()
        raw_key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if raw_key is None:
            jwks = _get_jwks(force=True)
            raw_key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if raw_key is None:
            raise TokenInvalidError(f"no JWK matches token kid={kid!r}")

        # Convert the raw JWK dictionary to a cryptography public key
        try:
            key = jwt.PyJWK.from_dict(raw_key).key
        except Exception as exc:
            raise TokenInvalidError(f"invalid JWK: {exc}") from exc

        allowed = ["ES256", "RS256"]

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=allowed,
            audience=AUDIENCE,
            options=dict(_REQUIRED_CLAIMS),
            leeway=60,
        )

    except ExpiredSignatureError as exc:
        raise TokenExpiredError(str(exc)) from exc
    except JWTError as exc:
        if 'missing required key "sub"' in str(exc):
            raise TokenMissingSubjectError(str(exc)) from exc
        raise TokenInvalidError(str(exc)) from exc

    if not claims.get("sub"):
        raise TokenMissingSubjectError("token has no 'sub' claim")
    return claims

def create_password_reset_token(email: str, user_id: str, expires_minutes: int = 15) -> str:
    """Generate a signed, single-purpose JWT token for password reset."""
    now = time.time()
    payload = {
        "sub": user_id,
        "email": email,
        "purpose": "password_reset",
        "iat": int(now),
        "exp": int(now + (expires_minutes * 60)),
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


def verify_password_reset_token(token: str) -> dict:
    """Verify the reset token's signature, expiration, and purpose."""
    try:
        claims = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"require_exp": True, "require_sub": True, "verify_iat": False},
            leeway=60,
        )
        if claims.get("purpose") != "password_reset":
            raise TokenInvalidError("Invalid token purpose")
        if not claims.get("email") or not claims.get("sub"):
            raise TokenInvalidError("Token is missing user identification claims")
        return claims
    except ExpiredSignatureError as exc:
        raise TokenExpiredError("Verification link has expired. Please request a new one.") from exc
    except JWTError as exc:
        raise TokenInvalidError("Invalid or corrupted verification link.") from exc
