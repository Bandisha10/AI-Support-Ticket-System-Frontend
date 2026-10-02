"""
Database Engine & Session Management Module.
Sets up an asynchronous SQLAlchemy connection pool optimized for PostgreSQL/Supabase
and provides a FastAPI dependency for request-scoped database sessions.
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.app.config import settings

# ---------------------------------------------------------------------------
# SQLAlchemy Async Engine Configuration
# Configured specifically for cloud Postgres poolers (e.g., Supabase / PgBouncer)
# ---------------------------------------------------------------------------
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Logs all emitted SQL queries when DEBUG is enabled
    future=True,
    pool_pre_ping=True,  # Tests connection health before checkout; transparently reconnects dead sockets
    pool_recycle=300,  # Recycles pool connections every 5 minutes to evade idle firewall drops
    pool_size=10,  # Base number of connections maintained in the pool
    max_overflow=20,  # Maximum additional temporary connections permitted during traffic spikes
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

# Async session factory producing AsyncSession instances
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,  # Prevents attribute expiry on commit to avoid IO calls outside session scope
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy database models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency yielding an asynchronous database session.
    Automatically closes the session at the end of the HTTP request lifecycle.
    """
    async with AsyncSessionLocal() as session:
        yield session
