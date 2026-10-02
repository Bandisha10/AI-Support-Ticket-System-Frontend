"""
Rate Limiter Configuration.
Utilizes SlowAPI backed by Redis or an in-memory sliding window.
Rate limits are applied per client IP using 'get_remote_address'.
"""
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

# Default to in-memory storage for local dev; uses Redis if REDIS_URL is provided in production
# storage_uri = os.getenv("REDIS_URL", "memory://")

limiter = Limiter(
    key_func=get_remote_address,      # Identifies clients by caller IP address
    default_limits=["120/minute"],                # No global limits; limits are set per route via @limiter.limit()
    storage_uri="memory://",
    strategy="moving-window",         # Moving window provides strict rolling rate limiting
    headers_enabled=False,            # Custom headers are formatted in the FastAPI exception handler
)
