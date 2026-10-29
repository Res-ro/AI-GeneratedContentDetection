"""Middleware: body-size limit, request context, security headers, CORS."""
import json
import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import Settings
from app.errors import error_payload, unexpected_error_response

logger = logging.getLogger("aidetect.access")

_DOCS_PATHS = {"/docs", "/docs/oauth2-redirect"}

_API_CSP = "default-src 'none'; frame-ancestors 'none'"
# Swagger UI (/docs) needs its CDN bundle and one inline start-up script.
_DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; frame-ancestors 'none'"
)


class BodySizeLimitMiddleware:
    """Reject request bodies over `max_bytes`, whatever the client claims.

    A Content-Length header is checked first (cheap), but it can be absent or
    false (chunked uploads), so bytes are also counted as they stream in.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max_bytes
            except ValueError:
                return await self._reject(scope, send, 400, "bad_request", "Invalid Content-Length header.")
            if too_big:
                return await self._reject(scope, send, 413, "payload_too_large", self._too_large_msg())

        received = 0

        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # FastAPI's body parser turns any other exception into a
                    # generic 400; an HTTPException is passed through intact
                    # and rendered by our shared handler as a 413.
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, counting_receive, send)

    def _too_large_msg(self) -> str:
        return f"The request body is larger than the {self.max_bytes // 1024} KiB limit."

    async def _reject(self, scope, send, status: int, code: str, message: str):
        request_id = scope.get("state", {}).get("request_id")
        body = json.dumps(error_payload(code, message, request_id)).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


def install_middleware(app: FastAPI, settings: Settings) -> None:
    """Order matters: the LAST one added is the OUTERMOST."""

    async def request_context(request: Request, call_next):
        request_id = uuid.uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:  # last line of defence: never leak a traceback
            response = unexpected_error_response(request, exc)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = (
            _DOCS_CSP if request.url.path in _DOCS_PATHS else _API_CSP
        )
        if settings.enable_hsts:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Method, path and status only. Request bodies (the user's text) are never logged.
        logger.info(
            "%s %s -> %s in %.0f ms (request_id=%s)",
            request.method, request.url.path, response.status_code,
            (time.perf_counter() - started) * 1000, request_id,
        )
        return response

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(BaseHTTPMiddleware, dispatch=request_context)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,  # exact origins only, never "*"
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Retry-After"],
        max_age=600,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
