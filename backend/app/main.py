from backend.app.core.observability import init_sentry
init_sentry()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from backend.app.config import settings
from backend.app.core.limiter import limiter
from backend.app.routers import (
    auth, departments, users, sla_policies, tickets, replies,
)

app = FastAPI(title="Deskwise", version="1.0.0")

# Register limiter on app state and handle 429 exceptions
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Too many requests. Please try again later: {exc}"},
        headers={"Retry-After": "60"},
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["WWW-Authenticate"],
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

