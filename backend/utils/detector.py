"""YOLOv8 person detector"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import numpy as np
from ultralytics import YOLO

from config import DETECT_CONFIDENCE, DETECT_IOU, MODEL_PATH
from utils.preprocessing import load_image

# COCO class id for "person"
PERSON_CLASS_ID = 0

_model: YOLO | None = None
_loaded_weights: str | None = None


class DetectorError(RuntimeError):
    """Raised when the model cannot be loaded or inference fails."""


def get_model(weights: str | Path | None = None) -> YOLO:
    """Load (and cache) a pretrained YOLOv8 model."""
    global _model, _loaded_weights
    path = str(weights or MODEL_PATH)
    if _model is not None and _loaded_weights == path and weights is None:
        return _model
    try:
        _model = YOLO(path)
        _loaded_weights = path
        return _model
    except Exception as exc:  # ultralytics/torch raise varied errors on bad weights
        raise DetectorError(
            f"Failed to load YOLO model from {path!r}. "
            "Check MODEL_PATH and that weights are downloadable."
        ) from exc


def detect_people(
    image: str | Path | bytes | np.ndarray,
    *,
    conf: float | None = None,
    iou: float | None = None,
    weights: str | Path | None = None,
) -> dict[str, Any]:
    """
    Detect people in an image.

    Returns
    -------
    dict with keys:
      - count: int
      - detections: list[{bbox: [x1, y1, x2, y2], confidence: float}]
      - inference_time_ms: float
    """
    try:
        frame = load_image(image)
    except (ValueError, FileNotFoundError, OSError) as exc:
        raise DetectorError(f"Could not load image for detection: {exc}") from exc

    model = get_model(weights)
    conf_threshold = DETECT_CONFIDENCE if conf is None else conf
    iou_threshold = DETECT_IOU if iou is None else iou

    t0 = time.perf_counter()
    try:
        results = model.predict(
            source=frame,
            conf=conf_threshold,
            iou=iou_threshold,
            classes=[PERSON_CLASS_ID],
            verbose=False,
        )
    except Exception as exc:
        raise DetectorError(f"Inference failed: {exc}") from exc
    inference_time_ms = (time.perf_counter() - t0) * 1000.0

    detections: list[dict[str, Any]] = []
    if results:
        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            try:
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()
            except Exception as exc:
                raise DetectorError(f"Failed to parse model outputs: {exc}") from exc
            for box, score in zip(xyxy, confs):
                x1, y1, x2, y2 = (float(v) for v in box)
                detections.append(
                    {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": float(score),
                    }
                )

    return {
        "count": len(detections),
        "detections": detections,
        "inference_time_ms": round(inference_time_ms, 2),
    }


