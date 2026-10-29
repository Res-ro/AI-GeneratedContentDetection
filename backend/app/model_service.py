"""Loads the trained models once at start-up and turns text into a verdict.

The pipeline mirrors training exactly:
    text -> (normalise) -> sentences (NLTK) -> 12 features per sentence (spaCy)
         -> [scaler for logistic only] -> classifier -> probability per sentence
and then combines the sentence results into one document verdict.
"""
import logging
import queue
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import spacy

from app.concurrency import Deadline
from app.config import Settings
from app.errors import InvalidTextError, ServiceBusyError
from app.features import FEATURE_ORDER, ensure_nltk_data, extract_features, split_sentences
from app.integrity import load_checksums, load_verified
from app.sanitise import normalise_text
from app.schemas import AnalyzeResponse, ModelDescription, ModelInfoResponse, Limits, SentenceResult

logger = logging.getLogger("aidetect.model")

_MODEL_DETAILS = {
    "xgboost": ("XGBoost", "Boosted trees. Its saved threshold is strict, so it flags text as AI only when it is quite sure (favours precision)."),
    "logistic": ("Logistic regression", "Simple linear baseline. Its saved threshold balances precision and recall (best F1)."),
}


@dataclass
class _Bundle:
    scaler: Any
    logistic: Any
    xgboost: Any
    kmeans: Any
    kmeans_scaler: Any
    thresholds: dict[str, float]


def _recentre(probabilities: np.ndarray, threshold: float) -> np.ndarray:
    """Map probabilities so that the model's own threshold becomes 0.5.

    The saved thresholds (0.4 and 0.9) differ, so a raw 0.6 means "AI" to one
    model and "human" to the other. Re-centring makes scores comparable and
    makes "0.5 = on the fence" true for every model. Piecewise linear:
    [0, t] -> [0, 0.5] and [t, 1] -> [0.5, 1].
    """
    t = min(max(threshold, 1e-6), 1 - 1e-6)
    return np.where(
        probabilities < t,
        probabilities / (2 * t),
        0.5 + (probabilities - t) / (2 * (1 - t)),
    )


class ModelService:
    def __init__(self, settings: Settings):
        self._settings = settings
        ensure_nltk_data()

        # Every pickle is hash-checked before it is unpickled (see integrity.py).
        checksums = load_checksums(settings.checksums_file)
        d = settings.models_dir
        metadata = load_verified(d / "metadata.pkl", checksums)
        if list(metadata["features"]) != FEATURE_ORDER:
            raise RuntimeError("metadata.pkl feature order does not match features.py")

        self._bundle = _Bundle(
            scaler=load_verified(d / "scaler.pkl", checksums),
            logistic=load_verified(d / "LogisticModel.pkl", checksums),
            xgboost=load_verified(d / "XGBModel.pkl", checksums),
            kmeans=load_verified(d / "KmeansModel.pkl", checksums),
            kmeans_scaler=load_verified(d / "KmeansScaler.pkl", checksums),
            thresholds={
                "logistic": float(metadata["logistic_threshold"]),
                "xgboost": float(metadata["xgb_threshold"]),
            },
        )
        # One thread per prediction call is enough; avoids XGBoost spawning a
        # thread-per-core for every request when several run at once.
        self._bundle.xgboost.set_params(n_jobs=1)

        # spaCy pipelines are not guaranteed thread-safe, so each concurrent
        # worker borrows its own copy. All are loaded now, not per request.
        self._nlp_pool: queue.Queue = queue.Queue()
        for _ in range(max(1, settings.inference_workers)):
            self._nlp_pool.put(spacy.load("en_core_web_sm", disable=["ner", "parser", "lemmatizer"]))
        self._xgb_lock = threading.Lock()
        logger.info("Models loaded and verified: %s", ", ".join(sorted(checksums)))

    # -- metadata for GET /api/model-info --------------------------------------
    def info(self) -> ModelInfoResponse:
        s = self._settings
        return ModelInfoResponse(
            default_model="xgboost",
            models=[
                ModelDescription(
                    name=name, label=_MODEL_DETAILS[name][0],
                    threshold=self._bundle.thresholds[name], description=_MODEL_DETAILS[name][1],
                )
                for name in ("xgboost", "logistic")
            ],
            features=FEATURE_ORDER,
            style_clusters=int(self._bundle.kmeans.n_clusters),
            normalisation_enabled=s.normalise_input,
            limits=Limits(
                min_text_chars=s.min_text_chars, max_text_chars=s.max_text_chars,
                min_sentence_words=s.min_sentence_words, max_sentences=s.max_sentences,
            ),
        )

    @contextmanager
    def _borrow_nlp(self):
        try:
            nlp = self._nlp_pool.get(timeout=1)
        except queue.Empty:
            raise ServiceBusyError() from None
        try:
            yield nlp
        finally:
            self._nlp_pool.put(nlp)

    # -- the analysis itself (blocking; called from a worker thread) -----------
    def analyse(self, text: str, model_name: str, deadline: Deadline) -> AnalyzeResponse:
        started = time.perf_counter()
        s = self._settings
        warnings: list[str] = []

        suspicious = 0
        if s.normalise_input:
            text, suspicious = normalise_text(text)
            if suspicious:
                warnings.append(
                    f"{suspicious} look-alike, invisible or combining characters were found and "
                    "normalised before analysis. This can be a sign of an attempt to evade detection."
                )

        sentences, skipped = split_sentences(text, s.min_sentence_words)
        if not sentences:
            raise InvalidTextError(
                f"No sentence with at least {s.min_sentence_words} words was found. "
                "Please provide longer sentences."
            )
        if len(sentences) > s.max_sentences:
            raise InvalidTextError(f"The text has too many sentences to analyse (maximum {s.max_sentences}).")
        deadline.check()

        rows = []
        with self._borrow_nlp() as nlp:
            for sentence, doc in zip(sentences, nlp.pipe(sentences, batch_size=32)):
                rows.append(extract_features(sentence, doc))
                deadline.check()  # stop early if this request is taking too long
        # Named columns: the scaler was fitted on a DataFrame.
        frame = pd.DataFrame(rows, columns=FEATURE_ORDER)
        if frame["word_count"].sum() == 0:
            raise InvalidTextError("The text contains no words to analyse.")

        b = self._bundle
        if model_name == "logistic":
            probabilities = b.logistic.predict_proba(b.scaler.transform(frame))[:, 1]
        else:  # xgboost takes unscaled features
            with self._xgb_lock:
                probabilities = b.xgboost.predict_proba(frame)[:, 1]
        threshold = b.thresholds[model_name]
        flagged = probabilities >= threshold

        clusters: list[int | None] = [None] * len(sentences)
        if flagged.any():
            ids = b.kmeans.predict(b.kmeans_scaler.transform(frame[flagged]))
            for position, cluster in zip(np.flatnonzero(flagged), ids):
                clusters[int(position)] = int(cluster)

        ai_score = float(_recentre(probabilities, threshold).mean())
        verdict = "ai_generated" if ai_score >= 0.5 else "human_written"

        return AnalyzeResponse(
            verdict=verdict,
            confidence=round(max(ai_score, 1 - ai_score), 4),
            ai_score=round(ai_score, 4),
            ai_sentence_ratio=round(float(flagged.mean()), 4),
            model=model_name,
            threshold=threshold,
            sentence_count=len(sentences),
            skipped_sentences=skipped,
            word_count=int(frame["word_count"].sum()),
            suspicious_characters=suspicious,
            warnings=warnings,
            feature_means={k: round(float(v), 4) for k, v in frame.mean().items()},
            sentences=[
                SentenceResult(
                    index=i,
                    text=sentences[i],
                    ai_probability=round(float(probabilities[i]), 4),
                    label="ai_generated" if flagged[i] else "human_written",
                    style_cluster=clusters[i],
                    features={k: round(float(v), 4) for k, v in rows[i].items()},
                )
                for i in range(len(sentences))
            ],
            processing_ms=int((time.perf_counter() - started) * 1000),
        )
