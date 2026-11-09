"""Validate an export and atomically build an indexed evaluation database."""
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
from datetime import datetime, timezone

import numpy as np
from .performance_metrics import metrics
from .score_math import recentre

FEATURES = ('word_count avg_word_length lexical_diversity stopword_ratio punctuation_ratio '
            'contraction_ratio transition_word_ratio noun_ratio verb_ratio adjective_ratio '
            'adverb_ratio pronoun_ratio').split()
MODELS = ('logistic', 'xgboost')
SPLITS = ('Training', 'Validation', 'Test')
VERSION = 1


def import_csv(source: Path, destination: Path, thresholds: dict, metadata_hash: str):
    """Preserve identical repetitions; reject conflicting labels, splits and values.

    Sentence positions follow export order, not the complete original document.
    A failed import leaves any previous database intact.
    """
    if any(not math.isfinite(thresholds[m]) or not 0 < thresholds[m] < 1 for m in MODELS):
        raise ValueError('Saved thresholds must be finite and strictly between 0 and 1.')
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='performance-', suffix='.sqlite3', dir=destination.parent)
    os.close(fd)
    db = sqlite3.connect(temporary)
    try:
        db.executescript('''
            CREATE TABLE records (
              id INTEGER PRIMARY KEY, level TEXT NOT NULL, document_id TEXT NOT NULL,
              split TEXT NOT NULL, label INTEGER NOT NULL, position INTEGER,
              sentence_count INTEGER NOT NULL, text TEXT NOT NULL,
              logistic_raw REAL, xgboost_raw REAL,
              logistic_score REAL NOT NULL, xgboost_score REAL NOT NULL,
              logistic_prediction INTEGER NOT NULL, xgboost_prediction INTEGER NOT NULL,
              logistic_flagged_ratio REAL NOT NULL, xgboost_flagged_ratio REAL NOT NULL,
              agreement TEXT NOT NULL, features TEXT NOT NULL, row_hash TEXT
            );
            CREATE TABLE metadata (value TEXT NOT NULL);
            CREATE TABLE summaries (split TEXT, level TEXT, value TEXT, PRIMARY KEY(split, level));
        ''')
        docs, count, batch = {}, 0, []
        required = {'doc_ID', 'sentence', 'label', 'split', *(m + '_ai_probability' for m in MODELS), *FEATURES}
        insert = 'INSERT INTO records VALUES (NULL,' + ','.join('?' * 18) + ')'
        with Path(source).open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames) or not required <= set(reader.fieldnames):
                raise ValueError('CSV requires prediction, label, split, ID, sentence and feature columns, without duplicate headers.')
            for line, row in enumerate(reader, 2):
                try:
                    if None in row or any(row.get(k) is None or not row[k].strip() for k in required):
                        raise ValueError('missing value or malformed row')
                    doc_id, split, sentence = row['doc_ID'].strip(), row['split'].strip(), row['sentence']
                    if row['label'] not in ('0', '1') or split not in SPLITS:
                        raise ValueError('label must be 0/1 and split Training/Validation/Test')
                    if len(doc_id) > 200 or len(sentence) > 100000:
                        raise ValueError('document ID or sentence exceeds supported length')
                    label = int(row['label'])
                    raw = [float(row[m + '_ai_probability']) for m in MODELS]
                    features = {k: float(row[k]) for k in FEATURES}
                    if any(not math.isfinite(p) or not 0 <= p <= 1 for p in raw):
                        raise ValueError('probabilities must be finite and within [0, 1]')
                    if any(not math.isfinite(v) or v < 0 for v in features.values()):
                        raise ValueError('features must be finite and non-negative')
                    doc = docs.setdefault(doc_id, {'label': label, 'split': split, 'count': 0})
                    if doc['label'] != label or doc['split'] != split:
                        raise ValueError('conflicting label or cross-split document ID')
                except (ValueError, TypeError) as exc:
                    raise ValueError(f'CSV row {line}: {exc}') from exc
                scores = [float(recentre(p, thresholds[m])) for m, p in zip(MODELS, raw)]
                predictions = [int(p >= thresholds[m]) for m, p in zip(MODELS, raw)]
                good = [p == label for p in predictions]
                agreement = 'both_correct' if all(good) else 'both_wrong' if not any(good) else 'logistic_only' if good[0] else 'xgboost_only'
                fingerprint = hashlib.sha256(json.dumps([doc_id, split, label, sentence, raw, features], sort_keys=True).encode()).hexdigest()
                batch.append(('sentence', doc_id, split, label, doc['count'], 1, sentence,
                              *raw, *scores, *predictions, *predictions, agreement, json.dumps(features), fingerprint))
                doc['count'] += 1
                count += 1
                if len(batch) >= 5000:
                    db.executemany(insert, batch)
                    batch.clear()
            db.executemany(insert, batch)
        if not count:
            raise ValueError('CSV contains no sentence records.')
        repeated = db.execute('SELECT COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM records GROUP BY row_hash HAVING COUNT(*)>1)').fetchone()[0]
        if db.execute('SELECT 1 FROM records GROUP BY document_id, text HAVING COUNT(DISTINCT row_hash)>1 LIMIT 1').fetchone():
            raise ValueError('Conflicting values for repeated sentence text within a document.')
        db.execute('''INSERT INTO records
          (level,document_id,split,label,position,sentence_count,text,logistic_score,xgboost_score,
           logistic_prediction,xgboost_prediction,logistic_flagged_ratio,xgboost_flagged_ratio,agreement,features)
          SELECT 'document',document_id,split,label,NULL,COUNT(*),'',AVG(logistic_score),AVG(xgboost_score),
           AVG(logistic_score)>=0.5,AVG(xgboost_score)>=0.5,AVG(logistic_prediction),AVG(xgboost_prediction),
           CASE WHEN (AVG(logistic_score)>=0.5)=label AND (AVG(xgboost_score)>=0.5)=label THEN 'both_correct'
                WHEN (AVG(logistic_score)>=0.5)!=label AND (AVG(xgboost_score)>=0.5)!=label THEN 'both_wrong'
                WHEN (AVG(logistic_score)>=0.5)=label THEN 'logistic_only' ELSE 'xgboost_only' END,'{}'
          FROM records GROUP BY document_id''')
        db.executescript('''
          CREATE INDEX records_document ON records(document_id,level,position);
          CREATE INDEX records_split ON records(level,split,document_id);
          CREATE INDEX records_level_document ON records(level,document_id COLLATE NOCASE,id);
          CREATE INDEX records_split_document ON records(level,split,document_id COLLATE NOCASE,id);
          CREATE INDEX records_level_logistic ON records(level,logistic_score,id);
          CREATE INDEX records_level_xgboost ON records(level,xgboost_score,id);
          CREATE INDEX records_logistic ON records(level,split,logistic_score,id);
          CREATE INDEX records_xgboost ON records(level,split,xgboost_score,id);
          CREATE INDEX records_agreement ON records(level,split,agreement);
          CREATE VIRTUAL TABLE sentence_search USING fts5(text,content='records',content_rowid='id');
          INSERT INTO sentence_search(rowid,text) SELECT id,text FROM records WHERE level='sentence';
        ''')
        for level in ('document', 'sentence'):
            for split in ('All', *SPLITS):
                rows = db.execute("SELECT label,logistic_score,xgboost_score FROM records WHERE level=? AND (?='All' OR split=?)", (level, split, split)).fetchall()
                values = np.array(rows, dtype=float).reshape(-1, 3)
                result = {m: metrics(values[:, 0], values[:, i + 1]) for i, m in enumerate(MODELS)}
                agreement = {key: 0 for key in ('both_correct', 'both_wrong', 'logistic_only', 'xgboost_only')}
                agreement.update(dict(db.execute("SELECT agreement,COUNT(*) FROM records WHERE level=? AND (?='All' OR split=?) GROUP BY agreement", (level, split, split))))
                result['agreement'] = agreement
                result['agreement_rate'] = (agreement['both_correct'] + agreement['both_wrong']) / len(rows) if rows else None
                db.execute('INSERT INTO summaries VALUES (?,?,?)', (split, level, json.dumps(result, allow_nan=False)))
        with Path(source).open('rb') as handle:
            source_hash = hashlib.file_digest(handle, 'sha256').hexdigest()
        info = {'version': VERSION, 'sentences': count, 'documents': len(docs), 'repeated_rows': repeated,
                'thresholds': thresholds, 'metadata_sha256': metadata_hash, 'source_sha256': source_hash,
                'imported_at': datetime.now(timezone.utc).isoformat(), 'features': FEATURES,
                'splits': {s: {'sentences': sum(d['count'] for d in docs.values() if d['split'] == s),
                               'documents': sum(d['split'] == s for d in docs.values())} for s in SPLITS}}
        db.execute('INSERT INTO metadata VALUES (?)', (json.dumps(info),))
        db.execute('ANALYZE')
        db.commit()
        db.close()
        os.replace(temporary, destination)
        return info
    finally:
        db.close()
        if os.path.exists(temporary):
            os.unlink(temporary)
