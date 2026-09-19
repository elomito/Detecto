"""GET /history, GET /history/export, and POST /reset — detection history."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from models.record import StorageError, clear_detections, list_detections
from utils.logging_config import setup_logging

router = APIRouter(tags=["history"])
logger = setup_logging()


def _parse_datetime(value: str | None, *, field: str) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if len(value) == 10 and value[4] == "-" and value[7] == "-":
            return datetime.fromisoformat(value)
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}: expected ISO-8601 datetime or YYYY-MM-DD.",
        ) from exc


@router.get("/history")
def history(
    start: str | None = Query(
        None,
        description="Inclusive start datetime (ISO-8601 or YYYY-MM-DD)",
    ),
    end: str | None = Query(
        None,
        description="Inclusive end datetime (ISO-8601 or YYYY-MM-DD)",
    ),
    min_confidence: float | None = Query(
        None,
        ge=0.0,
        le=1.0,
        description="Minimum average confidence (0–1)",
    ),
):
    start_dt, end_dt, min_conf = _history_filters(start, end, min_confidence)

    try:
        records = list_detections(
            start=start_dt,
            end=end_dt,
            min_confidence=min_conf,
        )
    except StorageError as exc:
        logger.exception("History read failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"count": len(records), "history": records}


def _history_filters(
    start: str | None,
    end: str | None,
    min_confidence: float | None,
) -> tuple[datetime | None, datetime | None, float | None]:
    start_dt = _parse_datetime(start, field="start")
    end_dt = _parse_datetime(end, field="end")
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'start' must be before or equal to 'end'.",
        )
    return start_dt, end_dt, min_confidence


@router.get("/history/export")
def export_history_csv(
    start: str | None = Query(
        None,
        description="Inclusive start datetime (ISO-8601 or YYYY-MM-DD)",
    ),
    end: str | None = Query(
        None,
        description="Inclusive end datetime (ISO-8601 or YYYY-MM-DD)",
    ),
    min_confidence: float | None = Query(
        None,
        ge=0.0,
        le=1.0,
        description="Minimum average confidence (0–1)",
    ),
):
    start_dt, end_dt, min_conf = _history_filters(start, end, min_confidence)

    try:
        records = list_detections(
            start=start_dt,
            end=end_dt,
            min_confidence=min_conf,
        )
    except StorageError as exc:
        logger.exception("History export failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "count", "avg_confidence"])
    for row in records:
        writer.writerow(
            [row["id"], row["timestamp"], row["count"], row["avg_confidence"]]
        )

    filename = (
        f"detecto-history-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.csv"
    )
    logger.info("history export rows=%s filename=%s", len(records), filename)
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/reset")
def reset():
    try:
        deleted = clear_detections()
    except StorageError as exc:
        logger.exception("History reset failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    logger.info("history reset deleted=%s", deleted)
    return {"status": "ok", "deleted": deleted}


