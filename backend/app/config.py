"""Application settings.

Every value can be overridden with an environment variable (prefix AIDETECT_)
or a local .env file, which is git-ignored. No secrets are needed by this
application; the file exists so that deployment-specific values (CORS origin,
limits) never have to be edited in source code.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AIDETECT_", env_file=".env", extra="ignore"
    )

    # --- Model files ---------------------------------------------------------
    models_dir: Path = BACKEND_ROOT / "Models"
    # SHA-256 of every .pkl, committed to git. The server refuses to start if a
    # model file does not match (pickle files can run code when loaded).
    checksums_file: Path = BACKEND_ROOT / "model_checksums.json"

    # --- CORS / hosts --------------------------------------------------------
    # Comma-separated list of EXACT front-end origins. "*" is rejected.
    cors_origins: str = "http://localhost:5173"
    allowed_hosts: str = "localhost,127.0.0.1,testserver"

    # --- Input limits (enforced on the back end) -----------------------------
    max_text_chars: int = 10_000
    min_text_chars: int = 20
    # 10,000 chars * 12 bytes (worst-case JSON escaping of one character)
    # = 120,000 bytes; round up to 128 KiB.
    max_body_bytes: int = 128 * 1024
    min_sentence_words: int = 10  # same cut-off as DataProcessing.py
    max_sentences: int = 200

    # --- Rate limiting (per client IP, sliding window) ------------------------
    rate_limit_requests: int = 20
    rate_limit_window_seconds: int = 60

    # --- Denial-of-service protection ----------------------------------------
    # When False, inference runs directly in the event loop with no limits.
    # This exists ONLY so the "attack succeeds without the defence" part of the
    # demo video can be recorded. Never disable it in real use.
    inference_guard_enabled: bool = True
    inference_workers: int = 2  # analyses running at once
    inference_queue_size: int = 4  # extra analyses allowed to wait
    inference_queue_timeout_seconds: float = 2.0  # max wait for a free worker
    inference_deadline_seconds: float = 8.0  # max run time of one analysis

    # --- Evasion defence -----------------------------------------------------
    # Normalise look-alike Unicode before feature extraction. Can be switched
    # off to measure the evasion attack "before" the defence.
    normalise_input: bool = True

    # --- Transport / headers -------------------------------------------------
    enable_hsts: bool = False  # turn on only when served over HTTPS
    enable_docs: bool = True  # /docs and /openapi.json; set False in production

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard_origin(cls, value: str) -> str:
        if "*" in value:
            raise ValueError("AIDETECT_CORS_ORIGINS must list exact origins, not '*'")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
