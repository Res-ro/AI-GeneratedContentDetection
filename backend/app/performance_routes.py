"""Opt-in evaluation endpoints; no model inference is performed."""
from typing import Annotated, Literal
from fastapi import APIRouter, HTTPException, Query, Request, Response
from .config import get_settings
from . import performance_store as store

router = APIRouter(prefix='/api/model-performance', tags=['Model performance'])


def settings_for(request, response):
    response.headers['Cache-Control'] = 'no-store'
    return getattr(request.app.state, 'settings', None) or get_settings()


@router.get('/status', summary='Evaluation dataset availability', description='Reports whether local dataset access is enabled and the imported snapshot matches saved metadata.')
def status(request: Request, response: Response):
    return store.dataset_status(settings_for(request, response))


@router.get('/summary', summary='Precomputed evaluation metrics', description='Both models on the same split and evaluation level. AI is positive; undefined metrics are null. Scores are re-centred, not calibrated probabilities.')
def summary(request: Request, response: Response,
            split: Literal['Test', 'Training', 'Validation', 'All'] = 'Test',
            level: Literal['document', 'sentence'] = 'document'):
    return store.summary(store.require_dataset(settings_for(request, response)), split, level)


@router.get('/records', summary='Browse evaluation examples', description='Combines filters with AND and returns a bounded, sorted page. Search matches document IDs or sentence word prefixes. Document searches cover retained sentences.')
def records(request: Request, response: Response, filters: Annotated[store.RecordFilters, Query()]):
    return store.records(store.require_dataset(settings_for(request, response)), filters)


@router.get('/documents/{document_id}', summary='Inspect retained document sentences', description='Document predictions for both models and paginated sentence text, raw probabilities, re-centred scores and writing features. This is not necessarily the complete original document.')
def document(request: Request, response: Response, document_id: str,
             page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)):
    result = store.document(store.require_dataset(settings_for(request, response)), document_id, page, page_size)
    if result is None:
        raise HTTPException(404, 'Document not found')
    return result
