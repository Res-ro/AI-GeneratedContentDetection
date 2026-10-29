"""Defence against unsafe model loading.

joblib/pickle can execute arbitrary code while loading a file. We therefore
read each model file ONCE into memory, compare its SHA-256 with the value
committed in model_checksums.json, and only then unpickle those same bytes
(so the file cannot be swapped between the check and the load).
"""
import hashlib
import hmac
import io
import json
import logging
from pathlib import Path
from typing import Any

import joblib

logger = logging.getLogger("aidetect.integrity")


class ModelIntegrityError(RuntimeError):
    """A model file is missing, unlisted, or does not match its recorded hash."""


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_checksums(path: Path) -> dict[str, str]:
    try:
        checksums = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ModelIntegrityError(
            f"Checksum file {path.name} not found. Generate it once with "
            "'python scripts/generate_checksums.py' and commit it."
        ) from exc
    except (OSError, ValueError) as exc:
        raise ModelIntegrityError(f"Checksum file {path.name} is unreadable.") from exc
    if not isinstance(checksums, dict):
        raise ModelIntegrityError(f"Checksum file {path.name} has the wrong format.")
    return checksums


def load_verified(path: Path, checksums: dict[str, str]) -> Any:
    expected = checksums.get(path.name)
    if not expected:
        raise ModelIntegrityError(f"{path.name} has no recorded checksum; refusing to load it.")
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise ModelIntegrityError(f"{path.name} could not be read.") from exc

    actual = sha256_of(data)
    if not hmac.compare_digest(actual, str(expected).lower()):
        logger.critical("Checksum mismatch for %s (expected %s, got %s)", path.name, expected, actual)
        raise ModelIntegrityError(f"{path.name} does not match its recorded checksum; refusing to load it.")

    return joblib.load(io.BytesIO(data))
