"""Bounded, read-only queries against an offline evaluation snapshot."""
from contextlib import contextmanager
import hashlib
import json
import re
import sqlite3
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from .errors import AppError


class DatasetUnavailable(AppError):
    status_code = 503
    code = 'dataset_unavailable'
    message = 'Evaluation data is unavailable. Import the CSV and enable local dataset access.'


class RecordFilters(BaseModel):
    split: Literal['Test', 'Training', 'Validation', 'All'] = Field('Test', description='Original split; All includes training.', examples=['Test'])
    level: Literal['document', 'sentence'] = Field('document', description='Unit of each returned row.', examples=['document'])
    model: Literal['xgboost', 'logistic'] = Field('xgboost', description='Model used for prediction/outcome/score filters and sorting.', examples=['xgboost'])
    actual: Literal['all', '0', '1'] = Field('all', description='Supplied ground truth: 0 human, 1 AI.', examples=['1'])
    predicted: Literal['all', '0', '1'] = Field('all', description='Selected model verdict: 0 human, 1 AI.', examples=['0'])
    outcome: Literal['all', 'correct', 'incorrect', 'tp', 'tn', 'fp', 'fn'] = Field('all', description='Correctness category; AI is positive.', examples=['fn'])
    agreement: Literal['all', 'both_correct', 'both_wrong', 'xgboost_only', 'logistic_only'] = Field('all', description='Which models correctly classified the example.', examples=['xgboost_only'])
    score_min: float = Field(default=0, ge=0, le=1, description='Inclusive minimum re-centred score.', examples=[0.2])
    score_max: float = Field(default=1, ge=0, le=1, description='Inclusive maximum re-centred score, at least score_min.', examples=[0.8])
    q: str = Field(default='', max_length=200, description='Document-ID substring or sentence word prefixes. Multiple words must match one sentence.', examples=['artificial'])
    sort: Literal['score', 'correct', 'document_id', 'sentence_count'] = Field('document_id', description='Sort key; IDs are alphabetical, ties use internal record ID.', examples=['score'])
    direction: Literal['asc', 'desc'] = Field('asc', description='Sort direction.', examples=['desc'])
    page: int = Field(default=1, ge=1, le=1000000, description='One-based page, clamped to available pages.', examples=[1])
    page_size: int = Field(default=25, ge=1, le=100, description='Maximum records per page.', examples=[25])

    @model_validator(mode='after')
    def range_order(self):
        if self.score_min > self.score_max:
            raise ValueError('Minimum score must not exceed maximum score.')
        return self


@contextmanager
def connection(path):
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA query_only=ON')
        yield db
    finally:
        db.close()


def dataset_status(settings):
    if not settings.performance_enabled:
        return {'available': False, 'reason': 'Dataset access is disabled. Follow the local setup instructions in README.'}
    if not settings.performance_db.is_file():
        return {'available': False, 'reason': 'No evaluation dataset has been imported. Run the import script described in README.'}
    try:
        with connection(settings.performance_db) as db:
            info = json.loads(db.execute('SELECT value FROM metadata').fetchone()[0])
        digest = hashlib.sha256((settings.models_dir / 'metadata.pkl').read_bytes()).hexdigest()
        if info['version'] != 1 or info['metadata_sha256'] != digest:
            return {'available': False, 'reason': 'Evaluation metadata has changed. Re-import the prediction export using matching model metadata.'}
        return {'available': True, 'dataset': info}
    except (OSError, sqlite3.Error, ValueError, KeyError, TypeError):
        return {'available': False, 'reason': 'Evaluation data cannot be read. Re-import the CSV.'}


def require_dataset(settings):
    status = dataset_status(settings)
    if not status['available']:
        raise DatasetUnavailable(status['reason'])
    return settings.performance_db


def summary(path, split, level):
    with connection(path) as db:
        row = db.execute('SELECT value FROM summaries WHERE split=? AND level=?', (split, level)).fetchone()
        if not row:
            raise DatasetUnavailable()
        return {'split': split, 'level': level, **json.loads(row[0])}


def where(filters):
    # Identifiers come only from validated enum values. All user values are bound.
    model = filters.model
    prediction, score = f'r.{model}_prediction', f'r.{model}_score'
    clauses = ['r.level=?']
    values = [filters.level]
    # Every imported score is in [0,1]. Avoid forcing a score-index scan for
    # the default range, especially when browsing all 780k sentences by ID.
    if filters.score_min > 0 or filters.score_max < 1:
        clauses.append(f'{score} BETWEEN ? AND ?')
        values.extend([filters.score_min, filters.score_max])
    if filters.split != 'All':
        clauses.append('r.split=?')
        values.append(filters.split)
    for column, value in [('r.label', filters.actual), (prediction, filters.predicted), ('r.agreement', filters.agreement)]:
        if value != 'all':
            clauses.append(f'{column}=?')
            values.append(value)
    if filters.outcome in ('correct', 'incorrect'):
        clauses.append(f'{prediction} {"=" if filters.outcome == "correct" else "!="} r.label')
    elif filters.outcome != 'all':
        actual, predicted = {'tp': (1, 1), 'tn': (0, 0), 'fp': (0, 1), 'fn': (1, 0)}[filters.outcome]
        clauses.extend(['r.label=?', f'{prediction}=?'])
        values.extend([actual, predicted])
    if filters.q.strip():
        query = filters.q.strip()
        pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        tokens = re.findall(r'\w+', query, re.UNICODE)[:20]
        search = "r.document_id LIKE ? ESCAPE '\\'"
        values.append(pattern)
        if tokens:
            match = ' AND '.join('"' + token + '"*' for token in tokens)
            if filters.level == 'document':
                search += ' OR r.document_id IN (SELECT document_id FROM records WHERE id IN (SELECT rowid FROM sentence_search WHERE sentence_search MATCH ?))'
            else:
                search += ' OR r.id IN (SELECT rowid FROM sentence_search WHERE sentence_search MATCH ?)'
            values.append(match)
        clauses.append('(' + search + ')')
    return ' AND '.join(clauses), values


def serialize(row, include_features=False):
    result = dict(row)
    result.pop('row_hash', None)
    features = result.pop('features', '{}')
    if include_features:
        result['features'] = json.loads(features)
    for model in ('xgboost', 'logistic'):
        result[model + '_correct'] = result[model + '_prediction'] == result['label']
    return result


def records(path, filters):
    clause, values = where(filters)
    order = {'score': f'r.{filters.model}_score', 'correct': f'(r.{filters.model}_prediction=r.label)',
             'document_id': 'r.document_id COLLATE NOCASE', 'sentence_count': 'r.sentence_count'}[filters.sort]
    with connection(path) as db:
        total = db.execute(f'SELECT COUNT(*) FROM records r WHERE {clause}', values).fetchone()[0]
        pages = max(1, (total + filters.page_size - 1) // filters.page_size)
        page = min(filters.page, pages)
        # Sort lightweight IDs first. Sorting full sentence text/features can
        # spill hundreds of MB to disk for All/sentence queries.
        ids = [row[0] for row in db.execute(f'SELECT r.id FROM records r WHERE {clause} ORDER BY {order} {filters.direction},r.id ASC LIMIT ? OFFSET ?',
                                          [*values, filters.page_size, (page - 1) * filters.page_size])]
        by_id = {row['id']: row for row in db.execute('SELECT * FROM records WHERE id IN (' + ','.join('?' for _ in ids) + ')', ids)} if ids else {}
        rows = [by_id[i] for i in ids]
    return {'total': total, 'page': page, 'pages': pages, 'page_size': filters.page_size,
            'items': [serialize(row) for row in rows]}


def document(path, document_id, page=1, page_size=25):
    with connection(path) as db:
        row = db.execute("SELECT * FROM records WHERE level='document' AND document_id=?", (document_id,)).fetchone()
        if not row:
            return None
        pages = max(1, (row['sentence_count'] + page_size - 1) // page_size)
        page = min(page, pages)
        sentences = db.execute("SELECT * FROM records WHERE level='sentence' AND document_id=? ORDER BY position LIMIT ? OFFSET ?",
                               (document_id, page_size, (page - 1) * page_size)).fetchall()
        # Numeric-only progression; text/features are returned only for the current page.
        progression = db.execute("SELECT position,logistic_score,xgboost_score FROM records WHERE level='sentence' AND document_id=? ORDER BY position", (document_id,)).fetchall()
    return {'document': serialize(row), 'sentences': [serialize(s, True) for s in sentences],
            'progression': [dict(p) for p in progression], 'page': page, 'pages': pages}
