import time
import uuid
import pytest
import jwt

from backend.app.config import settings
from backend.app.core.security import (
    create_password_reset_token,
    verify_password_reset_token,
    decode_supabase_jwt,
    TokenExpiredError,
    TokenInvalidError,
    TokenMissingSubjectError,
)


def test_create_and_verify_password_reset_token():
    user_id = str(uuid.uuid4())
    email = "user@example.com"
    token = create_password_reset_token(email=email, user_id=user_id, expires_minutes=15)

    claims = verify_password_reset_token(token)
    assert claims["sub"] == user_id
    assert claims["email"] == email
    assert claims["purpose"] == "password_reset"


def test_verify_password_reset_token_expired():
    user_id = str(uuid.uuid4())
    email = "user@example.com"
    token = create_password_reset_token(email=email, user_id=user_id, expires_minutes=-5)

    with pytest.raises(TokenExpiredError):
        verify_password_reset_token(token)


def test_verify_password_reset_token_wrong_purpose():
    payload = {
        "sub": str(uuid.uuid4()),
        "email": "user@example.com",
        "purpose": "login",
        "exp": int(time.time()) + 300,
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(TokenInvalidError, match="Invalid token purpose"):
        verify_password_reset_token(token)


def test_decode_supabase_jwt_missing_sub_raises():
    payload = {
        "aud": "authenticated",
        "exp": int(time.time()) + 300,
    }
    token = jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(TokenMissingSubjectError):
        decode_supabase_jwt(token)


def test_decode_supabase_jwt_corrupted_raises():
    with pytest.raises(TokenInvalidError):
        decode_supabase_jwt("not.a.valid.jwt.signature")
