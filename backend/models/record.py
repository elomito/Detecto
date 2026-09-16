"""SQLite persistence for detection history."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, Integer, create_engine, delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from config import SQLITE_PATH

DATABASE_URL = f"sqlite:///{SQLITE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class DetectionRecord(Base):
    __tablename__ = "detection_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_confidence: Mapped[float] = mapped_column(Float, nullable=False)


class StorageError(RuntimeError):
    """Raised when a database operation fails."""


def init_db() -> None:
    try:
        SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
    except OSError as exc:
        raise StorageError(
            f"Cannot create database directory for {SQLITE_PATH}: {exc}"
        ) from exc
    except SQLAlchemyError as exc:
        raise StorageError(f"Cannot initialize database at {SQLITE_PATH}: {exc}") from exc

def get_session() -> Session:
    return SessionLocal()

def save_detection(count: int, avg_confidence: float) -> DetectionRecord:
    record = DetectionRecord(
        timestamp=datetime.now(timezone.utc),
        count=count,
        avg_confidence=avg_confidence,
    )
    try:
        with get_session() as session:
            session.add(record)
            session.commit()
            session.refresh(record)
            session.expunge(record)
        return record
    except SQLAlchemyError as exc:
        raise StorageError(f"Failed to save detection record: {exc}") from exc

def list_detections(
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    min_confidence: float | None = None,
) -> list[dict[str, Any]]:
    stmt = select(DetectionRecord).order_by(DetectionRecord.timestamp.desc())

    if start is not None:
        stmt = stmt.where(DetectionRecord.timestamp >= start)
    if end is not None:
        stmt = stmt.where(DetectionRecord.timestamp <= end)
    if min_confidence is not None:
        stmt = stmt.where(DetectionRecord.avg_confidence >= min_confidence)

    try:
        with get_session() as session:
            rows = session.scalars(stmt).all()
            return [
                {
                    "id": row.id,
                    "timestamp": row.timestamp.isoformat(),
                    "count": row.count,
                    "avg_confidence": round(float(row.avg_confidence), 4),
                }
                for row in rows
            ]
    except SQLAlchemyError as exc:
        raise StorageError(f"Failed to read detection history: {exc}") from exc

def clear_detections() -> int:
    try:
        with get_session() as session:
            result = session.execute(delete(DetectionRecord))
            session.commit()
            return int(result.rowcount or 0)
    except SQLAlchemyError as exc:
        raise StorageError(f"Failed to clear detection history: {exc}") from exc
