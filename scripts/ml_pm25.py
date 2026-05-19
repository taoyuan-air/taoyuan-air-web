import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging
from sklearn.metrics import mean_absolute_error
from xgboost import XGBRegressor
import sys
import os
import pickle
import json

# 確保讀得到 src 裡的 config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
try:
    from src.config import COMMON_CONFIG
except ModuleNotFoundError:
    COMMON_CONFIG = {
        'target_stations': ['桃園', '中壢', '平鎮', '觀音', '大園', '龍潭'],
        'lag_hours': [1, 2, 24],
        'grid': {
            'min_lon': 120.98, 'max_lon': 121.48,
            'min_lat': 24.78, 'max_lat': 25.13,
            'grid_size_km': 3.0
        }
    }

# %% [1] 資料載入與基礎清理
print(">>> 階段 1：載入歷史資料快照...")
df = pd.read_csv('data/processed/moe_pm25.csv')
df['time'] = pd.to_datetime(df['time'])

stations = COMMON_CONFIG['target_stations']
df = df[df['station_name'].isin(stations)].sort_values(['station_name', 'time'])

# 製作 Lag 特徵
for lag in COMMON_CONFIG['lag_hours']:
    df[f'pm25_lag_{lag}h'] = df.groupby('station_name')['pm25'].shift(lag)

# 特徵工程
df['hour'] = df['time'].dt.hour
df['day_of_week'] = df['time'].dt.dayofweek
df['month'] = df['time'].dt.month
df['season'] = df['month'].apply(lambda x: 1 if x in [3,4,5] else (2 if x in [6,7,8] else (3 if x in [9,10,11] else 4)))

# 加入測站 One-Hot Encoding（讓模型能學習不同測站的特性）
df = pd.get_dummies(df, columns=['station_name'], prefix='station', dtype=int)

df_cleaned = df.dropna().copy()
print(f"原始有效紀錄數：{len(df_cleaned)}")


# %% [2] 時序資料切割、模型訓練與模型儲存
print("\n>>> 階段 2：進行時序切割與 XGBoost 訓練...")

split_date = '2025-11-30 23:00:00'
train_data = df_cleaned[df_cleaned['time'] <= split_date]
test_data = df_cleaned[df_cleaned['time'] > split_date]

# 動態抓取特徵欄位（包含 One-Hot 的測站欄位）
station_cols = [col for col in df_cleaned.columns if col.startswith('station_')]
feature_cols = ['lon', 'lat', 'hour', 'day_of_week', 'season', 'pm25_lag_1h', 'pm25_lag_2h', 'pm25_lag_24h'] + station_cols

X_train, y_train = train_data[feature_cols], train_data['pm25']
X_test, y_test = test_data[feature_cols], test_data['pm25']

print(f"  - 訓練集包含特徵欄位共 {len(feature_cols)} 個。")

# 對目標值進行對數轉換 np.log1p (y = log(x+1))
y_train_log = np.log1p(y_train)

# 訓練模型（優化目標改為 MAE，對低濃度更敏感）
xgb_model = XGBRegressor(objective='reg:absoluteerror', n_estimators=100, max_depth=6, random_state=42)
xgb_model.fit(X_train, y_train_log)
print("  - XGBoost 趨勢對數模型訓練成功！")

# 預測並轉換回原始數值（np.expm1 是 log1p 的反函數）
y_pred_log = xgb_model.predict(X_test)
y_pred = np.expm1(y_pred_log)
y_pred = np.clip(y_pred, 0, None) # 確保沒有負數

# --- 嚴謹的多指標評估學術成果區 ---
valid_idx = (y_test != 0)
y_test_safe = y_test[valid_idx]
y_pred_safe = y_pred[valid_idx]

mae = mean_absolute_error(y_test, y_pred)
mpe = np.mean((y_test_safe - y_pred_safe) / y_test_safe) * 100
mape = np.mean(np.abs((y_test_safe - y_pred_safe) / y_test_safe)) * 100
wape = np.sum(np.abs(y_test_safe - y_pred_safe)) / np.sum(y_test_safe) * 100

print(f"  - 測試集多指標驗證成功：")
print(f"    1. 平均絕對誤差 (MAE): {mae:.2f} PM2.5")
print(f"    2. 平均百分比誤差 (MPE): {mpe:.2f}%")
print(f"    3. 原始平均絕對百分比誤差 (MAPE): {mape:.2f}%")
print(f"    4. 權重絕對百分比誤差 (WAPE): {wape:.2f}% ")

# 將模型打包存檔
models_dir = 'models'
os.makedirs(models_dir, exist_ok=True)
model_path = os.path.join(models_dir, 'xgb_pm25_model.pkl')
with open(model_path, 'wb') as f:
    pickle.dump(xgb_model, f)
print(f"  - [儲存] 模型已成功打包存檔至: {model_path}")


# %% [3] 載入已存模型進行雙層克利金網格補值演練
print("\n>>> 階段 3：模擬線上系統，載入模型進行全桃園網格補值...")

with open(model_path, 'rb') as f:
    loaded_xgb_model = pickle.load(f)

g_conf = COMMON_CONFIG['grid']
grid_km = g_conf['grid_size_km']

lon_span = g_conf['max_lon'] - g_conf['min_lon']
lat_span = g_conf['max_lat'] - g_conf['min_lat']
num_intervals_lon = int(np.ceil((lon_span * 101) / grid_km))
num_intervals_lat = int(np.ceil((lat_span * 111) / grid_km))

grid_lon = np.linspace(g_conf['min_lon'], g_conf['max_lon'], num_intervals_lon)
grid_lat = np.linspace(g_conf['min_lat'], g_conf['max_lat'], num_intervals_lat)
lon_mesh, lat_mesh = np.meshgrid(grid_lon, grid_lat)

target_time = df_cleaned['time'].iloc[-1]
lag_time_1h = target_time - pd.Timedelta(hours=1)
lag_time_2h = target_time - pd.Timedelta(hours=2)
lag_time_24h = target_time - pd.Timedelta(hours=24)

# 建立網格預測資料表
grid_points = pd.DataFrame({
    'lon': lon_mesh.ravel(),
    'lat': lat_mesh.ravel(),
    'hour': target_time.hour,
    'day_of_week': target_time.dayofweek,
    'season': 1 if target_time.month in [3,4,5] else (2 if target_time.month in [6,7,8] else (3 if target_time.month in [9,10,11] else 4))
})

# 💡【關鍵解卡】：幫無測站的虛擬網格點，補上 One-Hot 欄位並全部填 0
for col in station_cols:
    grid_points[col] = 0

# 克利金 1：為無測站網格生成 Lag 特徵
for lag_t, lag_col in zip([lag_time_1h, lag_time_2h, lag_time_24h], ['pm25_lag_1h', 'pm25_lag_2h', 'pm25_lag_24h']):
    station_lag_data = df_cleaned[df_cleaned['time'] == lag_t]
    
    # 這裡因為 station_lag_data 包含重複的網格點（因為經緯度一模一樣），先做個簡單的 groupby 平均防呆
    # 由於經過 one-hot 展開，要確保傳給克利金的點是唯一的
    station_lag_uniq = station_lag_data.groupby(['lon', 'lat'])['pm25'].mean().reset_index()
    
    ok_lag = OrdinaryKriging(
        station_lag_uniq['lon'].values, station_lag_uniq['lat'].values, station_lag_uniq['pm25'].values,
        variogram_model='linear', verbose=False
    )
    z_grid, _ = ok_lag.execute('grid', grid_lon, grid_lat)
    grid_points[lag_col] = z_grid.ravel()

# 使用模型預測底圖 (因為模型是用 Log 訓練的，預測出來要用 expm1 轉回來！)
grid_trend_pred_log = loaded_xgb_model.predict(grid_points[feature_cols])
grid_trend_pred = np.expm1(grid_trend_pred_log)

# 計算 5 測站殘差
current_stations = df_cleaned[df_cleaned['time'] == target_time]
station_preds_log = loaded_xgb_model.predict(current_stations[feature_cols])
station_preds = np.expm1(station_preds_log)

# 因為現有觀測站在同一時間可能有多筆（如前述），依測站位置合併殘差
current_stations_clean = current_stations.copy()
current_stations_clean['pred_pm25'] = station_preds
station_uniq = current_stations_clean.groupby(['lon', 'lat']).agg({'pm25':'mean', 'pred_pm25':'mean'}).reset_index()
station_residuals = station_uniq['pm25'].values - station_uniq['pred_pm25'].values

# 克利金 2：殘差空間修正
ok_residual = OrdinaryKriging(
    station_uniq['lon'].values, station_uniq['lat'].values, station_residuals,
    variogram_model='linear', verbose=False
)
grid_residual_pred, _ = ok_residual.execute('grid', grid_lon, grid_lat)

# 終極融合
final_grid_pm25 = grid_trend_pred + grid_residual_pred.ravel()
final_grid_pm25 = np.clip(final_grid_pm25, 0, None)

print(f"\n🎉 [補值成功] 目標觀測時間：{target_time}")
print(f"  - 全桃園共 {len(final_grid_pm25)} 個空間網格點推估完畢。")
print(f"  - 網格推估範圍：{final_grid_pm25.min():.2f} ~ {final_grid_pm25.max():.2f} PM2.5")


# %% [4] 產出前端 TGOS 專用 JSON 格式
print("\n>>> 階段 4：正在幫前端組員轉換 TGOS 專用網格格式...")
lon_delta = (g_conf['max_lon'] - g_conf['min_lon']) / num_intervals_lon
lat_delta = (g_conf['max_lat'] - g_conf['min_lat']) / num_intervals_lat

tgos_cells = []
for idx, row in grid_points.iterrows():
    c_lon = row['lon']
    c_lat = row['lat']
    pred_val = final_grid_pm25[idx]
    
    p_left_down  = {"longitude": round(c_lon - lon_delta/2, 5), "latitude": round(c_lat - lat_delta/2, 5)}
    p_right_down = {"longitude": round(c_lon + lon_delta/2, 5), "latitude": round(c_lat - lat_delta/2, 5)}
    p_right_up   = {"longitude": round(c_lon + lon_delta/2, 5), "latitude": round(c_lat + lat_delta/2, 5)}
    p_left_up    = {"longitude": round(c_lon - lon_delta/2, 5), "latitude": round(c_lat + lat_delta/2, 5)}
    
    grid_item = {
        "grid_id": int(idx + 1),
        "values": { "value": float(round(pred_val, 2)) },
        "polygonCoords": [p_left_down, p_right_down, p_right_up, p_left_up, p_left_down]
    }
    tgos_cells.append(grid_item)

web_output_path = 'data/processed/web_grid_data.json'
with open(web_output_path, 'w', encoding='utf-8') as f:
    json.dump(tgos_cells, f, ensure_ascii=False, indent=2)

print(f"🎉 前端對接 JSON 檔案已完美落地：{web_output_path}")