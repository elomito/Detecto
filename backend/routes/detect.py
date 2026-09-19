"""POST /detect and WebSocket /ws/detect — person detection."""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

import cv2
import numpy as np
from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)

from config import LIVE_HISTORY_INTERVAL_SEC, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB
from models.record import StorageError, save_detection
from utils.detector import DetectorError, detect_people
from utils.logging_config import setup_logging
from utils.preprocessing import load_image

router = APIRouter(tags=["detect"])
logger = setup_logging()

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/x-png",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _extension_ok(filename: str | None) -> bool:
    if not filename or "." not in filename:
        return False
    return "." + filename.rsplit(".", 1)[-1].lower() in ALLOWED_EXTENSIONS


def _avg_confidence(detections: list[dict[str, Any]]) -> float:
    if not detections:
        return 0.0
    return round(
        sum(float(d["confidence"]) for d in detections) / len(detections),
        4,
    )


def _draw_boxes(image: np.ndarray, detections: list[dict[str, Any]]) -> np.ndarray:
    annotated = image.copy()
    for det in detections:
        x1, y1, x2, y2 = (int(round(v)) for v in det["bbox"])
        conf = float(det["confidence"])
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 200, 80), 2)
        label = f"{conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), (0, 200, 80), -1)
        cv2.putText(
            annotated,
            label,
            (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    return annotated


def _to_base64_jpeg(image: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encode annotated image.",
        )
    return base64.b64encode(buf.tobytes()).decode("ascii")


@router.post("/detect")
async def detect(image: UploadFile = File(..., description="JPEG or PNG image")):
    content_type = (image.content_type or "").lower().strip()
    filename = image.filename or ""

    if not filename and not content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing image file. Upload a JPEG or PNG via multipart field 'image'.",
        )

    type_ok = content_type in ALLOWED_CONTENT_TYPES or content_type == "application/octet-stream"
    ext_ok = _extension_ok(filename)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES and content_type != "application/octet-stream":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type '{content_type}'. Only JPEG and PNG are accepted.",
        )
    if not type_ok and not ext_ok:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file. Only JPEG and PNG images are accepted.",
        )
    if not ext_ok and content_type == "application/octet-stream":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file. Only JPEG and PNG images are accepted.",
        )

    try:
        data = await image.read()
    except OSError as exc:
        logger.exception("Failed reading upload filename=%s", filename or "<unnamed>")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read uploaded file.",
        ) from exc

    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file. Upload a non-empty JPEG or PNG image.",
        )
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size is {MAX_UPLOAD_MB} MB.",
        )

    try:
        frame = load_image(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image data. Could not decode as JPEG or PNG.",
        ) from exc

    try:
        result = detect_people(frame)
    except DetectorError as exc:
        logger.exception("Detection failed filename=%s", filename or "<unnamed>")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    detections = result["detections"]
    avg_conf = _avg_confidence(detections)
    inference_ms = result["inference_time_ms"]

    logger.info(
        "detect request filename=%s count=%s avg_confidence=%s inference_time_ms=%s",
        filename or "<unnamed>",
        result["count"],
        avg_conf,
        inference_ms,
    )

    persisted = True
    try:
        save_detection(count=result["count"], avg_confidence=avg_conf)
    except StorageError as exc:
        persisted = False
        logger.error("Failed to persist detection history: %s", exc)

    try:
        annotated = _draw_boxes(frame, detections)
        image_b64 = _to_base64_jpeg(annotated)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to annotate image filename=%s", filename or "<unnamed>")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Detection succeeded but annotated image could not be created.",
        ) from exc

    payload = {
        "count": result["count"],
        "detections": detections,
        "avg_confidence": avg_conf,
        "inference_time_ms": inference_ms,
        "image_base64": image_b64,
    }
    if not persisted:
        payload["warning"] = "Detection succeeded but history was not saved."
    return payload


def _looks_like_image(raw: bytes) -> bool:
    """True if bytes start with JPEG or PNG magic."""
    return raw.startswith(b"\xff\xd8\xff") or raw.startswith(b"\x89PNG\r\n\x1a\n")


def _decode_frame_payload(message: str | bytes) -> bytes:
    """Extract JPEG/PNG bytes from a WebSocket text/binary frame message."""
    if isinstance(message, (bytes, bytearray, memoryview)):
        raw = bytes(message)
        if _looks_like_image(raw):
            if len(raw) > MAX_UPLOAD_BYTES:
                raise ValueError(f"Frame too large. Max size is {MAX_UPLOAD_MB} MB.")
            return raw
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(
                "Binary WebSocket frames must be JPEG/PNG image bytes "
                "(or UTF-8 JSON/base64 text)."
            ) from exc
    else:
        text = message

    text = text.strip()
    if not text:
        raise ValueError("Empty frame payload.")

    if text.startswith("{"):
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("Frame JSON must be an object.")
        frame = data.get("frame")
        if frame is None:
            frame = data.get("image")
        if frame is None:
            frame = data.get("data")
        if not isinstance(frame, str) or not frame.strip():
            keys = ", ".join(sorted(data.keys())) or "(none)"
            raise ValueError(
                "JSON frame must include a non-empty base64 'frame' field "
                f"(received keys: {keys})."
            )
        text = frame.strip()

    if "," in text and text.lower().startswith("data:"):
        text = text.split(",", 1)[1]

    try:
        raw = base64.b64decode(text, validate=False)
    except Exception as exc:
        raise ValueError("Invalid base64 frame data.") from exc

    if not raw:
        raise ValueError("Decoded frame is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError(f"Frame too large. Max size is {MAX_UPLOAD_MB} MB.")
    return raw


def _maybe_persist_live(
    *,
    count: int,
    avg_confidence: float,
    last_persist_at: float | None,
) -> tuple[float | None, bool]:
    """Persist at most once every LIVE_HISTORY_INTERVAL_SEC. Returns (ts, saved)."""
    now = time.monotonic()
    interval = max(0.0, float(LIVE_HISTORY_INTERVAL_SEC))
    if last_persist_at is not None and (now - last_persist_at) < interval:
        return last_persist_at, False
    try:
        save_detection(count=count, avg_confidence=avg_confidence)
        return now, True
    except StorageError as exc:
        logger.error("Live history persist failed: %s", exc)
        return last_persist_at, False


@router.websocket("/ws/detect")
async def detect_live(websocket: WebSocket):
    """
    Stream base64 JPEG frames; reply with detections per processed frame.

    Backpressure: after each inference, drain any frames that buffered while
    the model was busy and keep only the newest (drop the rest) so the stream
    does not lag. History is written at most once every LIVE_HISTORY_INTERVAL_SEC.
    """
    await websocket.accept()
    logger.info("ws/detect connected")
    last_persist_at: float | None = None

    def _payload_from_message(message: dict[str, Any]) -> str | bytes | None:
        if message.get("type") == "websocket.disconnect":
            raise WebSocketDisconnect()
        if message.get("text") is not None:
            return message["text"]
        if message.get("bytes") is not None:
            return message["bytes"]
        return None

    async def _recv_latest(*, block: bool) -> str | bytes:
        """Receive one frame; if more are already buffered, keep only the newest."""
        if block:
            message = await websocket.receive()
        else:
            message = await asyncio.wait_for(websocket.receive(), timeout=0.001)
        payload = _payload_from_message(message)
        while True:
            try:
                newer_msg = await asyncio.wait_for(websocket.receive(), timeout=0.001)
            except asyncio.TimeoutError:
                break
            newer = _payload_from_message(newer_msg)
            if newer is not None:
                payload = newer
        if payload is None:
            raise ValueError("Unsupported WebSocket frame type.")
        return payload

    try:
        while True:
            try:
                payload = await _recv_latest(block=True)
            except WebSocketDisconnect:
                break

            try:
                response = await asyncio.to_thread(_process_live_frame, payload)
            except DetectorError as exc:
                logger.exception("ws/detect inference failed")
                await websocket.send_json({"error": str(exc)})
                continue
            except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
                await websocket.send_json({"error": str(exc)})
                continue

            last_persist_at, persisted = _maybe_persist_live(
                count=response["count"],
                avg_confidence=response["avg_confidence"],
                last_persist_at=last_persist_at,
            )
            response["persisted"] = persisted
            await websocket.send_json(response)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws/detect unexpected error")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        logger.info("ws/detect disconnected")


def _process_live_frame(payload: str | bytes) -> dict[str, Any]:
    raw = _decode_frame_payload(payload)
    frame = load_image(raw)
    result = detect_people(frame)
    detections = result["detections"]
    avg_conf = _avg_confidence(detections)
    return {
        "count": result["count"],
        "detections": detections,
        "inference_time_ms": result["inference_time_ms"],
        "avg_confidence": avg_conf,
    }

