# backend/app/models/ticket.py
import uuid
from datetime import datetime
# Line 3: Add Index to sqlalchemy imports
from sqlalchemy import String, ForeignKey, DateTime, Numeric, Enum as SAEnum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from backend.app.database import Base
from backend.app.models.enums import TicketPriority, TicketSentiment, TicketStatus

class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"))
    department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"))
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    priority: Mapped[TicketPriority | None] = mapped_column(SAEnum(TicketPriority, name="ticket_priority"))
    sentiment: Mapped[TicketSentiment | None] = mapped_column(SAEnum(TicketSentiment, name="ticket_sentiment"))
    status: Mapped[TicketStatus] = mapped_column(SAEnum(TicketStatus, name="ticket_status"), nullable=False, default=TicketStatus.open)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    body_redacted: Mapped[str] = mapped_column(String, nullable=False)
    classification_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        # Accelerates customer ticket list sorted by created_at DESC
        Index("idx_tickets_customer_created", "customer_id", "created_at"),
        # Accelerates agent queue filtering (assigned tickets by status)
        Index("idx_tickets_assigned_agent_status", "assigned_agent_id", "status"),
        # Accelerates department triage and unassigned ticket queue
        Index("idx_tickets_department_status", "department_id", "status"),
        # Accelerates status breakdown in analytics & admin panel filters
        Index("idx_tickets_status", "status"),
        # Accelerates priority breakdown in analytics
        Index("idx_tickets_priority", "priority"),
    )
