from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime

class TicketRatingCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback: str | None = None

class TicketRatingRead(BaseModel):
    id: UUID
    ticket_id: UUID
    rating: int
    feedback: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
