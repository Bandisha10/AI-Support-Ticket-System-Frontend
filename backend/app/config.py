"""
Application Configuration Module.
Defines strongly typed settings using Pydantic Settings, loaded from environment variables
or .env files with sensible defaults for security, database, and integrations.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate root directory and project environment files
ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    """
    Main application configuration schema.
    Validates required secrets and sets defaults for optional configuration flags.
    """
    # --- Database & Supabase Infrastructure (Required) ---
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str

    # --- Debug & Development Flags ---
    DEBUG: bool = False

    # --- Sentry Error Monitoring & APM ---
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_TRACES_SAMPLE_RATE: float = 1.0

    # --- Application & Routing Settings ---
    APP_NAME: str = "Deskwise"
    FRONTEND_URL: str = "http://localhost:5173"
    FORCE_HTTPS: bool = False
    SUPABASE_STORAGE_BUCKET: str = "ticket-attachments"

    # --- Authentication & Password Governance Policies ---
    ALLOW_PUBLIC_SIGNUP: bool = True
    ENFORCE_PASSWORD_CHANGE: bool = True
    MIN_PASSWORD_LENGTH: int = 8
    MAX_PASSWORD_LENGTH: int = 16

    # --- Brevo (Sendinblue) Email & SMTP Service ---
    BREVO_API_KEY: str | None = None
    SMTP_HOST: str | None = "smtp-relay.brevo.com"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    MAIL_FROM: str = "deskwise.support@gmail.com"
    MAIL_FROM_NAME: str = "Deskwise Support"
    MAIL_REPLY_TO: str | None = None

    # Configuration for loading environment files in order of priority
    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, ROOT_DIR / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Instantiate singleton settings object used across the entire backend application
settings = Settings()  # pyright: ignore[reportCallIssue]
