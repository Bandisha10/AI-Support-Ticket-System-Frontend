from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from backend.app.config import settings

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=settings.MIN_PASSWORD_LENGTH,
        max_length=settings.MAX_PASSWORD_LENGTH,
    )
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    phone_number: str | None = Field(
        None,
        max_length=20,
        pattern=r"^\+?[0-9\s\-()]{7,20}$",
    )

    @field_validator("first_name", "last_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("Null bytes are forbidden")
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Name cannot be empty")
        return cleaned

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str | None = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    user: dict


class _NewPasswordMixin(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(
        min_length=settings.MIN_PASSWORD_LENGTH,
        max_length=settings.MAX_PASSWORD_LENGTH,
    )
    @model_validator(mode="after")
    def _passwords_must_differ(self):
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current one")
        return self

class ChangePasswordRequest(_NewPasswordMixin):
    """Authenticated change: identity comes from the bearer token."""


class ForgotPasswordRequest(BaseModel):
    """Request verification link by providing the registered email."""
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = "If an account with this email exists, a verification link has been sent."


class ResetPasswordRequest(BaseModel):
    """Reset password using the token sent to the user's email."""
    token: str
    new_password: str = Field(
        min_length=settings.MIN_PASSWORD_LENGTH,
        max_length=settings.MAX_PASSWORD_LENGTH,
    )


class PasswordChangedResponse(BaseModel):
    message: str = "Password updated"
    must_change_password: bool = False
