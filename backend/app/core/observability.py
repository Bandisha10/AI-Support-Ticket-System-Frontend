"""
Observability & APM Integration Module.
Initializes Sentry error tracking, FastAPI/SQLAlchemy performance tracing,
and executes PII/credential scrubbing on all outbound crash reports.
"""
import logging
import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

from backend.app.config import settings

logger = logging.getLogger(__name__)


def _before_send(event, hint):
    """
    Security Sanitizer Hook.
    Redacts Authorization headers, session cookies, and Supabase tokens
    to prevent credential leakage to monitoring dashboards.
    """
    try:
        headers = event.get("request", {}).get("headers")
        if headers:
            for key in list(headers):
                if key.lower() in {"authorization", "cookie", "x-supabase-auth"}:
                    headers[key] = "[Filtered]"
    except Exception:
        pass
    return event


def init_sentry() -> None:
    """
    Initializes Sentry SDK if SENTRY_DSN is configured.
    Hooks into Starlette, FastAPI, SQLAlchemy, and standard logging.
    """
    if not settings.SENTRY_DSN:
        logger.info("SENTRY_DSN not set - Sentry disabled.")
        return

    # Automatically tags Git commit hash in deployment environments (Render/Railway)
    release = os.getenv("RENDER_GIT_COMMIT", f"{settings.APP_NAME}@1.0.0")

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=release,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,  # Enforces privacy by default
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            SqlalchemyIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        before_send=_before_send,
    )
    logger.info("Sentry initialised (env=%s, release=%s).", settings.SENTRY_ENVIRONMENT, release)
