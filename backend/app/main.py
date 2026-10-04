"""
Main FastAPI Application Entry Point.
Initializes the application lifecycle, middleware stack (CORS, HTTPS, security headers),
rate limiter exception handlers, routers, and background maintenance workers.
"""
import asyncio
import math
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from backend.app.ai.classify_ticket import preload_models
from backend.app.config import settings
from backend.app.core.limiter import limiter
from backend.app.core.observability import init_sentry
from backend.app.routers import (
    auth,
    departments,
    replies,
    sla_policies,
    tickets,
    users,
)
from backend.app.services.sla_service import sla_monitor_worker

# Initialize Sentry error reporting & performance monitoring
init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan context manager.
    Handles startup tasks (preloading ONNX models, starting SLA monitor worker)
    and executes graceful cleanup on shutdown.
    """
    # 1. Warm-up and preload ONNX models into memory to eliminate cold-start inference lag
    preload_models()

    # 2. Start SLA monitor worker background task
    sla_task = asyncio.create_task(sla_monitor_worker())
    try:
        yield
    finally:
        # Gracefully terminate background worker on application shutdown
        sla_task.cancel()
        try:
            await sla_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Deskwise", version="1.0.0", lifespan=lifespan)

# Register SlowAPI rate limiter on application state
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom exception handler for rate-limited requests (HTTP 429).
    Calculates remaining window seconds and attaches standard Retry-After headers.
    """
    retry_after = 60
    current_limit = getattr(request.state, "view_rate_limit", None)
    if current_limit:
        try:
            window_stats = request.app.state.limiter.limiter.get_window_stats(
                current_limit[0], *current_limit[1]
            )
            reset_in = 1 + window_stats[0]
            retry_after = max(1, int(math.ceil(reset_in - time.time())))
        except Exception:
            pass

    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded: {exc.detail}. Please try again later.",
            "retry_after": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Reset": str(int(time.time()) + retry_after),
        },
    )


class ForceHTTPSMiddleware(BaseHTTPMiddleware):
    """
    Redirects HTTP requests to HTTPS and enforces HTTP Strict Transport Security (HSTS).
    Supports upstream reverse-proxy headers (Cloudflare, AWS ALB, Render, Railway).
    """
    async def dispatch(self, request: Request, call_next):
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto == "http":
            https_url = request.url.replace(scheme="https")
            return RedirectResponse(https_url, status_code=301)

        response = await call_next(request)
        # HSTS: instruct browsers to only communicate over HTTPS for 1 year
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        return response


# Apply HTTPS redirect middleware if enabled in configuration
if settings.FORCE_HTTPS:
    app.add_middleware(ForceHTTPSMiddleware)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Appends defensive HTTP security headers to all responses to mitigate
    MIME-sniffing, clickjacking, and XSS attacks.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Parse allowed CORS origins from settings, trimming whitespace and slashes
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in settings.FRONTEND_URL.split(",")
    if origin.strip()
]

# Ensure localhost is always allowed for local frontend development
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

# Register CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Automatically permit Vercel preview environments
    allow_origin_regex=r"^https:\/\/deskwise(-[a-zA-Z0-9_-]+)?\.vercel\.app$",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "WWW-Authenticate",
        "Retry-After",
        "X-RateLimit-Reset",
        "X-RateLimit-Remaining",
        "X-RateLimit-Limit",
    ],
    allow_credentials=True,
)

# ---------------------------------------------------------------------------
# API Router Registrations
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(departments.router)
app.include_router(users.router)
app.include_router(tickets.router)
app.include_router(sla_policies.router)
app.include_router(replies.router)




@app.get("/health", tags=["Health"])
async def health():
    """Liveness probe endpoint for Docker / orchestration health checks."""
    return {"status": "ok"}


if settings.DEBUG:
    @app.get("/sentry-debug", tags=["Health"])
    async def trigger_sentry_test():
        """Diagnostic endpoint to verify end-to-end Sentry exception capture."""
        return {"result": 1 / 0}