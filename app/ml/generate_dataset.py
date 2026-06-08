"""Синтетический датасет заявок МСП под залог (Оренбург), метка — повышенный риск дефолта."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
OUTPUT = BASE_DIR / "dataset.csv"

PROPERTY_TYPES = ["офис", "склад", "торговое", "производство", "другое"]
_PRICE_PER_SQ_M = {
    "офис": 52_000.0,
    "склад": 22_000.0,
    "торговое": 68_000.0,
    "производство": 35_000.0,
    "другое": 42_000.0,
}


def _approx_collateral(area: int, property_type: str) -> float:
    unit = _PRICE_PER_SQ_M.get(property_type, 42_000.0)
    return max(area * unit * 0.82, 10_000.0)


def _synthetic_risk_score(
    amount: float,
    term: int,
    revenue: float,
    debt: float,
    area: int,
    property_type: str,
    year_built: int,
) -> float:
    """Непрерывный риск 0..1 по бизнес-правилам (основа для метки и для проверки модели)."""
    revenue = max(revenue, 1.0)
    debt_ratio = min(3.0, debt / revenue)
    collateral = _approx_collateral(area, property_type)
    ltv = min(1.5, amount / collateral)
    annual_payment = amount / max(term, 1) * 12
    payment_burden = min(5.0, annual_payment / revenue)
    building_age = max(0, 2026 - year_built)

    score = 0.12
    score += 0.28 * min(1.0, debt_ratio / 0.75)
    score += 0.22 * min(1.0, max(0.0, ltv - 0.55) / 0.4)
    score += 0.18 * min(1.0, payment_burden / 0.35)
    if revenue < 2_000_000 and amount > 8_000_000:
        score += 0.12
    if building_age > 40:
        score += 0.06
    if amount < 500_000 and revenue > 5_000_000:
        score -= 0.08
    return float(np.clip(score, 0.05, 0.92))


def generate_dataset(n_samples: int = 4000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []

    for _ in range(n_samples):
        revenue = float(rng.lognormal(mean=15.2, sigma=0.85))
        revenue = float(np.clip(revenue, 200_000, 120_000_000))
        debt = revenue * float(rng.beta(2.2, 4.5)) * float(rng.uniform(0.3, 1.8))
        amount = float(rng.lognormal(mean=14.0, sigma=1.1))
        amount = float(np.clip(amount, 50_000, 80_000_000))
        term = int(rng.choice([12, 18, 24, 36, 48, 60, 72, 84, 120], p=[0.05, 0.05, 0.15, 0.25, 0.2, 0.15, 0.08, 0.05, 0.02]))
        area = int(rng.integers(25, 8_000))
        property_type = str(rng.choice(PROPERTY_TYPES, p=[0.28, 0.22, 0.18, 0.17, 0.15]))
        year_built = int(rng.integers(1965, 2025))

        risk = _synthetic_risk_score(amount, term, revenue, debt, area, property_type, year_built)
        risk += float(rng.normal(0, 0.07))
        risk = float(np.clip(risk, 0.02, 0.98))
        target = int(risk >= 0.44)

        collateral = _approx_collateral(area, property_type)
        ltv = min(1.5, amount / collateral)
        debt_ratio = min(3.0, debt / revenue)
        payment_burden = min(5.0, (amount / max(term, 1) * 12) / revenue)

        rows.append(
            {
                "credit_amount_log": round(math.log1p(amount), 4),
                "term_months": term,
                "debt_to_revenue": round(debt_ratio, 4),
                "log_revenue": round(math.log1p(revenue), 4),
                "log_area": round(math.log1p(area), 4),
                "property_type": property_type,
                "building_age": max(0, 2026 - year_built),
                "payment_to_revenue": round(payment_burden, 4),
                "ltv": round(ltv, 4),
                "target": target,
            }
        )

    df = pd.DataFrame(rows)
    df.to_csv(OUTPUT, index=False)
    return df


if __name__ == "__main__":
    df = generate_dataset()
    print(f"Saved {len(df)} rows to {OUTPUT}")
    print("Target rate:", df["target"].mean())
