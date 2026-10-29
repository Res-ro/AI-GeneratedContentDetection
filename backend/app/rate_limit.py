"""Per-client rate limiting (sliding window, in memory).

Different mechanism from the DoS defence on purpose: this limits how OFTEN one
client may call (stops flooding and repeated probing of the detector), while
concurrency.py limits how much work the server does AT ONCE for everyone.

State lives in process memory, so with several server processes each would
keep its own counts; a shared store such as Redis would be needed there.
"""
import time
from collections import deque

from fastapi import Request

from app.errors import RateLimitExceededError


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int, max_clients: int = 10_000):
        self._limit = limit
        self._window = window_seconds
        self._max_clients = max_clients
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> int | None:
        """Record a request. Returns seconds to wait if over the limit, else None."""
        now = time.monotonic()
        cutoff = now - self._window

        if len(self._hits) >= self._max_clients and key not in self._hits:
            self._purge(cutoff)

        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= self._limit:
            return max(1, int(hits[0] + self._window - now) + 1)

        hits.append(now)
        return None

    def _purge(self, cutoff: float) -> None:
        """Drop idle clients so the table cannot grow without bound."""
        for k in [k for k, h in self._hits.items() if not h or h[-1] <= cutoff]:
            del self._hits[k]


async def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency: raises 429 when the caller is over the limit."""
    limiter: SlidingWindowRateLimiter = request.app.state.rate_limiter
    # request.client is the direct peer. X-Forwarded-For is NOT trusted, as any
    # client could forge it. Behind a reverse proxy, configure uvicorn's
    # --proxy-headers / --forwarded-allow-ips instead.
    key = request.client.host if request.client else "unknown"
    retry_after = limiter.check(key)
    if retry_after is not None:
        raise RateLimitExceededError(headers={"Retry-After": str(retry_after)})
