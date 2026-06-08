"""Map domain loan form to credit-scoring features and collateral valuation."""

from __future__ import annotations

import math
import re
from typing import Any, Dict

from app.schemas.schemas import GrifindLoanRequest

# Ориентиры рыночной стоимости ₽/м² для Оренбурга и области (сравнительный подход,
# порядок величин по открытым предложениям и аренде с капитализацией ~10–12% годовых).
_PRICE_PER_SQ_M: dict[str, float] = {
    "офис": 52_000.0,
    "склад": 22_000.0,
    "торговое": 68_000.0,
    "производство": 35_000.0,
    "другое": 42_000.0,
}

# Залоговая стоимость: дисконт к рыночной (реализация, скидка на торг) — типично 15–25%.
_COLLATERAL_DISCOUNT = 0.82

# Максимальный LTV при проверке ликвидности залога (займ / залог).
_MAX_LTV = 0.70

# Верхняя граница залога относительно суммы займа (защита от ошибки в площади).
_MAX_COLLATERAL_TO_LOAN = 6.0

# Множитель годовой выручки — потолок стоимости залога для МСП.
_REVENUE_COLLATERAL_MULT = 2.0

# Абсолютный потолок оценки на платформе (руб.).
_ABSOLUTE_COLLATERAL_CAP = 150_000_000.0

# Разумный максимум площади объекта в заявке МСП (м²).
_MAX_PLEDGE_AREA = 20_000


def _inn_checksum10(digits: str) -> bool:
    coeffs = (2, 4, 10, 3, 5, 9, 4, 6, 8)
    total = sum(int(digits[i]) * coeffs[i] for i in range(9))
    return (total % 11) % 10 == int(digits[9])


def _inn_checksum12(digits: str) -> bool:
    c1 = (7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
    n11 = sum(int(digits[i]) * c1[i] for i in range(10)) % 11 % 10
    if n11 != int(digits[10]):
        return False
    c2 = (3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
    n12 = sum(int(digits[i]) * c2[i] for i in range(11)) % 11 % 10
    return n12 == int(digits[11])


def validate_inn(inn: str) -> bool:
    digits = re.sub(r"\D", "", inn or "")
    if len(digits) not in (10, 12) or not digits.isdigit():
        return False
    if len(digits) == 10:
        return _inn_checksum10(digits)
    return _inn_checksum12(digits)


def validate_cadastral(cad: str | None) -> bool:
    if not cad or not cad.strip():
        return True
    s = cad.strip()
    return bool(re.fullmatch(r"[\d:]+", s)) and len(s) >= 10


def _normalize_area(area: int) -> int:
    return max(1, min(int(area), _MAX_PLEDGE_AREA))


def _price_per_sq_m(property_type: str | None) -> float:
    key = (property_type or "").strip().lower()
    for name, price in _PRICE_PER_SQ_M.items():
        if name in key:
            return price
    return _PRICE_PER_SQ_M["другое"]


def _depreciation_factor(year_built: int | None) -> float:
    if not year_built:
        return 1.0
    age = 2026 - int(year_built)
    if age <= 5:
        return 1.0
    if age <= 12:
        return 0.96
    if age <= 20:
        return 0.90
    if age <= 35:
        return 0.82
    return 0.72


def _area_scale_factor(area: int) -> float:
    """Фактор масштаба: на крупных объектах удельная цена ниже."""
    if area <= 150:
        return 1.0
    if area <= 600:
        return 0.98
    if area <= 2_000:
        return 0.94
    if area <= 5_000:
        return 0.88
    return 0.82


def _market_value_from_area(area: int, property_type: str | None, year_built: int | None) -> float:
    unit = _price_per_sq_m(property_type)
    return round(area * unit * _depreciation_factor(year_built) * _area_scale_factor(area), 2)


def _collateral_ceilings(
    requested_amount: float,
    annual_revenue: float | None,
) -> tuple[float, list[str]]:
    notes: list[str] = []
    loan = max(float(requested_amount), 1.0)
    ceilings = [loan * _MAX_COLLATERAL_TO_LOAN, _ABSOLUTE_COLLATERAL_CAP]

    if annual_revenue and annual_revenue > 0:
        rev_cap = float(annual_revenue) * _REVENUE_COLLATERAL_MULT
        ceilings.append(rev_cap)
        notes.append(f"ограничение по выручке: не выше {rev_cap:,.0f} ₽".replace(",", " "))

    ratio_cap = loan * _MAX_COLLATERAL_TO_LOAN
    notes.append(f"ограничение по сумме займа: не выше {ratio_cap:,.0f} ₽ (×{_MAX_COLLATERAL_TO_LOAN:.0f})".replace(",", " "))
    return min(ceilings), notes


def estimate_collateral_value(loan: GrifindLoanRequest) -> Dict[str, Any]:
    """
    Оценка залога (упрощённо, без нейросети):
    1) рыночная стоимость — сравнительный подход (площадь × эталон ₽/м² × износ × масштаб);
    2) залоговая — рыночная × коэффициент дисконта (~18%);
    3) коридор: не ниже суммы займа / LTV, не выше 6× займа и 2× годовой выручки.
    """
    area_raw = int(loan.area)
    area = _normalize_area(area_raw)
    requested = max(float(loan.requested_amount), 1.0)
    revenue = float(loan.annual_revenue) if loan.annual_revenue else None

    market = _market_value_from_area(area, loan.property_type, loan.year_built)
    collateral_raw = round(market * _COLLATERAL_DISCOUNT, 2)

    # Если площадь явно завышена относительно суммы займа — пересчёт по «вменяемой» площади.
    if collateral_raw > requested * 50:
        unit = _price_per_sq_m(loan.property_type)
        implied_area = requested * _MAX_COLLATERAL_TO_LOAN / max(unit * _COLLATERAL_DISCOUNT * _MAX_LTV, 1.0)
        implied_area = max(10.0, min(implied_area, float(area)))
        area = int(implied_area)
        market = _market_value_from_area(area, loan.property_type, loan.year_built)
        collateral_raw = round(market * _COLLATERAL_DISCOUNT, 2)
        area_adjusted = True
    else:
        area_adjusted = area_raw != area

    ceil_value, cap_notes = _collateral_ceilings(requested, revenue)
    min_collateral = round(requested / _MAX_LTV, 2)

    collateral = min(collateral_raw, ceil_value)
    collateral = max(collateral, min_collateral)
    # Не поднимаем залог выше потолка даже после минимума по LTV
    collateral = min(collateral, ceil_value)
    collateral = round(collateral, 2)

    notes = [
        f"рыночная оценка: {market:,.0f} ₽ ({area} м² × эталон региона)".replace(",", " "),
        f"залоговая стоимость (дисконт {(1 - _COLLATERAL_DISCOUNT) * 100:.0f}%): {collateral_raw:,.0f} ₽".replace(",", " "),
        f"минимум по LTV {_MAX_LTV * 100:.0f}%: {min_collateral:,.0f} ₽".replace(",", " "),
    ]
    if area_adjusted:
        notes.insert(0, f"площадь скорректирована с {area_raw} до {area} м² (согласование с суммой займа)")
    notes.extend(cap_notes)
    if collateral < collateral_raw:
        notes.append(f"итоговая залоговая стоимость с учётом ограничений: {collateral:,.0f} ₽".replace(",", " "))

    return {
        "market_value": market,
        "collateral_value": collateral,
        "area_used": area,
        "valuation_note": "; ".join(notes),
    }


def heuristic_valuation(area: int, property_type: str | None) -> float:
    """Совместимость: возвращает залоговую стоимость."""
    loan_stub = GrifindLoanRequest(
        inn="5609205966",
        company_name="—",
        address="Оренбург",
        area=area,
        property_type=property_type,
        requested_amount=1_000_000.0,
        term_months=36,
    )
    return estimate_collateral_value(loan_stub)["collateral_value"]


def loan_to_ml_features(loan: GrifindLoanRequest) -> Dict[str, Any]:
    """Признаки заявки для модели риска (согласованы с app/ml/train.py)."""
    revenue = float(loan.annual_revenue or 0)
    debt = float(loan.total_debt or 0)
    amount = float(loan.requested_amount)
    term = max(1, int(loan.term_months))
    area = max(1, int(loan.area))

    collateral = estimate_collateral_value(loan)["collateral_value"]
    ltv = min(1.5, amount / collateral) if collateral > 0 else 1.0
    debt_ratio = min(3.0, debt / revenue) if revenue > 0 else 0.85
    payment_burden = min(5.0, (amount / term * 12) / revenue) if revenue > 0 else 1.2
    building_age = max(0, 2026 - int(loan.year_built)) if loan.year_built else 25

    raw_pt = (loan.property_type or "").strip().lower()
    if "офис" in raw_pt:
        ptype = "офис"
    elif "склад" in raw_pt:
        ptype = "склад"
    elif "торгов" in raw_pt:
        ptype = "торговое"
    elif "производ" in raw_pt:
        ptype = "производство"
    else:
        ptype = "другое"

    return {
        "credit_amount_log": round(math.log1p(amount), 4),
        "term_months": term,
        "debt_to_revenue": round(debt_ratio, 4),
        "log_revenue": round(math.log1p(max(revenue, 1.0)), 4),
        "log_area": round(math.log1p(area), 4),
        "property_type": ptype,
        "building_age": building_age,
        "payment_to_revenue": round(payment_burden, 4),
        "ltv": round(ltv, 4),
    }


def suggested_annual_rate(default_probability: float) -> float:
    """Ставка 16–30% в зависимости от калиброванного риска."""
    p = float(default_probability)
    return round(16.0 + p * 14.0, 2)


def assemble_preview(loan: GrifindLoanRequest, ml: Dict[str, Any]) -> Dict[str, Any]:
    val = estimate_collateral_value(loan)
    valuation = float(val["collateral_value"])
    prob = float(ml.get("default_probability", 0.0))
    rate = suggested_annual_rate(prob)
    approved_ml = bool(ml.get("approved"))
    min_required = float(loan.requested_amount) / _MAX_LTV
    liquidity_ok = valuation >= min_required
    approved_hint = approved_ml and liquidity_ok
    return {
        "valuation_estimate": valuation,
        "market_value_estimate": float(val["market_value"]),
        "valuation_note": val["valuation_note"],
        "default_probability": prob,
        "risk_level": ml.get("risk_level", "умеренный"),
        "approved_hint": approved_hint,
        "suggested_rate_annual": rate,
        "liquidity_ok": liquidity_ok,
    }
