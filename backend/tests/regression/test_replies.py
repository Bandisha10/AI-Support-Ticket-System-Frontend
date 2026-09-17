import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.app.main import app
from backend.app.dependencies import get_current_user
from backend.app.models.ticket import Ticket
from backend.app.models.user import User
from backend.app.models.enums import UserRole


def test_customer_cannot_reply_to_other_customers_ticket(client, customer_user, mock_db_session):
    """Regression: Customers must not be able to reply to another customer's ticket."""
    other_customer_id = uuid.uuid4()
    mock_ticket = Ticket(
        id=uuid.uuid4(),
        customer_id=other_customer_id,
        department_id=uuid.uuid4(),
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_ticket
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: customer_user

    res = client.post(
        "/replies/",
        json={
            "ticket_id": str(mock_ticket.id),
            "body": "Tampering reply",
            "is_internal_note": False,
        },
    )
    assert res.status_code == 403
    assert "Not allowed to reply" in res.json()["detail"]


def test_customer_internal_note_tampering_prevented(client, customer_user, mock_db_session):
    """Regression: When a customer sends is_internal_note=True, the server must force it to False."""
    mock_ticket = Ticket(
        id=uuid.uuid4(),
        customer_id=customer_user.id,
        department_id=uuid.uuid4(),
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_ticket
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    app.dependency_overrides[get_current_user] = lambda: customer_user

    # Attempt to sneak is_internal_note=True
    res = client.post(
        "/replies/",
        json={
            "ticket_id": str(mock_ticket.id),
            "body": "Customer response",
            "is_internal_note": True,
            "is_auto_reply": True,
        },
    )
    assert res.status_code == 201
    # Check that the saved payload had is_internal_note overridden to False
    created_obj = mock_db_session.add.call_args[0][0]
    assert created_obj.is_internal_note is False
    assert created_obj.is_auto_reply is False
