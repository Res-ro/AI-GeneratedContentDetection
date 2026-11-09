"""Small explicit fixtures test arithmetic; they are never shipped as dataset records."""
import csv
import hashlib
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import register_exception_handlers
from app.performance_import import FEATURES, import_csv
from app.performance_metrics import metrics
from app.performance_routes import router
from app.performance_store import RecordFilters, dataset_status, document, records, summary
from app.score_math import recentre

THRESHOLDS = {'logistic': .4, 'xgboost': .9}


def row(doc, label, logistic, xgboost, sentence=None, split='Test'):
    return {'doc_ID': doc, 'label': label, 'split': split,
            'sentence': sentence or f'Retained sentence for document {doc}',
            'logistic_ai_probability': logistic, 'xgboost_ai_probability': xgboost,
            **{key: 1 for key in FEATURES}}


def export(path, rows):
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row('a', 0, .1, .1)))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def snapshot(tmp_path):
    # a: both correct human; b: only logistic correct; c: only XGB correct;
    # d: both incorrect. e has unequal sentence/document predictions.
    rows = [row('a', 0, .1, .2), row('b', 1, .8, .7), row('c', 1, .1, .95),
            row('d', 0, .8, .95), row('e', 1, 1, 1, 'First zebra sentence'),
            row('e', 1, .1, .1, 'Second zebra sentence'), row('f', 0, .2, .2, split='Training')]
    source, db = tmp_path / 'input.csv', tmp_path / 'evaluation.sqlite3'
    export(source, rows)
    info = import_csv(source, db, THRESHOLDS, 'test-hash')
    return db, info, rows


def test_thresholds_and_document_aggregation(snapshot):
    db, info, _ = snapshot
    assert info['documents'] == 6 and info['sentences'] == 7
    np.testing.assert_allclose(recentre(np.array([0, .4, 1]), .4), [0, .5, 1])
    np.testing.assert_allclose(recentre(np.array([0, .9, 1]), .9), [0, .5, 1])
    b = document(db, 'b')['document']
    assert b['logistic_prediction'] == 1 and b['xgboost_prediction'] == 0
    e = document(db, 'e')
    assert e['document']['sentence_count'] == 2
    assert e['document']['xgboost_score'] == pytest.approx((1 + .1 / 1.8) / 2)
    assert e['document']['xgboost_flagged_ratio'] == .5
    assert [s['position'] for s in e['sentences']] == [0, 1]
    assert e['sentences'][0]['features']['word_count'] == 1
    assert e['sentences'][0]['xgboost_raw'] == 1


def test_metrics_and_levels(snapshot):
    db, _, _ = snapshot
    result = metrics([0, 0, 1, 1, 1], [.1, .8, .2, .9, .95])
    assert result['confusion'] == {'tn': 1, 'fp': 1, 'fn': 1, 'tp': 2}
    assert result['accuracy'] == .6
    assert result['precision'] == result['recall'] == result['f1'] == pytest.approx(2 / 3)
    assert sum(sum(values) for values in result['histogram'].values()) == 5
    assert summary(db, 'Test', 'document')['xgboost']['total'] == 5
    assert summary(db, 'Test', 'sentence')['xgboost']['total'] == 6
    assert summary(db, 'All', 'document')['xgboost']['total'] == 6
    assert summary(db, 'Test', 'sentence')['xgboost']['accuracy'] != summary(db, 'Test', 'document')['xgboost']['accuracy']


def test_undefined_and_empty_metrics(snapshot):
    empty = metrics([], [])
    assert empty['total'] == 0 and empty['accuracy'] is None
    assert all(empty[k] is None for k in ['precision', 'recall', 'f1', 'roc_auc', 'average_precision'])
    human = metrics([0, 0], [.1, .2])
    assert human['accuracy'] == 1 and human['precision'] is None and human['roc_auc'] is None
    assert metrics([1, 1], [.1, .2])['recall'] == 0
    assert summary(snapshot[0], 'Validation', 'document')['xgboost']['total'] == 0


def test_filters_search_disagreement_sorting_and_pages(snapshot):
    db, _, _ = snapshot
    query = records(db, RecordFilters(actual='1', predicted='0', outcome='fn', model='xgboost', score_min=.3, score_max=.5, q='b'))
    assert query['total'] == 1 and query['items'][0]['document_id'] == 'b'
    assert records(db, RecordFilters(q='zebr'))['total'] == 1
    assert records(db, RecordFilters(q='zebr', level='sentence'))['total'] == 2
    assert records(db, RecordFilters(q='" OR 1=1 --'))['total'] == 0
    assert records(db, RecordFilters(q='%'))['total'] == 0
    assert records(db, RecordFilters(outcome='fp', actual='1'))['total'] == 0
    agreement = summary(db, 'Test', 'document')
    assert agreement['agreement'] == {'both_correct': 2, 'both_wrong': 1, 'logistic_only': 1, 'xgboost_only': 1}
    assert agreement['agreement_rate'] == .6
    for key, n in agreement['agreement'].items():
        assert records(db, RecordFilters(agreement=key))['total'] == n
    for model in THRESHOLDS:
        for cell, n in agreement[model]['confusion'].items():
            assert records(db, RecordFilters(model=model, outcome=cell))['total'] == n
    first = records(db, RecordFilters(sort='score', direction='desc', page_size=2))
    second = records(db, RecordFilters(sort='score', direction='desc', page_size=2, page=2))
    assert first['items'][0]['xgboost_score'] >= first['items'][1]['xgboost_score']
    assert not {r['id'] for r in first['items']} & {r['id'] for r in second['items']}
    assert records(db, RecordFilters(sort='sentence_count', direction='desc'))['items'][0]['document_id'] == 'e'
    assert records(db, RecordFilters(sort='correct'))['items'][0]['xgboost_correct'] is False
    assert records(db, RecordFilters(page=999))['page'] == 1
    assert document(db, 'e', page_size=1, page=2)['sentences'][0]['position'] == 1
    assert document(db, 'missing') is None


@pytest.mark.parametrize('change', [{'label': ''}, {'label': '2'}, {'split': 'Unknown'}, {'doc_ID': ''}, {'sentence': ''}, {'xgboost_ai_probability': 'NaN'}, {'xgboost_ai_probability': 1.1}, {'word_count': 'inf'}, {'noun_ratio': -1}])
def test_reject_invalid_csv(tmp_path, change):
    source = tmp_path / 'bad.csv'
    export(source, [{**row('a', 0, .1, .1), **change}])
    with pytest.raises(ValueError, match='CSV row 2'):
        import_csv(source, tmp_path / 'db.sqlite3', THRESHOLDS, 'hash')
    assert not (tmp_path / 'db.sqlite3').exists()


@pytest.mark.parametrize('change', [{'label': 1}, {'split': 'Training'}, {'logistic_ai_probability': .3}])
def test_conflicting_rows_rejected_atomically(snapshot, tmp_path, change):
    db, _, _ = snapshot
    before = hashlib.sha256(db.read_bytes()).digest()
    source = tmp_path / 'conflict.csv'
    original = row('a', 0, .1, .1)
    export(source, [original, {**original, **change}])
    with pytest.raises(ValueError, match='[Cc]onflicting'):
        import_csv(source, db, THRESHOLDS, 'hash')
    assert hashlib.sha256(db.read_bytes()).digest() == before


def test_repeated_rows_preserved_and_empty_rejected(tmp_path):
    source, db = tmp_path / 'input.csv', tmp_path / 'db.sqlite3'
    repeated = row('a', 0, .1, .1)
    export(source, [repeated, repeated])
    info = import_csv(source, db, THRESHOLDS, 'hash')
    assert info['repeated_rows'] == 1 and info['sentences'] == 2 and info['documents'] == 1
    assert document(db, 'a')['document']['sentence_count'] == 2
    export(source, [])
    with pytest.raises(ValueError, match='no sentence'):
        import_csv(source, db, THRESHOLDS, 'hash')
    source.write_text('doc_ID,label\na,0\n')
    with pytest.raises(ValueError, match='columns'):
        import_csv(source, db, THRESHOLDS, 'hash')


def test_api_opt_in_validation_missing_and_stale(snapshot, tmp_path):
    db, _, rows = snapshot
    models = tmp_path / 'Models'
    models.mkdir()
    (models / 'metadata.pkl').write_bytes(b'test metadata, not unpickled')
    source = tmp_path / 'input.csv'
    export(source, rows)
    import_csv(source, db, THRESHOLDS, hashlib.sha256((models / 'metadata.pkl').read_bytes()).hexdigest())
    settings = Settings(performance_db=db, models_dir=models, performance_enabled=False)
    app = FastAPI()
    app.state.settings = settings
    register_exception_handlers(app)
    app.include_router(router)
    with TestClient(app) as client:
        assert client.get('/api/model-performance/status').json()['available'] is False
        assert client.get('/api/model-performance/records').status_code == 503
        assert client.get('/api/model-performance/documents/a').status_code == 503
        settings.performance_enabled = True
        response = client.get('/api/model-performance/summary')
        assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
        assert client.get('/api/model-performance/records?outcome=fp').json()['total'] == 1
        assert client.get('/api/model-performance/records?score_min=.9&score_max=.1').status_code == 422
        assert client.get('/api/model-performance/records?sort=invalid').status_code == 422
        assert client.get('/api/model-performance/records?page_size=10000').status_code == 422
        assert client.get('/api/model-performance/documents/missing').status_code == 404
        assert client.get('/api/model-performance/documents/e?page_size=1&page=2').json()['page'] == 2
        (models / 'metadata.pkl').write_bytes(b'changed')
        assert client.get('/api/model-performance/status').json()['available'] is False
        assert client.get('/api/model-performance/summary').status_code == 503
    settings.performance_db = tmp_path / 'missing.sqlite3'
    assert dataset_status(settings)['available'] is False
