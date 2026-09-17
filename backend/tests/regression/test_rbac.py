import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest
from backend.app.main import app
from backend.app.dependencies import get_current_user, get_token_claims
from backend.app.models.enums import UserRole
from backend.app.models.user import User


def test_customer_cannot_create_department(client, customer_user):
    """Regression: Customers attempting to call admin-only endpoints must receive 403."""
    app.dependency_overrides[get_current_user] = lambda: customer_user
    res = client.post("/departments/", json={"name": "Restricted Dept"})
    assert res.status_code == 403
    assert res.json()["detail"] == "Insufficient permissions"


def test_deactivated_user_is_blocked(client, customer_user, mock_db_session):
    """Regression: Deactivated accounts must be forbidden from accessing the API."""
    customer_user.is_active = False
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = customer_user
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_token_claims] = lambda: {"sub": str(customer_user.id)}

    res = client.get("/departments/")
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"]


def test_must_change_password_blocks_normal_endpoints(client, agent_user, mock_db_session):
    """Regression: Users flagged with must_change_password=True must be blocked from standard endpoints."""
    agent_user.must_change_password = True
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = agent_user
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_token_claims] = lambda: {"sub": str(agent_user.id)}

    res = client.get("/departments/")
    assert res.status_code == 403
    assert "Password change required" in res.json()["detail"]
