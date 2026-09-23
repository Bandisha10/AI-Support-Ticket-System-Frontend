from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from backend.app.models.enums import TicketPriority, TicketSentiment, TicketStatus

class TicketCreate(BaseModel):
    subject: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description="Ticket subject (3-200 characters)",
    )
    body: str = Field(
        ...,
        min_length=5,
        max_length=10000,
        description="Ticket body description (5-10000 characters)",
    )

    @field_validator("subject", "body")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty or blank whitespace")
        return cleaned

class TicketUpdate(BaseModel):
    category_id: UUID | None = None
    department_id: UUID | None = None
    assigned_agent_id: UUID | None = None
    priority: TicketPriority | None = None
    sentiment: TicketSentiment | None = None
    status: TicketStatus | None = None
    classification_confidence: Decimal | None = Field(None, ge=Decimal("0.0"), le=Decimal("1.0"))

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