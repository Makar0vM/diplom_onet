"""Aggregate loan application statistics for reports."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.db.models import LoanApplication

STATUS_APPROVED = "Одобрено"
STATUS_REJECTED = "Отказано"
STATUS_PENDING = "На рассмотрении"
STATUS_REVISION = "На доработке"

BUCKET_APPROVED = "approved"
BUCKET_REJECTED = "rejected"
BUCKET_PENDING = "pending"

BUCKET_LABELS = {
    BUCKET_APPROVED: "Одобренные",
    BUCKET_REJECTED: "Не одобренные (отказ)",
    BUCKET_PENDING: "На рассмотрении",
}

_STATUS_TO_BUCKET: dict[str, str] = {
    STATUS_APPROVED: BUCKET_APPROVED,
    STATUS_REJECTED: BUCKET_REJECTED,
    STATUS_PENDING: BUCKET_PENDING,
    STATUS_REVISION: BUCKET_PENDING,
}


def _bucket_for_status(status: str) -> str | None:
    return _STATUS_TO_BUCKET.get((status or "").strip())


def _amount_stats(amounts: list[float]) -> dict[str, float | int | None]:
    if not amounts:
        return {
            "count": 0,
            "avg_amount": None,
            "min_amount": None,
            "max_amount": None,
            "total_amount": 0.0,
        }
    return {
        "count": len(amounts),
        "avg_amount": round(sum(amounts) / len(amounts), 2),
        "min_amount": round(min(amounts), 2),
        "max_amount": round(max(amounts), 2),
        "total_amount": round(sum(amounts), 2),
    }


def _serialize_bucket(key: str, amounts: list[float]) -> dict[str, Any]:
    stats = _amount_stats(amounts)
    return {
        "key": key,
        "label": BUCKET_LABELS[key],
        "statuses": _statuses_for_bucket(key),
        **stats,
    }


def _statuses_for_bucket(key: str) -> list[str]:
    if key == BUCKET_APPROVED:
        return [STATUS_APPROVED]
    if key == BUCKET_REJECTED:
        return [STATUS_REJECTED]
    return [STATUS_PENDING, STATUS_REVISION]


def build_analytics_summary(
    rows: Iterable[LoanApplication],
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict[str, Any]:
    rows_list = list(rows)
    bucket_amounts: dict[str, list[float]] = {
        BUCKET_APPROVED: [],
        BUCKET_REJECTED: [],
        BUCKET_PENDING: [],
    }
    by_status: dict[str, list[float]] = {}
    other_amounts: list[float] = []
    all_amounts: list[float] = []

    for row in rows_list:
        amount = float(row.requested_amount)
        all_amounts.append(amount)
        status = (row.status or "").strip()
        by_status.setdefault(status, []).append(amount)
        bucket = _bucket_for_status(status)
        if bucket:
            bucket_amounts[bucket].append(amount)
        else:
            other_amounts.append(amount)

    by_status_rows = [
        {"status": status, **_amount_stats(amounts)}
        for status, amounts in sorted(by_status.items(), key=lambda x: x[0])
    ]

    buckets = [
        _serialize_bucket(BUCKET_APPROVED, bucket_amounts[BUCKET_APPROVED]),
        _serialize_bucket(BUCKET_REJECTED, bucket_amounts[BUCKET_REJECTED]),
        _serialize_bucket(BUCKET_PENDING, bucket_amounts[BUCKET_PENDING]),
    ]

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "period": {
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        "total_applications": len(rows_list),
        "overall": _amount_stats(all_amounts),
        "buckets": buckets,
        "by_status": by_status_rows,
        "other_statuses": _amount_stats(other_amounts) if other_amounts else None,
    }


def fetch_applications_for_analytics(
    db: Session,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    inn: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
) -> list[LoanApplication]:
    q = db.query(LoanApplication)
    if date_from is not None:
        q = q.filter(LoanApplication.created_at >= datetime.combine(date_from, time.min))
    if date_to is not None:
        q = q.filter(LoanApplication.created_at <= datetime.combine(date_to, time.max))
    if inn:
        inn_clean = inn.replace(" ", "")
        q = q.filter(LoanApplication.inn.contains(inn_clean))
    if amount_min is not None:
        q = q.filter(LoanApplication.requested_amount >= amount_min)
    if amount_max is not None:
        q = q.filter(LoanApplication.requested_amount <= amount_max)
    return q.order_by(LoanApplication.created_at.desc()).limit(50_000).all()
