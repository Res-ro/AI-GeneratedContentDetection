"""Denial-of-service defence: bounded, time-limited inference.

Running the model costs far more than receiving a request, so an attacker can
tie the server up with a few expensive requests. Three mechanisms work together:

1. Inference runs in a small dedicated thread pool, never in the event loop,
   so cheap endpoints (/api/health) stay responsive during a heavy analysis.
2. InferenceGate admits at most `workers` analyses at once plus a short queue.
   Anything beyond that is rejected immediately with 503 instead of piling up,
   and a queued request that waits too long is also given a 503.
3. Deadline is a cooperative time limit checked between sentences, so one
   pathological input cannot hold a worker indefinitely.

The cost of all this: legitimate users get a 503 during bursts, and a very long
text can be refused with a time-out.
"""
import asyncio
import time
from contextlib import asynccontextmanager

from app.errors import InferenceTimeoutError, ServiceBusyError


class Deadline:
    def __init__(self, seconds: float):
        self._end = time.monotonic() + seconds

    def check(self) -> None:
        if time.monotonic() > self._end:
            raise InferenceTimeoutError()


class InferenceGate:
    def __init__(self, max_concurrent: int, max_queue: int, queue_timeout: float):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._capacity = max_concurrent + max_queue  # running + waiting
        self._queue_timeout = queue_timeout
        self._in_system = 0

    @asynccontextmanager
    async def slot(self):
        if self._in_system >= self._capacity:
            raise ServiceBusyError(headers={"Retry-After": "2"})
        self._in_system += 1
        try:
            try:
                await asyncio.wait_for(self._semaphore.acquire(), timeout=self._queue_timeout)
            except TimeoutError:
                raise ServiceBusyError(headers={"Retry-After": "2"}) from None
            try:
                yield
            finally:
                self._semaphore.release()
        finally:
            self._in_system -= 1
