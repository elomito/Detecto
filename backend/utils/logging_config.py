"""Shared logging setup for Detecto backend."""

from __future__ import annotations

import logging
import sys

from config import LOG_DIR, LOG_FILE


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("detecto")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )

    stream = logging.StreamHandler(sys.stderr)
    stream.setFormatter(formatter)
    logger.addHandler(stream)

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(LOG_FILE)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError as exc:
        logger.warning("Could not open log file %s: %s", LOG_FILE, exc)

    logger.propagate = False
    return logger


