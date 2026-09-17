import os
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

storage_uri = os.getenv("REDIS_URL", "memory://")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri=storage_uri,
    strategy="moving-window",
)
