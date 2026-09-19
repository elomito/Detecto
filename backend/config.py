"""Central configuration loaded from environment / .env files."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parent

# Root .env first, then backend/.env overrides
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_ROOT / ".env", override=True)


def _env(key: str, default: str) -> str:
    value = os.getenv(key)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _as_path(value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    return path.resolve()


def _as_float(key: str, default: float) -> float:
    raw = _env(key, str(default))
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid float for {key}={raw!r}") from exc


def _as_int(key: str, default: int) -> int:
    raw = _env(key, str(default))
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid int for {key}={raw!r}") from exc


HOST = _env("HOST", "0.0.0.0")
PORT = _as_int("PORT", 8080)

MODEL_PATH = _env("MODEL_PATH", "yolov8n.pt")
DETECT_CONFIDENCE = _as_float("DETECT_CONFIDENCE", 0.25)
DETECT_IOU = _as_float("DETECT_IOU", 0.45)

SQLITE_PATH = _as_path(_env("SQLITE_PATH", "data/detecto.db"))
LOG_DIR = _as_path(_env("LOG_DIR", "logs"))
LOG_FILE_NAME = _env("LOG_FILE", "detecto.log")
LOG_FILE = LOG_DIR / LOG_FILE_NAME

MAX_UPLOAD_MB = _as_int("MAX_UPLOAD_MB", 15)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Live webcam: persist at most one history row every N seconds
LIVE_HISTORY_INTERVAL_SEC = _as_float("LIVE_HISTORY_INTERVAL_SEC", 5.0)

_cors_raw = _env("CORS_ORIGINS", "*")
CORS_ORIGINS = [part.strip() for part in _cors_raw.split(",") if part.strip()] or ["*"]
