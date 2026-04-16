import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier
import joblib
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(BASE_DIR, "ml", "dataset.csv")

df = pd.read_csv(data_path)

df = df.drop(columns=["Unnamed: 0"], errors="ignore")

df["target"] = (df["Credit amount"] / df["Duration"] > 150).astype(int)

categorical_cols = ["Sex", "Housing", "Saving accounts", "Checking account", "Purpose"]

encoders = {}
for col in categorical_cols:
    le = LabelEncoder()
    df[col] = df[col].astype(str)
    df[col] = le.fit_transform(df[col])
    encoders[col] = le

X = df.drop("target", axis=1)
y = df["target"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

model = XGBClassifier(n_estimators=200, max_depth=5)
model.fit(X_train, y_train)

joblib.dump(model, os.path.join(BASE_DIR, "ml", "model.pkl"))
joblib.dump(encoders, os.path.join(BASE_DIR, "ml", "encoders.pkl"))

print("Model trained!")