"""Request and response models (Pydantic). These also drive the /docs page."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.config import get_settings

_settings = get_settings()

ModelName = Literal["xgboost", "logistic"]
Label = Literal["ai_generated", "human_written"]

_Text = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=_settings.min_text_chars,
        max_length=_settings.max_text_chars,
    ),
]

_EXAMPLE_TEXT = (
    "Artificial intelligence has fundamentally transformed the way organisations approach "
    "data analysis and decision making. Furthermore, the integration of machine learning "
    "techniques enables systems to identify patterns that would otherwise remain hidden. "
    "I honestly didn't expect the results to be that good when we first tried it last week."
)


# ---- Requests ----------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",  # unknown fields are an error, not silently ignored
        json_schema_extra={"examples": [{"text": _EXAMPLE_TEXT, "model": "xgboost"}]},
    )

    text: _Text = Field(
        description=(
            f"The text to check. {_settings.min_text_chars}-{_settings.max_text_chars} characters, and it "
            f"must contain at least one sentence of {_settings.min_sentence_words}+ words. "
            "Treated purely as data and never rendered as HTML."
        )
    )
    model: ModelName = Field(
        default="xgboost",
        description="Which trained classifier to use. See GET /api/model-info for what each one does.",
    )


# ---- Responses ---------------------------------------------------------------
class SentenceResult(BaseModel):
    index: int = Field(description="Position among the analysed sentences, from 0.")
    text: str = Field(description="The sentence as analysed (after Unicode normalisation).")
    ai_probability: float = Field(ge=0, le=1, description="Raw model probability that this sentence is AI-generated.")
    label: Label = Field(description="Sentence verdict: probability compared with the model's saved threshold.")
    style_cluster: int | None = Field(
        default=None,
        description="For AI-flagged sentences only: which AI writing-style cluster (K-Means) it falls into.",
    )
    features: dict[str, float] = Field(description="The 12 writing-style features the model was given.")


class AnalyzeResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "verdict": "ai_generated",
                    "confidence": 0.82,
                    "ai_score": 0.82,
                    "ai_sentence_ratio": 0.67,
                    "model": "xgboost",
                    "threshold": 0.9,
                    "sentence_count": 2,
                    "skipped_sentences": 0,
                    "word_count": 40,
                    "suspicious_characters": 0,
                    "warnings": [],
                    "feature_means": {"word_count": 20.0, "avg_word_length": 5.9},
                    "sentences": [
                        {
                            "index": 0,
                            "text": "Artificial intelligence has fundamentally transformed the way organisations approach data analysis.",
                            "ai_probability": 0.95,
                            "label": "ai_generated",
                            "style_cluster": 1,
                            "features": {"word_count": 13.0, "avg_word_length": 6.6},
                        }
                    ],
                    "processing_ms": 41,
                }
            ]
        }
    )

    verdict: Label = Field(description="Overall result for the whole text.")
    confidence: float = Field(
        ge=0.5, le=1,
        description="Confidence in the verdict, from 0.5 (a coin flip) to 1.0 (certain). It is "
        "max(ai_score, 1 - ai_score).",
    )
    ai_score: float = Field(
        ge=0, le=1,
        description="Average sentence score, re-centred so 0.5 is each model's own decision threshold. "
        "At or above 0.5 the verdict is ai_generated.",
    )
    ai_sentence_ratio: float = Field(ge=0, le=1, description="Share of analysed sentences flagged as AI-generated.")
    model: ModelName
    threshold: float = Field(description="The saved decision threshold of the chosen model.")
    sentence_count: int = Field(description="Sentences analysed (10+ words each).")
    skipped_sentences: int = Field(description="Sentences ignored for being too short to judge.")
    word_count: int = Field(description="Alphabetic words across analysed sentences.")
    suspicious_characters: int = Field(
        description="Look-alike, invisible or combining characters found in the input "
        "(a sign of deliberate evasion). They are normalised away before analysis."
    )
    warnings: list[str] = Field(default_factory=list)
    feature_means: dict[str, float] = Field(description="Average of each feature across analysed sentences.")
    sentences: list[SentenceResult]
    processing_ms: int


class ModelDescription(BaseModel):
    name: ModelName
    label: str
    threshold: float
    description: str


class Limits(BaseModel):
    min_text_chars: int
    max_text_chars: int
    min_sentence_words: int
    max_sentences: int


class ModelInfoResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "default_model": "xgboost",
                    "models": [
                        {
                            "name": "xgboost",
                            "label": "XGBoost",
                            "threshold": 0.9,
                            "description": "Boosted trees; strict threshold favours precision.",
                        }
                    ],
                    "features": ["word_count", "avg_word_length"],
                    "style_clusters": 2,
                    "normalisation_enabled": True,
                    "limits": {
                        "min_text_chars": 20,
                        "max_text_chars": 10000,
                        "min_sentence_words": 10,
                        "max_sentences": 200,
                    },
                }
            ]
        }
    )

    default_model: ModelName
    models: list[ModelDescription]
    features: list[str]
    style_clusters: int
    normalisation_enabled: bool
    limits: Limits


class HealthResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"status": "ok", "models_loaded": True}]})

    status: Literal["ok"]
    models_loaded: bool
