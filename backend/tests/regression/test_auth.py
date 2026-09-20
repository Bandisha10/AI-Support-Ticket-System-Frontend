import uuid
import pytest
from backend.app.main import app
from backend.app.database import get_db
from backend.tests.conftest import make_test_jwt


def test_missing_auth_header_fails(client):
    """Regression: Unauthenticated requests to protected endpoints must return 401."""
    res = client.get("/departments/")
    assert res.status_code == 401
    assert "Missing Authorization header" in res.json()["detail"]


def test_bare_token_without_bearer_prefix_rejected(client):
    """Regression: Sending a JWT directly without 'Bearer ' prefix must be rejected."""
    token = make_test_jwt(str(uuid.uuid4()), "user@example.com")
    res = client.get("/departments/", headers={"Authorization": token})
    assert res.status_code == 401
    assert "bare token" in res.json()["detail"]


def test_unresolved_template_variable_rejected(client):
    """Regression: Unresolved Postman template variables like '{{token}}' must not pass through."""
    res = client.get("/departments/", headers={"Authorization": "Bearer {{access_token}}"})
    assert res.status_code == 401
    assert "template placeholder" in res.json()["detail"]


def test_service_or_anon_key_without_sub_rejected(client):
    """Regression: Keys missing 'sub' (anon/service-role keys) must never be treated as valid user tokens."""
    token_without_sub = make_test_jwt(str(uuid.uuid4()), "user@example.com", missing_sub=True)
    res = client.get("/departments/", headers={"Authorization": f"Bearer {token_without_sub}"})
    assert res.status_code == 401
    assert "no 'sub' claim" in res.json()["detail"]


def test_expired_token_rejected_with_actionable_error(client):
    """Regression: Expired tokens must return 401 advising /auth/refresh."""
    expired_token = make_test_jwt(str(uuid.uuid4()), "user@example.com", expires_in_sec=-120)
    res = client.get("/departments/", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "expired" in res.json()["detail"].lower()


def test_public_health_endpoint_requires_no_auth(client):
    """Regression: Health check endpoint must always remain public and return 200."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
