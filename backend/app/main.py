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

init_sentry()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload AI models on server startup
    preload_models()
    # Start SLA Monitor background loop
    sla_task = asyncio.create_task(sla_monitor_worker())
    try:
        yield
    finally:
        sla_task.cancel()
        try:
            await sla_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="Deskwise", version="1.0.0", lifespan=lifespan)

# Register limiter on app state and handle 429 exceptions
app.state.limiter = limiter

# Lines 35–60 in backend/app/main.py:
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
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
    async def dispatch(self, request: Request, call_next):
        # Inspect direct scheme or reverse proxy header (Cloudflare, AWS ALB, Render, Railway)
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto == "http":
            https_url = request.url.replace(scheme="https")
            return RedirectResponse(https_url, status_code=301)

        response = await call_next(request)
        # HSTS: instruct browsers to only use HTTPS for 1 year
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        return response


if settings.FORCE_HTTPS:
    app.add_middleware(ForceHTTPSMiddleware)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Parse origins safely: strip whitespace, remove trailing slashes, and support comma-separated lists
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in settings.FRONTEND_URL.split(",")
    if origin.strip()
]

# Always keep localhost allowed so local frontend testing never breaks
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Automatically allow any Vercel deployment URL (including preview branches)
    allow_origin_regex=r"https://.*\.vercel\.app",
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

app.include_router(auth.router)
app.include_router(departments.router)
app.include_router(users.router)
app.include_router(tickets.router)
app.include_router(sla_policies.router)
app.include_router(replies.router)

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}

@app.get("/sentry-debug", tags=["Health"])
async def trigger_sentry_test():
    """Test endpoint: deliberate error to verify Sentry receives production events."""
    division_by_zero = 1 / 0
    return {"result": division_by_zero}
