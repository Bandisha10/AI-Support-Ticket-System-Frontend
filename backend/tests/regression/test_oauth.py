import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest
from sqlalchemy import select

from backend.app.models.enums import UserRole
from backend.app.models.user import User
from backend.tests.conftest import make_test_jwt


def test_google_oauth_first_time_signup_provisions_customer(client, mock_db_session):
    """Google OAuth sign-up: when user does not exist in public.users,

    backend must JIT-provision a new customer profile with role=customer.
    """
    new_user_id = str(uuid.uuid4())
    token = make_test_jwt(new_user_id, "new_google_user@gmail.com")

    # First query checks if user exists -> returns None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()

    assert data["email"] == "new_google_user@gmail.com"
    assert data["role"] == "customer"
    assert data["is_active"] is True
    assert data["must_change_password"] is False
    assert mock_db_session.add.called
    assert mock_db_session.commit.called


def test_google_oauth_signin_existing_customer(client, customer_user, mock_db_session):
    """Google OAuth sign-in: when user already exists, returns existing profile

    without creating duplicate records.
    """
    token = make_test_jwt(str(customer_user.id), customer_user.email)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = customer_user
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == str(customer_user.id)
    assert data["email"] == customer_user.email
    assert data["role"] == "customer"
    # Existing user should not trigger add
    assert not mock_db_session.add.called


def test_google_oauth_blocks_company_domain_self_provisioning(client, mock_db_session):
    """Google OAuth must NOT allow company domain (@ritgoa.ac.in) accounts to self-provision;

    Agents must be invited by an admin.
    """
    agent_id = str(uuid.uuid4())
    token = make_test_jwt(agent_id, "intruder@ritgoa.ac.in")

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Agent accounts must be created by an administrator" in res.json()["detail"]
    assert not mock_db_session.add.called


def test_google_oauth_missing_email_claim_rejected(client, mock_db_session):
    """Google OAuth token without email claim must return 404."""
    user_id = str(uuid.uuid4())
    token = make_test_jwt(user_id, "")  # empty email

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404
    assert "token has no email claim" in res.json()["detail"]


def test_google_oauth_deactivated_account_blocked(client, customer_user, mock_db_session):
    """Deactivated Google account must receive 403 Forbidden."""
    customer_user.is_active = False
    token = make_test_jwt(str(customer_user.id), customer_user.email)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = customer_user
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"]


def test_complete_profile_after_google_signup(client, customer_user, mock_db_session):
    """After Google signup, user completes profile by setting name and phone number via PUT /auth/me."""
    token = make_test_jwt(str(customer_user.id), customer_user.email)

    # 1st execute: lookup for get_current_user
    # 2nd execute: check phone_number uniqueness
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = customer_user

    phone_check_result = MagicMock()
    phone_check_result.scalar_one_or_none.return_value = None

    mock_db_session.execute = AsyncMock(side_effect=[user_result, phone_check_result, user_result])

    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "phone_number": "+919876543210",
    }
    res = client.put("/auth/me", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res.status_code == 200
    assert customer_user.first_name == "Jane"
    assert customer_user.last_name == "Doe"
    assert customer_user.phone_number == "+919876543210"
