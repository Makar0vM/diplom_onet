"""Map domain loan form to credit-scoring features and heuristic valuation."""

from __future__ import annotations

import re
from typing import Any, Dict

from app.schemas.schemas import GrifindLoanRequest, PredictRequest

# Rough reference price per m² (Orenburg region, demo constant).
_BASE_PRICE_PER_SQ_M = 52_000.0
_PROPERTY_MULT = {
    "офис": 1.0,
    "склад": 0.88,
    "торговое": 1.12,
    "производство": 0.95,
    "другое": 1.0,
}


def validate_inn(inn: str) -> bool:
    digits = re.sub(r"\D", "", inn or "")
    return len(digits) in (10, 12) and digits.isdigit()


def validate_cadastral(cad: str | None) -> bool:
    if not cad or not cad.strip():
        return True
    # XX:XX:XXXXXXX:XXX — допускаем упрощённо цифры и двоеточия
    s = cad.strip()
    return bool(re.fullmatch(r"[\d:]+", s)) and len(s) >= 10


def heuristic_valuation(area: int, property_type: str | None) -> float:
    key = (property_type or "").strip().lower()
    mult = 1.0
    for k, v in _PROPERTY_MULT.items():
        if k in key:
            mult = v
            break
    return round(max(0.0, float(area)) * _BASE_PRICE_PER_SQ_M * mult, 2)


def loan_to_predict_request(loan: GrifindLoanRequest) -> PredictRequest:
    """Build German-credit-style feature row compatible with trained encoders."""
    revenue = float(loan.annual_revenue or 0)
    debt = float(loan.total_debt or 0)
    ratio = debt / revenue if revenue > 0 else 0.0

    if ratio > 0.6:
        saving = "little"
    elif ratio > 0.35:
        saving = "moderate"
    elif revenue > 15_000_000:
        saving = "quite rich"
    else:
        saving = "rich"

    checking = "little" if ratio > 0.5 else "moderate"

    job = 3 if revenue > 8_000_000 else 2 if revenue > 2_000_000 else 1

    return PredictRequest(
        Age=38,
        Sex="male",
        Job=job,
        Housing="own",
        Saving_accounts=saving,
        Checking_account=checking,
        Credit_amount=float(loan.requested_amount),
        Duration=int(loan.term_months),
        Purpose="business",
    )


def suggested_annual_rate(default_probability: float) -> float:
    base = 17.5
    return round(base + min(12.0, default_probability * 24.0), 2)


def assemble_preview(loan: GrifindLoanRequest, ml: Dict[str, Any]) -> Dict[str, Any]:
    valuation = heuristic_valuation(loan.area, loan.property_type)
    prob = float(ml.get("default_probability", 0.0))
    rate = suggested_annual_rate(prob)
    approved_ml = bool(ml.get("approved"))
    liquidity_ok = valuation >= float(loan.requested_amount) * 0.85
    approved_hint = approved_ml and liquidity_ok
    return {
        "valuation_estimate": valuation,
        "default_probability": prob,
        "approved_hint": approved_hint,
        "suggested_rate_annual": rate,
        "liquidity_ok": liquidity_ok,
    }
