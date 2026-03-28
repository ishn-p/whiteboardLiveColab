import asyncio
import logging
import os
from collections.abc import Awaitable, Callable
from typing import TypeVar

import asyncpg

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://whiteboard:whiteboard@localhost:5432/whiteboard",
)

pool: asyncpg.Pool | None = None

# Transient asyncpg error types that are safe to retry.
_TRANSIENT_ERRORS = (
    asyncpg.TooManyConnectionsError,
    asyncpg.PostgresConnectionError,
    asyncpg.InterfaceError,
    asyncpg.DeadlockDetectedError,
    ConnectionRefusedError,
    OSError,
)

T = TypeVar("T")


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        max_retries = 5
        retry_delay = 2

        for attempt in range(max_retries):
            try:
                pool = await asyncpg.create_pool(DATABASE_URL)
                logger.info("Successfully connected to the database.")
                break
            except (ConnectionRefusedError, OSError) as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to connect to the database after {max_retries} attempts.")
                    raise e
                logger.warning(
                    f"Database not ready. Retrying in {retry_delay} seconds... "
                    f"(Attempt {attempt + 1}/{max_retries})"
                )
                await asyncio.sleep(retry_delay)

    return pool


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    max_attempts: int = 3,
    base_delay: float = 0.1,
) -> T:
    """Execute an async DB operation with exponential backoff on transient errors.

    Only retries on connection-level / deadlock errors — not on constraint
    violations or application-level errors, which should propagate immediately.
    """
    for attempt in range(max_attempts):
        try:
            return await fn()
        except _TRANSIENT_ERRORS as exc:
            if attempt == max_attempts - 1:
                logger.error("DB operation failed after %d attempts: %s", max_attempts, exc)
                raise
            delay = base_delay * (2**attempt)
            logger.warning(
                "Transient DB error (attempt %d/%d), retrying in %.2fs: %s",
                attempt + 1,
                max_attempts,
                delay,
                exc,
            )
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")  # pragma: no cover
