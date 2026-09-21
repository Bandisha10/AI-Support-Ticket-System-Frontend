from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from backend.app.models.enums import TicketPriority, TicketSentiment, TicketStatus

class TicketCreate(BaseModel):
    subject: str
    body: str
    

class TicketUpdate(BaseModel):
    category_id: UUID | None = None
    department_id: UUID | None = None
    assigned_agent_id: UUID | None = None
    priority: TicketPriority | None = None
    sentiment: TicketSentiment | None = None
    status: TicketStatus | None = None
    classification_confidence: Decimal | None = None

class AttachmentRead(BaseModel):
    id: UUID | str | None = None
    ticket_id: UUID
    filename: str
    name: str | None = None
    url: str
    content_type: str | None = None
    size: str | None = None
    file_size: int | None = None
    size_formatted: str | None = None
    created_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class TicketRead(BaseModel):
    id: UUID
    customer_id: UUID
    customer_email: str | None = None
    category_id: UUID | None
    department_id: UUID | None
    assigned_agent_id: UUID | None
    priority: TicketPriority | None
    sentiment: TicketSentiment | None
    status: TicketStatus
    subject: str
    body_redacted: str
    classification_confidence: Decimal | None
    sla_due_at: datetime | None = None
    attachments: list[AttachmentRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)