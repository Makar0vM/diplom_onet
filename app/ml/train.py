"""Обучение модели риска для заявок Грифинд Инвест."""

from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

from app.ml.generate_dataset import generate_dataset

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "dataset.csv"
MODEL_PATH = BASE_DIR / "model.pkl"
META_PATH = BASE_DIR / "meta.pkl"

FEATURE_ORDER = [
    "credit_amount_log",
    "term_months",
    "debt_to_revenue",
    "log_revenue",
    "log_area",
    "property_type",
    "building_age",
    "payment_to_revenue",
    "ltv",
]
CATEGORICAL_COLS = ["property_type"]


def train() -> None:
    if not DATA_PATH.is_file():
        generate_dataset()
    else:
        # Пересоздаём датасет при каждом обучении — актуальная логика риска
        generate_dataset()

    df = pd.read_csv(DATA_PATH)
    encoders: dict[str, LabelEncoder] = {}
    for col in CATEGORICAL_COLS:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        encoders[col] = le

    X = df[FEATURE_ORDER]
    y = df["target"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pos = max(int(y_train.sum()), 1)
    neg = max(len(y_train) - pos, 1)
    scale_pos_weight = neg / pos

    base = XGBClassifier(
        n_estimators=180,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
    )

    model = CalibratedClassifierCV(base, method="isotonic", cv=3)
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, proba)
    brier = brier_score_loss(y_test, proba)
    print(f"Test AUC: {auc:.3f}, Brier: {brier:.3f}")
    print(f"Proba mean: {proba.mean():.3f}, min: {proba.min():.3f}, max: {proba.max():.3f}")

    meta = {
        "feature_order": FEATURE_ORDER,
        "categorical_cols": CATEGORICAL_COLS,
        "encoders": encoders,
        "risk_threshold_approve": 0.42,
        "version": 2,
    }

    joblib.dump(model, MODEL_PATH)
    joblib.dump(meta, META_PATH)
    # Совместимость со старым путём
    joblib.dump(encoders, BASE_DIR / "encoders.pkl")
    print("Model trained:", MODEL_PATH)


if __name__ == "__main__":
    train()
