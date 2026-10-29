"""Sentence splitting and feature extraction.

extract_features() is a line-for-line port of the function in the training
repository's DataProcessing.py. Any difference here would silently feed the
model numbers it was never trained on, so do not "tidy" the arithmetic.
"""
import re
import string

import nltk
from nltk.tokenize import sent_tokenize

# Order matters: it is the column order the scaler and models were fitted on.
FEATURE_ORDER = [
    "word_count",
    "avg_word_length",
    "lexical_diversity",
    "stopword_ratio",
    "punctuation_ratio",
    "contraction_ratio",
    "transition_word_ratio",
    "noun_ratio",
    "verb_ratio",
    "adjective_ratio",
    "adverb_ratio",
    "pronoun_ratio",
]

_CONTRACTION_RE = re.compile(r"\b\w+(?:n't|'re|'ve|'ll|'d|'s|'m)\b")
_TRANSITION_WORDS = frozenset(
    [
        "however", "therefore", "moreover", "consequently", "nevertheless",
        "furthermore", "thus", "hence", "nonetheless", "accordingly", "finally",
    ]
)
_PUNCTUATION = frozenset(string.punctuation)


def ensure_nltk_data() -> None:
    """Fail at start-up (not on the first request) if the tokenizer is missing."""
    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError as exc:
        raise RuntimeError(
            "NLTK tokenizer data is missing. Run:  "
            "python -m nltk.downloader punkt punkt_tab"
        ) from exc


def split_sentences(text: str, min_words: int) -> tuple[list[str], int]:
    """Split like training did, keeping sentences with >= min_words words.

    Returns (kept_sentences, number_of_sentences_skipped_for_being_too_short).
    """
    kept: list[str] = []
    skipped = 0
    for raw in sent_tokenize(text):
        sentence = raw.strip()
        if not sentence:
            continue
        if len(sentence.split()) >= min_words:
            kept.append(sentence)
        else:
            skipped += 1
    return kept, skipped


def extract_features(sentence: str, doc) -> dict[str, float]:
    words = [token for token in doc if token.is_alpha]
    word_strings = [token.text.lower() for token in words]
    word_count = len(words)

    avg_word_length = (
        sum(len(token) for token in word_strings) / word_count if word_count > 0 else 0
    )

    punctuation_count = sum(1 for char in sentence if char in _PUNCTUATION)
    punctuation_ratio = punctuation_count / len(sentence) if len(sentence) > 0 else 0

    contractions = _CONTRACTION_RE.findall(sentence.lower())
    contraction_ratio = len(contractions) / word_count if word_count > 0 else 0

    transition_word_count = sum(1 for word in word_strings if word in _TRANSITION_WORDS)
    transition_word_ratio = transition_word_count / word_count if word_count > 0 else 0

    def ratio(count: int) -> float:
        return count / word_count if word_count > 0 else 0

    return {
        "word_count": word_count,
        "avg_word_length": avg_word_length,
        "lexical_diversity": ratio(len(set(word_strings))),
        "stopword_ratio": ratio(sum(token.is_stop for token in words)),
        "punctuation_ratio": punctuation_ratio,
        "contraction_ratio": contraction_ratio,
        "transition_word_ratio": transition_word_ratio,
        "noun_ratio": ratio(sum(token.pos_ in {"NOUN", "PROPN"} for token in words)),
        "verb_ratio": ratio(sum(token.pos_ in {"VERB", "AUX"} for token in words)),
        "adjective_ratio": ratio(sum(token.pos_ == "ADJ" for token in words)),
        "adverb_ratio": ratio(sum(token.pos_ == "ADV" for token in words)),
        "pronoun_ratio": ratio(sum(token.pos_ == "PRON" for token in words)),
    }
