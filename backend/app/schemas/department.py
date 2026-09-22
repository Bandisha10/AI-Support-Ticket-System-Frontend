import re
from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID

SAFE_NAME_REGEX = re.compile(r"^[a-zA-Z0-9\s\-&/_.]+$")

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are forbidden")
        if not SAFE_NAME_REGEX.match(cleaned):
            raise ValueError("Department name contains invalid characters. Only alphanumeric, spaces, and - & / _ . are allowed.")
        return cleaned

class DepartmentUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if "\x00" in cleaned:
            raise ValueError("Null bytes are forbidden")
        if not SAFE_NAME_REGEX.match(cleaned):
            raise ValueError("Department name contains invalid characters")
        return cleaned

class DepartmentRead(BaseModel):
    id: UUID
    name: str
    model_config = ConfigDict(from_attributes=True)