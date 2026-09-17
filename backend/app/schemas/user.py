# backend/app/schemas/user.py
from pydantic import BaseModel, ConfigDict, EmailStr
from uuid import UUID
from datetime import datetime
from backend.app.models.enums import AgentTier, UserRole


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    agent_tier: AgentTier = AgentTier.regular
    role: UserRole
    department_id: UUID | None = None
    department_name: str | None = None
    created_at: datetime
    is_active: bool
    phone_number: str | None = None
    invited_by: UUID | None = None
    invited_by_email: str | None = None
    invited_at: datetime | None = None
    must_change_password: bool = False
    model_config = ConfigDict(from_attributes=True)



class UserProfileUpdate(BaseModel):
    phone_number: str | None = None


class UserUpdate(BaseModel):
    role: UserRole | None = None
    department_id: UUID | None = None
    is_active: bool | None = None
    phone_number: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    agent_tier: AgentTier | None = None


class AgentInvite(BaseModel):
    email: EmailStr
    department_id: UUID
    first_name: str
    last_name: str
    agent_tier: AgentTier = AgentTier.regular


class AgentInviteResponse(BaseModel):
    user: UserRead
    department_name: str
    email_sent: bool
    reinvited: bool = False
    detail: str
    temporary_password: str | None = None
