"""
Core Security & Cryptography Module.
Provides dual-mode Supabase JWT validation (asymmetric JWKS & symmetric HS256),
thread-safe JWKS key caching with key-rotation resilience, security claim enforcement,
and single-purpose password reset token generation.
"""
import threading
import time
import httpx
import jwt
from jwt.exceptions import PyJWTError as JWTError, ExpiredSignatureError
from backend.app.config import settings

# Supabase Auth standard audience claim for authenticated user sessions
AUDIENCE = "authenticated"

# Supabase JWKS endpoint for asymmetric signing keys (ES256 / RS256)
_JWKS_URL = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
_JWKS_TTL_SECONDS = 600  # In-memory cache valid for 10 minutes
_jwks_lock = threading.Lock()
_jwks_cache: dict = {"keys": []}
_jwks_fetched_at = 0.0


def _get_jwks(force: bool = False) -> dict:
    """
    Retrieves and caches public JSON Web Key Sets (JWKS) from Supabase.
    
    CRITICAL HIGHLIGHTS:
    - Double-checked locking prevents a thundering herd (race condition)
      on worker cold starts when multiple concurrent requests arrive.
    - 'force=True' allows on-demand cache refresh during automated key rotation.
    """
    global _jwks_cache, _jwks_fetched_at
    fresh = _jwks_cache["keys"] and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
    if fresh and not force:
        return _jwks_cache

    with _jwks_lock:
        fresh = _jwks_cache["keys"] and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
        if fresh and not force:
            return _jwks_cache

        resp = httpx.get(_JWKS_URL, timeout=5.0)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = time.monotonic()
        return _jwks_cache


# Enforce presence of essential JWT claims during token validation
_REQUIRED_CLAIMS = {
    "require_exp": True,  # Reject expired tokens
    "require_aud": True,  # Reject tokens not destined for 'authenticated'
    "require_sub": True,  # Mandatory user UUID (prevents API key forgery)
    "verify_iat": False,
}


class TokenError(Exception):
    """Base exception for all access token verification failures."""


class TokenExpiredError(TokenError):
    """
    Raised when token signature is authentic but past its 'exp' lifetime.
    CRITICAL: This is the sole actionable error that triggers client POST /auth/refresh.
    """


class TokenMissingSubjectError(TokenError):
    """
    CRITICAL DEFENSE: Raised when a token lacks a 'sub' claim.
    Prevents authentication bypass when clients inadvertently pass SUPABASE_ANON_KEY
    or SUPABASE_SERVICE_ROLE_KEY as bearer tokens (which are HS256-signed but contain no user 'sub').
    """


class TokenInvalidError(TokenError):
    """Raised on malformed tokens, invalid signatures, or missing claims."""


def decode_supabase_jwt(token: str) -> dict:
    """
    Decodes and validates a Supabase Auth JWT token.
    
    Supports:
    1. Symmetric HS256: Verified against SUPABASE_JWT_SECRET.
    2. Asymmetric ES256/RS256: Verified against public keys in Supabase JWKS.
    
    Includes 60s clock skew leeway and automatic key-rotation fallback.
    """
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise TokenInvalidError(str(exc)) from exc

    if header.get("alg") == "HS256":
        key, allowed = settings.SUPABASE_JWT_SECRET, ["HS256"]
    else:
        try:
            kid = header.get("kid")
            jwks = _get_jwks()
            raw_key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
            
            # If kid not found, force a refresh once in case key rotation occurred
            if raw_key is None:
                jwks = _get_jwks(force=True)
                raw_key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
            if raw_key is None:
                raise TokenInvalidError(f"no JWK matches token kid={kid!r}")

            key = jwt.PyJWK.from_dict(raw_key).key
        except TokenInvalidError:
            raise
        except Exception as exc:
            raise TokenInvalidError(f"Failed to fetch Supabase JWKS signing keys: {exc}") from exc

        allowed = ["ES256", "RS256"]


    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=allowed,
            audience=AUDIENCE,
            options=dict(_REQUIRED_CLAIMS),
            leeway=60,  # 60s tolerance for server clock drift
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
    """
    Generates a cryptographically signed, short-lived (15 min) JWT specifically
    scoped for the password reset workflow ('aud': 'password_reset').
    """
    now = time.time()
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "password_reset",
        "purpose": "password_reset",
        "iat": int(now),
        "exp": int(now + (expires_minutes * 60)),
    }
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


def verify_password_reset_token(token: str) -> dict:
    """
    Validates password reset token authenticity, purpose claim, and expiration.
    Guarantees the token cannot be reused as a regular session token.
    """
    try:
        claims = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="password_reset",
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
