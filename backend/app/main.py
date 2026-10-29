"""FastAPI application: start-up, middleware and routes."""
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.concurrency import InferenceGate
from app.config import get_settings
from app.errors import register_exception_handlers
from app.middleware import install_middleware
from app.model_service import ModelService
from app.rate_limit import SlidingWindowRateLimiter
from app.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Models are verified and loaded ONCE here. If anything is wrong (missing
    # file, checksum mismatch) the server refuses to start.
    app.state.settings = settings
    app.state.model_service = ModelService(settings)
    app.state.gate = InferenceGate(
        settings.inference_workers, settings.inference_queue_size, settings.inference_queue_timeout_seconds
    )
    app.state.executor = ThreadPoolExecutor(
        max_workers=settings.inference_workers, thread_name_prefix="inference"
    )
    app.state.rate_limiter = SlidingWindowRateLimiter(
        settings.rate_limit_requests, settings.rate_limit_window_seconds
    )
    yield
    app.state.executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="AI Content Detector API",
    version="1.0.0",
    description=(
        "Detects whether text is **AI-generated** or **human-written** using sentence-level writing-style "
        "features and two trained classifiers (XGBoost and logistic regression).\n\n"
        "Every error uses one JSON shape: `{\"error\": {\"code\", \"message\", \"details\"}, \"request_id\"}`."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    redoc_url=None,
    debug=False,
)

register_exception_handlers(app)
install_middleware(app, settings)
app.include_router(router)
