"""HTTP endpoints."""
import asyncio
from functools import partial

from fastapi import APIRouter, Depends, Request

from app.concurrency import Deadline
from app.errors import ErrorResponse
from app.rate_limit import enforce_rate_limit
from app.schemas import AnalyzeRequest, AnalyzeResponse, HealthResponse, ModelInfoResponse

router = APIRouter(prefix="/api")


def _ERR(description: str) -> dict:
    return {"model": ErrorResponse, "description": description}


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Is the service up?",
    description="Cheap liveness check. It does no model work, so it still answers while an analysis is running.",
)
async def health(request: Request) -> HealthResponse:
    return HealthResponse(status="ok", models_loaded=request.app.state.model_service is not None)


@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Describe the models and the input limits",
    description=(
        "Returns the available classifiers, their decision thresholds, the features they use, and the "
        "input limits. The front end reads the limits from here so its validation always matches the server."
    ),
)
async def model_info(request: Request) -> ModelInfoResponse:
    return request.app.state.model_service.info()


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Check whether text is AI-generated or human-written",
    description=(
        "Splits the text into sentences, scores each one with the chosen model, and combines them into an "
        "overall verdict with a confidence. Sentences under 10 words are skipped because the model was "
        "trained on longer ones. Rate-limited per client."
    ),
    dependencies=[Depends(enforce_rate_limit)],
    responses={
        413: _ERR("Request body larger than the size limit."),
        422: _ERR("Invalid input (wrong type, too short/long, or no sentence of 10+ words)."),
        429: _ERR("Rate limit exceeded. See the Retry-After header."),
        503: _ERR("Server busy, or the analysis exceeded its time limit. See the Retry-After header."),
        500: _ERR("Unexpected server error. No internal details are returned."),
    },
)
async def analyze(payload: AnalyzeRequest, request: Request) -> AnalyzeResponse:
    state = request.app.state
    settings = state.settings
    work = partial(state.model_service.analyse, payload.text, payload.model)

    if not settings.inference_guard_enabled:
        # DEMO ONLY: the naive version. Runs the model inside the event loop, so
        # the whole server freezes while it works. See config.inference_guard_enabled.
        return work(Deadline(1e9))

    async with state.gate.slot():
        deadline = Deadline(settings.inference_deadline_seconds)
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(state.executor, partial(work, deadline))
