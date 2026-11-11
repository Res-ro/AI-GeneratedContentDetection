"""Denial-of-service defence: bounded, time-limited inference.

Running the model costs far more than receiving a request, so an attacker can
tie the server up with a few expensive requests. Three mechanisms work together:
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
