from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID
from datetime import datetime

class ReplyCreate(BaseModel):
    ticket_id: UUID
    body: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Reply message body",
    )
    is_auto_reply: bool = False
    is_internal_note: bool = False

    @field_validator("body")
    @classmethod
    def sanitize_reply_body(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Reply body cannot be blank whitespace")
        return cleaned

class ReplyRead(BaseModel):
    id: UUID
    ticket_id: UUID
    author_id: UUID | None
    author_email: str | None = None
    is_auto_reply: bool
    is_internal_note: bool
    body: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)