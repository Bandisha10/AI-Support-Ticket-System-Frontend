from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from backend.app.models.enums import TicketPriority
class SLAPolicyCreate(BaseModel):
    priority: TicketPriority
    response_minutes: int = Field(..., ge=1, le=525600)
    resolution_minutes: int = Field(..., ge=1, le=525600)
class SLAPolicyUpdate(BaseModel):
    response_minutes: int | None = Field(None, ge=1, le=525600)
    resolution_minutes: int | None = Field(None, ge=1, le=525600)

class SLAPolicyRead(BaseModel):
    id: UUID
    priority: TicketPriority
    response_minutes: int
    resolution_minutes: int
    model_config = ConfigDict(from_attributes=True)