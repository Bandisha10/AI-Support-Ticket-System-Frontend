from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from datetime import datetime

class TicketRatingCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback: str | None = Field(None, max_length=1000)

    @field_validator("feedback")
    @classmethod
    def clean_feedback(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        return v.strip()

class TicketRatingRead(BaseModel):
    id: UUID
    ticket_id: UUID
    rating: int
    feedback: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
