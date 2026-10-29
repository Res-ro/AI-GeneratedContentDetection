"""One consistent JSON error format for every failure.

    {"error": {"code": "...", "message": "...", "details": [...]},
     "request_id": "..."}

Nothing internal (stack traces, file paths, library messages, or the user's
own input) is ever placed in an error response. Details of unexpected errors
are logged on the server only.
"""
import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("aidetect.errors")


# ---- Response model (also used to document errors in /docs) -----------------
class ErrorDetail(BaseModel):
    field: str = Field(description="Where the problem is, e.g. 'body.text'.")
    message: str = Field(description="What is wrong, in plain English.")


class ErrorBody(BaseModel):
    code: str = Field(description="Stable machine-readable error code.")
    message: str = Field(description="Human-readable summary.")
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody
    request_id: str | None = Field(default=None, description="Quote this when reporting a problem.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "error": {
                        "code": "validation_error",
                        "message": "The request is not valid.",
                        "details": [
                            {"field": "body.text", "message": "String should have at least 20 characters"}
                        ],
                    },
                    "request_id": "9f1c0d4e6b7a4c1f8a52d3e0b1c2d3e4",
                }
            ]
        }
    }


def error_payload(
    code: str,
    message: str,
    request_id: str | None = None,
    details: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "error": {"code": code, "message": message, "details": details or []},
        "request_id": request_id,
    }


# ---- Application errors ------------------------------------------------------
class AppError(Exception):
    """Base class for errors we raise on purpose."""

    status_code = 500
    code = "internal_error"
    message = "Something went wrong on our side."

    def __init__(self, message: str | None = None, headers: dict[str, str] | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.headers = headers or {}


class InvalidTextError(AppError):
    status_code = 422
    code = "invalid_text"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"
    message = "The request body is too large."


class RateLimitExceededError(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Too many requests. Please slow down."


class ServiceBusyError(AppError):
    status_code = 503
    code = "service_busy"
    message = "The service is busy right now. Please try again shortly."


class InferenceTimeoutError(AppError):
    status_code = 503
    code = "analysis_timeout"
    message = "The analysis took too long and was stopped. Try a shorter text."


class ModelUnavailableError(AppError):
    status_code = 503
    code = "model_unavailable"
    message = "The detection model is not available."


# ---- Handlers ----------------------------------------------------------------
def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _json(status: int, payload: dict, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content=payload, headers=headers)


def _status_to_code(status: int) -> str:
    return {
        400: "bad_request",
        404: "not_found",
        405: "method_not_allowed",
        413: "payload_too_large",
        415: "unsupported_media_type",
        429: "rate_limited",
    }.get(status, "http_error")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return _json(
            exc.status_code,
            error_payload(exc.code, exc.message, _request_id(request)),
            exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # Only the location and Pydantic's message are returned. The offending
        # input value is deliberately left out so it can never be echoed back.
        details = [
            {"field": "body", "message": "The request body is not valid JSON."}
            if err.get("type") == "json_invalid"
            else {
                "field": ".".join(str(part) for part in err.get("loc", ())),
                "message": str(err.get("msg", "Invalid value")),
            }
            for err in exc.errors()
        ]
        return _json(
            422,
            error_payload("validation_error", "The request is not valid.", _request_id(request), details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        message = {
            404: "That address does not exist.",
            405: "That method is not allowed for this address.",
            413: "The request body is too large.",
        }.get(exc.status_code, "The request could not be completed.")
        return _json(
            exc.status_code,
            error_payload(_status_to_code(exc.status_code), message, _request_id(request)),
            dict(exc.headers) if exc.headers else None,
        )


def unexpected_error_response(request: Request, exc: Exception) -> JSONResponse:
    """Used by the catch-all middleware. Logs fully; tells the client nothing."""
    rid = _request_id(request)
    logger.error("Unhandled error (request_id=%s)", rid, exc_info=exc)
    return _json(
        500,
        error_payload("internal_error", "Something went wrong on our side.", rid),
    )
