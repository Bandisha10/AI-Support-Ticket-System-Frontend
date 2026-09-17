import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.app.main import app
from backend.app.dependencies import get_current_user
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.models.enums import UserRole, TicketStatus


def test_customer_ticket_listing_isolation(client, customer_user, mock_db_session):
    """Regression: Customer query must execute without error and return filtered list."""
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: customer_user

    res = client.get("/tickets/")
    assert res.status_code == 200
    assert res.json() == []


def test_agent_assigned_to_me_filter(client, agent_user, mock_db_session):
    """Regression: Agent requesting assigned_to_me filter executes properly."""
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: agent_user

    res = client.get("/tickets/?assigned_to_me=true")
    assert res.status_code == 200
    assert res.json() == []
