import joblib
import numpy as np
import os
from typing import Any, Dict, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Must match column order after training (see app/ml/train.py, X before train_test_split).
FEATURE_ORDER = [
    "Age",
    "Sex",
    "Job",
    "Housing",
    "Saving accounts",
    "Checking account",
    "Credit amount",
    "Duration",
    "Purpose",
]

_model: Optional[Any] = None
_encoders: Optional[dict] = None


def _load_artifacts():
    global _model, _encoders
    if _model is not None and _encoders is not None:
        return
    model_path = os.path.join(BASE_DIR, "ml", "model.pkl")
    enc_path = os.path.join(BASE_DIR, "ml", "encoders.pkl")
    if not os.path.isfile(model_path) or not os.path.isfile(enc_path):
        raise FileNotFoundError(
            "ML artifacts missing. Run: python -m app.ml.train (from project root)."
        )
    _model = joblib.load(model_path)
    _encoders = joblib.load(enc_path)


def encode_input(data_dict: Dict[str, Any]) -> Dict[str, Any]:
    mapping = {
        "Saving_accounts": "Saving accounts",
        "Checking_account": "Checking account",
        "Credit_amount": "Credit amount",
    }

    fixed: Dict[str, Any] = {}
    for key, value in data_dict.items():
        new_key = mapping.get(key, key)
        fixed[new_key] = value

    encoders = _encoders or {}
    for col, le in encoders.items():
        if col in fixed:
            fixed[col] = le.transform([str(fixed[col])])[0]

    return fixed


def predict(data) -> dict:
    _load_artifacts()
    raw = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    fixed = encode_input(raw)
    row = [fixed[k] for k in FEATURE_ORDER]
    features = np.array([row], dtype=np.float64)

    prob = float(_model.predict_proba(features)[0][1])

    return {
        "approved": prob < 0.5,
        "default_probability": prob,
    }
