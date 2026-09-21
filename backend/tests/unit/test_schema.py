import uuid
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from backend.app.schemas.ticket import TicketCreate,TicketRead
from backend.app.schemas.department import DepartmentCreate
from backend.app.schemas.sla_policy import SLAPolicyCreate
from backend.app.models.enums import TicketStatus, TicketPriority


def test_ticket_create_valid():
    payload = TicketCreate(subject="Printer Broken", body="Cannot print documents")
    assert payload.subject == "Printer Broken"
    assert payload.body == "Cannot print documents"


def test_ticket_create_missing_fields():
    with pytest.raises(ValidationError):
        TicketCreate(subject="Missing body")  # type: ignore


def test_ticket_read_validation():
    data = {
        "id": uuid.uuid4(),
        "customer_id": uuid.uuid4(),
        "customer_email": "user@test.com",
        "category_id": None,
        "department_id": None,
        "assigned_agent_id": None,
        "priority": TicketPriority.high,
        "sentiment": None,
        "status": TicketStatus.open,
        "subject": "System crash",
        "body_redacted": "System crashes on startup",
        "classification_confidence": 0.95,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    ticket = TicketRead(**data)
    assert ticket.subject == "System crash"
    assert ticket.status == TicketStatus.open


def test_department_create():
    dept = DepartmentCreate(name="IT Support")
    assert dept.name == "IT Support"


def test_sla_policy_create():
    policy = SLAPolicyCreate(
        priority=TicketPriority.high,
        response_minutes=120,
        resolution_minutes=480,
    )
    assert policy.priority == TicketPriority.high
    assert policy.response_minutes == 120
    assert policy.resolution_minutes == 480
