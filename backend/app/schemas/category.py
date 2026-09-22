from pydantic import BaseModel, ConfigDict, Field, field_validator
from uuid import UUID

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(None, max_length=500)

    @field_validator("name", "description")
    @classmethod
    def sanitize_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        return v.strip()

class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = Field(None, max_length=500)

    @field_validator("name", "description")
    @classmethod
    def sanitize_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        return v.strip()


class CategoryRead(BaseModel):
    id: UUID
    name: str
    description: str | None
    model_config = ConfigDict(from_attributes=True)