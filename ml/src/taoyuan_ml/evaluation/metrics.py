import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

def evaluate(model: XGBRegressor, X: pd.DataFrame, y: pd.Series, label: str) -> dict:
    pred = model.predict(X)
    mae = mean_absolute_error(y, pred)
    rmse = np.sqrt(mean_squared_error(y, pred))
    r2 = r2_score(y, pred)
    print(f"  [{label}] MAE={mae:.3f} RMSE={rmse:.3f} R2={r2:.4f}")
    return {'label': label, 'mae': mae, 'rmse': rmse, 'r2': r2, 'n': len(y)}

def _metrics(y_true: np.ndarray, y_pred: np.ndarray, threshold: float) -> dict:
    mae  = float(np.mean(np.abs(y_pred - y_true)))
    rmse = float(np.sqrt(np.mean((y_pred - y_true) ** 2)))
    bias = float(np.mean(y_pred - y_true))
    ss_res = np.sum((y_pred - y_true) ** 2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    r2   = float(1 - ss_res / ss_tot) if ss_tot > 0 else np.nan
    high_true = y_true >= threshold
    if high_true.sum() == 0:
        recall = np.nan
    else:
        recall = float((y_pred[high_true] >= threshold).mean())
    return {'mae': mae, 'rmse': rmse, 'bias': bias, 'r2': r2, 'high_recall': recall}
