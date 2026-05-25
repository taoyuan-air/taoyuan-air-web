"""
Stage 1: Train XGBoost model on station PM2.5 time-series.

Usage:
    cd ml
    python -m impute.train

Output:
    data/models/xgb_pm25.json   — trained XGBoost model
    data/models/train_report.txt — MAE / RMSE / R² on validation set
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

from config import EXPORTS_DIR, MODELS_DIR, TRAIN_END_DATE, XGB_PARAMS
from impute.features import FEATURE_COLS, TARGET_COL, add_features


def load_data() -> pd.DataFrame:
    path = EXPORTS_DIR / 'pm25_hourly.parquet'
    if not path.exists():
        raise FileNotFoundError(f"Parquet not found: {path}\nRun ml/export_parquet.py first.")
    df = pd.read_parquet(path)
    print(f"Loaded {len(df):,} rows from {path.name}")
    return df


def split(df: pd.DataFrame):
    mask = df['monitor_date'] <= TRAIN_END_DATE
    return df[mask], df[~mask]


def evaluate(model: XGBRegressor, X: pd.DataFrame, y: pd.Series, label: str) -> dict:
    pred = model.predict(X)
    mae  = mean_absolute_error(y, pred)
    rmse = np.sqrt(mean_squared_error(y, pred))
    r2   = r2_score(y, pred)
    print(f"  [{label}]  MAE={mae:.3f}  RMSE={rmse:.3f}  R2={r2:.4f}")
    return {'label': label, 'mae': mae, 'rmse': rmse, 'r2': r2, 'n': len(y)}


def train() -> XGBRegressor:
    df = load_data()
    df = add_features(df)

    train_df, val_df = split(df)
    print(f"Train: {len(train_df):,} rows  |  Val: {len(val_df):,} rows")
    print(f"Train period: {train_df['monitor_date'].min().date()} ~ "
          f"{train_df['monitor_date'].max().date()}")
    print(f"Val   period: {val_df['monitor_date'].min().date()} ~ "
          f"{val_df['monitor_date'].max().date()}")

    X_train = train_df[FEATURE_COLS]
    y_train = train_df[TARGET_COL]
    X_val   = val_df[FEATURE_COLS]
    y_val   = val_df[TARGET_COL]

    print("\nTraining XGBoost...")
    model = XGBRegressor(**XGB_PARAMS)
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=100,
    )

    print("\nEvaluation:")
    train_metrics = evaluate(model, X_train, y_train, 'train')
    val_metrics   = evaluate(model, X_val,   y_val,   'val')

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / 'xgb_pm25.json'
    model.save_model(model_path)
    print(f"\nModel saved → {model_path}")

    report_path = MODELS_DIR / 'train_report.txt'
    with open(report_path, 'w') as f:
        for m in [train_metrics, val_metrics]:
            f.write(f"[{m['label']}]  n={m['n']:,}  "
                    f"MAE={m['mae']:.3f}  RMSE={m['rmse']:.3f}  R2={m['r2']:.4f}\n")
    print(f"Report saved → {report_path}")

    _plot_feature_importance(model)

    return model


def _plot_feature_importance(model: XGBRegressor) -> None:
    try:
        import matplotlib.pyplot as plt
        scores = model.get_booster().get_fscore()
        scores = dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))
        fig, ax = plt.subplots(figsize=(8, 5))
        ax.barh(list(scores.keys()), list(scores.values()))
        ax.set_xlabel('F-score')
        ax.set_title('XGBoost Feature Importance (PM2.5)')
        plt.tight_layout()
        out = MODELS_DIR / 'feature_importance.png'
        fig.savefig(out, dpi=120)
        plt.close(fig)
        print(f"Feature importance plot → {out}")
    except Exception as e:
        print(f"[WARN] Could not save feature importance plot: {e}")


if __name__ == '__main__':
    train()
