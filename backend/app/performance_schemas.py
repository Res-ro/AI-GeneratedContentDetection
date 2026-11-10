"""Evaluation API contracts. All documentation examples below are illustrative,
not measurements of the supplied dataset. Names/fields match the existing API.
"""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Split = Literal['Test', 'Training', 'Validation']
Selection = Literal['Test', 'Training', 'Validation', 'All']
Level = Literal['document', 'sentence']
Score = Annotated[float, Field(ge=0, le=1)]
Count = Annotated[int, Field(ge=0)]
Agreement = Literal['both_correct', 'both_wrong', 'xgboost_only', 'logistic_only']


class SplitCounts(BaseModel):
    sentences: Count = Field(description='Retained sentence rows, including identical repetitions.')
    documents: Count = Field(description='Unique documents, counted once.')


class Thresholds(BaseModel):
    logistic: Score = Field(description='Saved raw logistic decision threshold; not a re-centred score.')
    xgboost: Score = Field(description='Saved raw XGBoost decision threshold.')


class DatasetProvenance(SplitCounts):
    version: int = Field(description='Imported SQLite schema version.')
    repeated_rows: Count = Field(description='Identical repeated sentence rows retained by the importer.')
    thresholds: Thresholds = Field(description='Thresholds read from verified saved metadata.')
    metadata_sha256: str = Field(description='SHA-256 of model metadata used during import.')
    source_sha256: str = Field(description='SHA-256 of the source prediction CSV.')
    imported_at: str = Field(description='UTC import timestamp in ISO 8601 format.')
    features: list[str] = Field(description='Writing-style feature column names.')
    splits: dict[Split, SplitCounts] = Field(description='Counts for each dataset split.')


class DatasetAvailable(BaseModel):
    available: Literal[True] = Field(description='Local access is enabled and the snapshot is readable and current.')
    dataset: DatasetProvenance = Field(description='Import provenance, not the dataset text.')
    model_config = ConfigDict(json_schema_extra={'description': 'Illustrative import metadata; not actual dataset measurements.', 'examples': [{
        'available': True, 'dataset': {'version': 1, 'documents': 1, 'sentences': 1, 'repeated_rows': 0,
        'thresholds': {'logistic': .4, 'xgboost': .9}, 'metadata_sha256': '0'*64, 'source_sha256': '1'*64,
        'imported_at': '2026-01-01T00:00:00+00:00', 'features': ['word_count'],
        'splits': {s: {'documents': int(s == 'Test'), 'sentences': int(s == 'Test')} for s in ('Test', 'Training', 'Validation')}}}]})


class DatasetUnavailableResponse(BaseModel):
    available: Literal[False] = Field(description='No evaluation records can currently be served.')
    reason: str = Field(description='Safe explanation of disabled, absent, unreadable or stale data.')
    model_config = ConfigDict(json_schema_extra={'examples': [{'available': False, 'reason': 'Dataset access is disabled. Follow the local setup instructions in README.'}]})


DatasetStatusResponse = DatasetAvailable | DatasetUnavailableResponse


class ConfusionCounts(BaseModel):
    tp: Count = Field(description='Actual AI predicted AI (true positive).')
    tn: Count = Field(description='Actual human predicted human (true negative).')
    fp: Count = Field(description='Actual human predicted AI (false positive).')
    fn: Count = Field(description='Actual AI predicted human (false negative).')


class ModelMetrics(BaseModel):
    total: Count = Field(description='Examples evaluated at the selected document/sentence level.')
    correct: Count = Field(description='True positives plus true negatives.')
    incorrect: Count = Field(description='False positives plus false negatives.')
    accuracy: Score | None = Field(description='Correct / total; null for an empty selection.')
    precision: Score | None = Field(description='TP / (TP + FP); null when no AI predictions exist.')
    recall: Score | None = Field(description='TP / (TP + FN); null when no actual AI examples exist.')
    f1: Score | None = Field(description='2TP / (2TP + FP + FN); null for a zero denominator.')
    roc_auc: Score | None = Field(description='ROC area using continuous re-centred scores; null without both actual classes.')
    average_precision: Score | None = Field(description='Average precision using continuous scores; null without actual AI examples.')
    confusion: ConfusionCounts = Field(description='AI is the positive class.')
    histogram: dict[Literal['0', '1'], Annotated[list[Count], Field(min_length=10, max_length=10)]] = Field(description='Ten equal-width score bins by actual label (0 human, 1 AI); last bin includes 1. Other upper bounds are excluded.')


class AgreementCounts(BaseModel):
    both_correct: Count = Field(description='Both predictions equal the supplied label.')
    both_wrong: Count = Field(description='Both predictions differ from the supplied label.')
    logistic_only: Count = Field(description='Only logistic regression is correct.')
    xgboost_only: Count = Field(description='Only XGBoost is correct.')


_METRICS_EXAMPLE = {'total': 2, 'correct': 2, 'incorrect': 0, 'accuracy': 1., 'precision': 1., 'recall': 1., 'f1': 1., 'roc_auc': 1., 'average_precision': 1.,
                    'confusion': {'tp': 1, 'tn': 1, 'fp': 0, 'fn': 0}, 'histogram': {'0': [0,1,0,0,0,0,0,0,0,0], '1': [0,0,0,0,0,0,0,0,1,0]}}


class PerformanceSummary(BaseModel):
    split: Selection = Field(description='Selected split. All includes training and is not independent generalisation.')
    level: Level = Field(description='Unit counted once in the metrics.')
    logistic: ModelMetrics = Field(description='Logistic regression on the same selection as XGBoost.')
    xgboost: ModelMetrics = Field(description='XGBoost on the same selection as logistic regression.')
    agreement: AgreementCounts = Field(description='Correctness categories at the selected level.')
    agreement_rate: Score | None = Field(description='(Both correct + both wrong) / total; null if empty.')
    model_config = ConfigDict(json_schema_extra={'description': 'Illustrative two-example summary; not actual model performance.', 'examples': [{
        'split': 'Test', 'level': 'document', 'logistic': _METRICS_EXAMPLE, 'xgboost': _METRICS_EXAMPLE,
        'agreement': {'both_correct': 2, 'both_wrong': 0, 'logistic_only': 0, 'xgboost_only': 0}, 'agreement_rate': 1.}]})


class EvaluationRecord(BaseModel):
    id: int = Field(description='Internal record identifier within this imported snapshot.')
    level: Level = Field(description='Document aggregate or retained sentence.')
    document_id: str = Field(description='Original document identifier; labels are not independently verified.')
    split: Split = Field(description='Original dataset split.')
    label: Literal[0, 1] = Field(description='Supplied ground truth: 0 human-written, 1 AI-generated.')
    position: int | None = Field(description='Zero-based retained-sentence order; null for a document.')
    sentence_count: Count = Field(description='Retained sentence count for a document, or 1 for a sentence row.')
    text: str = Field(description='Retained sentence text, or empty string for document rows. Not necessarily complete original text.')
    logistic_raw: Score | None = Field(description='Raw sentence probability; null for document aggregates.')
    xgboost_raw: Score | None = Field(description='Raw sentence probability; null for document aggregates.')
    logistic_score: Score = Field(description='Re-centred sentence score or its document mean; not a calibrated probability.')
    xgboost_score: Score = Field(description='Re-centred sentence score or its document mean; not a calibrated probability.')
    logistic_prediction: Literal[0, 1] = Field(description='Binary logistic verdict (1 AI), using saved thresholds.')
    xgboost_prediction: Literal[0, 1] = Field(description='Binary XGBoost verdict (1 AI), using saved thresholds.')
    logistic_flagged_ratio: Score = Field(description='Fraction of retained sentences flagged AI; binary flag on sentence rows.')
    xgboost_flagged_ratio: Score = Field(description='Fraction of retained sentences flagged AI; binary flag on sentence rows.')
    agreement: Agreement = Field(description='Which models agree with the supplied ground truth.')
    logistic_correct: bool = Field(description='Logistic prediction equals supplied label.')
    xgboost_correct: bool = Field(description='XGBoost prediction equals supplied label.')


class EvaluationSentence(EvaluationRecord):
    features: dict[str, float] = Field(description='All exported writing-style features for this retained sentence.')


class ProgressionPoint(BaseModel):
    position: int = Field(description='Zero-based retained-sentence position.')
    logistic_score: Score = Field(description='Re-centred logistic sentence score.')
    xgboost_score: Score = Field(description='Re-centred XGBoost sentence score.')


_DOCUMENT_EXAMPLE = {'id': 2, 'level': 'document', 'document_id': 'illustrative-001', 'split': 'Test', 'label': 0, 'position': None, 'sentence_count': 1, 'text': '',
                     'logistic_raw': None, 'xgboost_raw': None, 'logistic_score': .125, 'xgboost_score': .11111111111111112,
                     'logistic_prediction': 0, 'xgboost_prediction': 0, 'logistic_flagged_ratio': 0., 'xgboost_flagged_ratio': 0.,
                     'agreement': 'both_correct', 'logistic_correct': True, 'xgboost_correct': True}


class PerformanceRecords(BaseModel):
    total: Count = Field(description='All examples matching the combined filters, before pagination.')
    page: int = Field(ge=1, description='Actual page, clamped to the last available page.')
    pages: int = Field(ge=1, description='Total pages; 1 when no examples match.')
    page_size: int = Field(ge=1, le=100, description='Requested maximum records per page.')
    items: list[EvaluationRecord] = Field(description='Only this page, in stable requested order; features omitted.')
    model_config = ConfigDict(json_schema_extra={'description': 'Illustrative page; not a real dataset document.', 'examples': [{'total': 1, 'page': 1, 'pages': 1, 'page_size': 25, 'items': [_DOCUMENT_EXAMPLE]}]})


class PerformanceDocument(BaseModel):
    document: EvaluationRecord = Field(description='Aggregate predictions for both models, counted once.')
    sentences: list[EvaluationSentence] = Field(description='Current page of retained sentences, with raw/adjusted scores and features.')
    progression: list[ProgressionPoint] = Field(description='Numeric scores for all retained sentences, without text.')
    page: int = Field(ge=1, description='Actual sentence page, clamped to the last page.')
    pages: int = Field(ge=1, description='Number of sentence pages.')
    model_config = ConfigDict(json_schema_extra={'description': 'Illustrative inspection response; not measured data.', 'examples': [{
        'document': _DOCUMENT_EXAMPLE,
        'sentences': [{**_DOCUMENT_EXAMPLE, 'id': 1, 'level': 'sentence', 'position': 0, 'text': 'Illustrative retained text for API documentation, not a real dataset record.',
                       'logistic_raw': .1, 'xgboost_raw': .2, 'features': {'word_count': 12.}}],
        'progression': [{'position': 0, 'logistic_score': .125, 'xgboost_score': .11111111111111112}], 'page': 1, 'pages': 1}]})
