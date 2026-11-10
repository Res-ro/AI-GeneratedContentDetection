"""Opt-in evaluation endpoints; no model inference is performed."""
from typing import Annotated, Literal
from fastapi import APIRouter, HTTPException, Path, Query, Request, Response
from .config import get_settings
from . import performance_store as store
from .errors import documented_errors
from .performance_schemas import DatasetStatusResponse, PerformanceSummary, PerformanceRecords, PerformanceDocument

router = APIRouter(prefix='/api/model-performance', tags=['Model performance'], responses=documented_errors(400, 404, 405, 413, 422, 500))


def settings_for(request, response):
    response.headers['Cache-Control'] = 'no-store'
    return getattr(request.app.state, 'settings', None) or get_settings()


@router.get('/status', response_model=DatasetStatusResponse, summary='Evaluation dataset availability', description='Reports whether local dataset access is enabled and the imported snapshot matches saved metadata. Disabled or missing data returns 200 with available=false. Schema examples are illustrative, not real dataset measurements.')
def status(request: Request, response: Response):
    return store.dataset_status(settings_for(request, response))


@router.get('/summary', response_model=PerformanceSummary, responses=documented_errors(503), summary='Precomputed evaluation metrics', description='Both models on the same split and evaluation level. AI is positive; undefined metrics are null. Scores are re-centred, not calibrated probabilities. Example request: /api/model-performance/summary?split=Test&level=document. Response examples are illustrative.')
def summary(request: Request, response: Response,
            split: Annotated[Literal['Test', 'Training', 'Validation', 'All'], Query(description='Dataset split; All includes in-sample training results.', examples=['Test'])] = 'Test',
            level: Annotated[Literal['document', 'sentence'], Query(description='Unit counted once in each metric.', examples=['document'])] = 'document'):
    return store.summary(store.require_dataset(settings_for(request, response)), split, level)


@router.get('/records', response_model=PerformanceRecords, responses=documented_errors(503), summary='Browse evaluation examples', description='Combines filters with AND and returns a bounded, sorted page. Search matches document IDs or sentence word prefixes. Document searches cover retained sentences. Example: /api/model-performance/records?split=Test&model=xgboost&outcome=fn&page=1. Response examples are illustrative.')
def records(request: Request, response: Response, filters: Annotated[store.RecordFilters, Query()]):
    return store.records(store.require_dataset(settings_for(request, response)), filters)


@router.get('/documents/{document_id}', response_model=PerformanceDocument, responses=documented_errors(503), summary='Inspect retained document sentences', description='Document predictions for both models and paginated sentence text, raw probabilities, re-centred scores and writing features. This is not necessarily the complete original document. Example: /api/model-performance/documents/illustrative-001?page=1 (illustrative ID; use an ID returned by records).')
def document(request: Request, response: Response, document_id: Annotated[str, Path(description='Document ID returned by the records endpoint.', examples=['illustrative-001'])],
             page: int = Query(1, ge=1, description='One-based sentence page, clamped to available pages.', examples=[1]), page_size: int = Query(25, ge=1, le=100, description='Maximum sentence records per page.', examples=[25])):
    result = store.document(store.require_dataset(settings_for(request, response)), document_id, page, page_size)
    if result is None:
        raise HTTPException(404, 'Document not found')
    return result
