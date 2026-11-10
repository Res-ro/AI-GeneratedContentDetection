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
from app.errors import error_payload, unexpected_error_response, _status_to_code

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

        lengths = [value for key, value in scope['headers'] if key.lower() == b'content-length']
        if len(lengths) > 1:
            return await self._reject(scope, send, 400, 'bad_request', 'Invalid Content-Length header.')
        declared = lengths[0] if lengths else None
        if declared is not None:
            try:
                if not declared.isdigit():
                    raise ValueError('Content-Length must contain ASCII digits only')
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


class MiddlewareErrorEnvelope:
    """Format plain-text middleware errors without replacing their validation.

    TrustedHost and CORS still decide which requests to reject. Their status and
    CORS/Allow headers are retained; untrusted rejection text is never echoed.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        replacement = None

        async def enveloped_send(message):
            nonlocal replacement
            if message['type'] == 'http.response.start':
                headers = message.get('headers', [])
                content_type = dict(headers).get(b'content-type', b'')
                if message['status'] >= 400 and not content_type.startswith(b'application/json'):
                    replacement = json.dumps(error_payload(
                        _status_to_code(message['status']), 'The request could not be completed.',
                        scope.get('state', {}).get('request_id'),
                    )).encode()
                    headers = [(k, v) for k, v in headers if k.lower() not in (b'content-type', b'content-length')]
                    message = {**message, 'headers': headers + [(b'content-type', b'application/json'), (b'content-length', str(len(replacement)).encode())]}
            elif message['type'] == 'http.response.body' and replacement is not None:
                if message.get('more_body', False):
                    return
                message = {'type': 'http.response.body', 'body': replacement}
            await send(message)

        await self.app(scope, receive, enveloped_send)


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
            # This catch-all is outside CORS so even host/preflight rejections
            # receive context. Retain CORS on unexpected failures for our UI.
            origin = request.headers.get('origin')
            if origin in settings.cors_origin_list:
                response.headers['Access-Control-Allow-Origin'] = origin
                response.headers['Vary'] = 'Origin'
                response.headers['Access-Control-Expose-Headers'] = 'Retry-After, X-Request-ID'

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Cache-Control"] = "no-store"
        response.headers['X-Request-ID'] = request_id
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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,  # exact origins only, never "*"
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Retry-After", "X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
    app.add_middleware(MiddlewareErrorEnvelope)
    app.add_middleware(BaseHTTPMiddleware, dispatch=request_context)
