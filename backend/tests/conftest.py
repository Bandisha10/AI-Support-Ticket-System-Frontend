import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.dependencies import get_current_user
from backend.app.main import app
from backend.app.models.enums import AgentTier, UserRole
from backend.app.models.user import User


@pytest.fixture
def mock_db_session():
    """Mocks an async SQLAlchemy session."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.delete = AsyncMock()
    session.add = MagicMock()

    async def fake_refresh(obj):
        if not getattr(obj, "id", None):
            obj.id = uuid.uuid4()
        if not getattr(obj, "created_at", None):
            obj.created_at = datetime.now(timezone.utc)
        if not getattr(obj, "updated_at", None):
            obj.updated_at = datetime.now(timezone.utc)
        if getattr(obj, "agent_tier", None) is None and getattr(obj, "role", None)==UserRole.agent:
            obj.agent_tier = AgentTier.regular


    session.refresh = AsyncMock(side_effect=fake_refresh)
    return session



@pytest.fixture
def admin_user():
    return User(
        id=uuid.uuid4(),
        email="admin@test.com",
        role=UserRole.admin,
        agent_tier=None,
        created_at=datetime.now(timezone.utc),
        is_active=True,
        must_change_password=False,
        department_id=None,
    )


@pytest.fixture
def agent_user():
    return User(
        id=uuid.uuid4(),
        email="agent@ritgoa.ac.in",
        role=UserRole.agent,
        agent_tier=AgentTier.regular,
        created_at=datetime.now(timezone.utc),
        is_active=True,
        must_change_password=False,
        department_id=uuid.uuid4(),
    )


@pytest.fixture
def customer_user():
    return User(
        id=uuid.uuid4(),
        email="customer@example.com",
        role=UserRole.customer,
        agent_tier=None,
        created_at=datetime.now(timezone.utc),
        is_active=True,
        must_change_password=False,
        department_id=None,
    )

@pytest.fixture
def client(mock_db_session):
    """FastAPI TestClient with overridden get_db dependency."""
    app.dependency_overrides[get_db] = lambda: mock_db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_test_jwt(user_id: str, email: str, expires_in_sec: int = 3600, missing_sub: bool = False) -> str:
    """Helper to generate HS256 JWT tokens with Supabase JWT secret."""
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "email": email,
        "aud": "authenticated",
        "iat": now,
        "exp": now + expires_in_sec,
    }
    if not missing_sub:
        payload["sub"] = user_id
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
