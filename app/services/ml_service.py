"""ML-оценка риска дефолта по заявке МСП."""

from __future__ import annotations

import math
import os
from typing import Any, Dict, Optional

import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_model: Optional[Any] = None
_meta: Optional[dict] = None


def _load_artifacts() -> None:
    global _model, _meta
    if _model is not None and _meta is not None:
        return
    model_path = os.path.join(BASE_DIR, "ml", "model.pkl")
    meta_path = os.path.join(BASE_DIR, "ml", "meta.pkl")
    if not os.path.isfile(model_path) or not os.path.isfile(meta_path):
        raise FileNotFoundError(
            "ML artifacts missing. Run: python -m app.ml.train (from project root)."
        )
    _model = joblib.load(model_path)
    _meta = joblib.load(meta_path)


def _encode_row(features: Dict[str, Any]) -> list[float | int]:
    meta = _meta or {}
    order = meta.get("feature_order", [])
    encoders: dict = meta.get("encoders", {})
    row: dict[str, Any] = dict(features)

    for col, le in encoders.items():
        raw = str(row.get(col, "другое"))
        if raw not in le.classes_:
            raw = "другое" if "другое" in le.classes_ else str(le.classes_[0])
        row[col] = int(le.transform([raw])[0])

    return [row[k] for k in order]


def _display_probability(raw: float) -> float:
    """Сглаживание крайних вероятностей для UI (не ломая ранжирование)."""
    raw = float(np.clip(raw, 0.0, 1.0))
    # Лёгкий shrink к 0.28 — типичный средний риск портфеля МСП
    prior = 0.28
    blend = 0.25
    return float(np.clip(prior * blend + raw * (1.0 - blend), 0.06, 0.88))


def _risk_level(prob: float) -> str:
    if prob < 0.22:
        return "низкий"
    if prob < 0.38:
        return "умеренный"
    if prob < 0.55:
        return "повышенный"
    return "высокий"


def predict(features: Dict[str, Any]) -> dict:
    _load_artifacts()
    vector = np.array([_encode_row(features)], dtype=np.float64)
    raw_prob = float(_model.predict_proba(vector)[0][1])
    prob = round(_display_probability(raw_prob), 4)
    threshold = float((_meta or {}).get("risk_threshold_approve", 0.42))
    return {
        "approved": prob < threshold,
        "default_probability": prob,
        "risk_level": _risk_level(prob),
        "raw_probability": round(raw_prob, 4),
    }


def predict_legacy_german(data) -> dict:
    """Старый API /predict — маппинг в признаки заявки с дефолтами."""
    raw = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    amount = float(raw.get("Credit_amount", 1_000_000))
    term = int(raw.get("Duration", 36))
    features = {
        "credit_amount_log": math.log1p(amount),
        "term_months": term,
        "debt_to_revenue": 0.35,
        "log_revenue": math.log1p(5_000_000),
        "log_area": math.log1p(200),
        "property_type": "офис",
        "building_age": 20,
        "payment_to_revenue": min(5.0, (amount / max(term, 1) * 12) / 5_000_000),
        "ltv": 0.55,
    }
    return predict(features)
