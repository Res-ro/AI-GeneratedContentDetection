"""Input normalisation: the defence against Unicode detection evasion.

The classifier only sees counts and ratios computed from characters. An
attacker can change those numbers without changing what a person reads, by
swapping Latin letters for look-alikes (Cyrillic "а" for Latin "a"), inserting
zero-width characters inside words, or adding combining marks. This module
maps all of those back to plain characters *before* feature extraction.

Deliberately NOT done: curly quotes and apostrophes are left alone, because the
training pipeline did not touch them and the model must see its input the same
way it saw its training data.
"""
import unicodedata

# Look-alike letters from the scripts attackers use most (Cyrillic, Greek).
# Not exhaustive: Unicode's confusables.txt is the complete source.
_CONFUSABLES = {
    # Cyrillic lower
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "і": "i", "ј": "j", "ѕ": "s", "һ": "h", "ԁ": "d", "ԛ": "q", "ԝ": "w",
    "ɡ": "g", "ӏ": "l",
    # Cyrillic upper
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S",
    "У": "Y",
    # Greek lower
    "α": "a", "ο": "o", "ν": "v", "ρ": "p", "ι": "i", "κ": "k", "υ": "u",
    "ε": "e", "τ": "t",
    # Greek upper
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}
_CONFUSABLE_TABLE = str.maketrans(_CONFUSABLES)

# Format (zero-width, bidi), combining marks, private-use and surrogate chars.
_DROPPED_CATEGORIES = {"Cf", "Mn", "Me", "Co", "Cs"}
_KEPT_CONTROLS = {"\n", "\r", "\t"}


def _is_suspicious(ch: str) -> bool:
    if ch in _CONFUSABLES:
        return True
    cat = unicodedata.category(ch)
    return cat in _DROPPED_CATEGORIES or (cat == "Cc" and ch not in _KEPT_CONTROLS)


def normalise_text(text: str) -> tuple[str, int]:
    """Return (normalised_text, number_of_suspicious_characters_found)."""
    suspicious = sum(1 for ch in text if _is_suspicious(ch))

    # NFKD folds full-width letters, ligatures and similar compatibility forms
    # to plain ones, and splits accents off so they can be dropped below.
    decomposed = unicodedata.normalize("NFKD", text)
    cleaned: list[str] = []
    for ch in decomposed:
        cat = unicodedata.category(ch)
        if cat in _DROPPED_CATEGORIES:
            continue
        if cat == "Cc" and ch not in _KEPT_CONTROLS:
            cleaned.append(" ")
            continue
        cleaned.append(ch)

    result = "".join(cleaned).translate(_CONFUSABLE_TABLE)
    return unicodedata.normalize("NFC", result), suspicious
