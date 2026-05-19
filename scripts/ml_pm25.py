import numpy as np
import pandas as pd
from pykrige.ok import OrdinaryKriging
from sklearn.metrics import mean_absolute_error
from xgboost import XGBRegressor
import sys
import os
import pickle
import json

# 因為檔案放進 scripts/，要把專案根目錄加進 Python 搜尋路徑，這樣才讀得到 src 裡的 config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
try:
    from src.config import COMMON_CONFIG
except ModuleNotFoundError:
    # 如果還沒有 src/config.py，這裡預備了本地備份設定，確保程式不崩潰
    COMMON_CONFIG = {
        'target_stations': ['桃園', '中壢', '平鎮', '觀音', '大園'],
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

# dropna() 自動剔除任何包含 Null 值的列，確保特徵與答案乾淨
df_cleaned = df.dropna().copy()
print(f"原始有效紀錄數：{len(df_cleaned)}")


# %% [2] 時序資料切割、模型訓練與模型儲存
print("\n>>> 階段 2：進行時序切割與 XGBoost 訓練...")

split_date = '2025-11-30 23:00:00'
train_data = df_cleaned[df_cleaned['time'] <= split_date]
test_data = df_cleaned[df_cleaned['time'] > split_date]

feature_cols = ['lon', 'lat', 'hour', 'day_of_week', 'season', 'pm25_lag_1h', 'pm25_lag_2h', 'pm25_lag_24h']

X_train, y_train = train_data[feature_cols], train_data['pm25']
X_test, y_test = test_data[feature_cols], test_data['pm25']

print(f"  - 訓練集時間範圍: {train_data['time'].min()} ~ {train_data['time'].max()} (共 {len(train_data)} 筆)")
print(f"  - 測試集時間範圍: {test_data['time'].min()} ~ {test_data['time'].max()} (共 {len(test_data)} 筆)")

# 訓練模型
xgb_model = XGBRegressor(n_estimators=100, max_depth=6, random_state=42)
xgb_model.fit(X_train, y_train)
print("  - XGBoost 趨勢模型訓練成功！")

# 在測試集上評估模型
y_pred = xgb_model.predict(X_test)

# A. 計算 MAE
mae = mean_absolute_error(y_test, y_pred)
print(f"  - 測試集驗證成功！")
print(f"    1. 平均絕對誤差 (MAE): {mae:.2f} PM2.5")

# B. 安全計算 MPE (安全排除分母為 0 的狀況)
# 找出真實值大於 0 的索引
valid_idx = (y_test != 0)
y_test_safe = y_test[valid_idx]
y_pred_safe = y_pred[valid_idx]

# MPE 公式：((真實 - 預測) / 真實) 的平均值 * 100
mpe = np.mean((y_test_safe - y_pred_safe) / y_test_safe) * 100
print(f"    2. 平均百分比誤差 (MPE): {mpe:.2f}%")

# C. 順便多送一個學術愛用的 MAPE (百分比絕對誤差)
mape = np.mean(np.abs((y_test_safe - y_pred_safe) / y_test_safe)) * 100
print(f"    3. 平均絕對百分比誤差 (MAPE): {mape:.2f}%")

# 💡 幫你寫好專題報告的解讀邏輯：
if mpe < 0:
    print(f"    👉 [學術解讀] MPE 為負值 ({mpe:.2f}%)，代表模型整體而言對未來空品有微幅「高估」傾向，符合安全防護預警原則。")
else:
    print(f"    👉 [學術解讀] MPE 為正值 ({mpe:.2f}%)，代表模型整體而言有「低估」傾向。")

# 將訓練好的模型持久化存檔
models_dir = 'models'
os.makedirs(models_dir, exist_ok=True)
model_path = os.path.join(models_dir, 'xgb_pm25_model.pkl')

with open(model_path, 'wb') as f:
    pickle.dump(xgb_model, f)
print(f"  - [儲存] 模型已成功打包存檔至: {model_path}")


# %% [3] 載入已存模型進行雙層克利金網格補值演練
print("\n>>> 階段 3：模擬線上系統，載入模型進行全桃園網格補值...")

if not os.path.exists(model_path):
    raise FileNotFoundError(f"找不到模型檔案 {model_path}，請先執行階段 2。")

with open(model_path, 'rb') as f:
    loaded_xgb_model = pickle.load(f) # 修正點 1: 拿掉錯誤的 pickle.dump
print("  - [載入] 已成功從硬碟載入 XGBoost 模型。")

# 挑選歷史資料中的最後一個小時來進行補值測試
target_time = df_cleaned['time'].iloc[-1]
lag_time_1h = target_time - pd.Timedelta(hours=1)
lag_time_2h = target_time - pd.Timedelta(hours=2)
lag_time_24h = target_time - pd.Timedelta(hours=24)

g_conf = COMMON_CONFIG['grid']
grid_km = g_conf['grid_size_km']

# 地理數學換算：根據經緯度跨距，動態計算 3KM 需要切幾等分
lon_span = g_conf['max_lon'] - g_conf['min_lon']
lat_span = g_conf['max_lat'] - g_conf['min_lat']
num_intervals_lon = int(np.ceil((lon_span * 101) / grid_km))
num_intervals_lat = int(np.ceil((lat_span * 111) / grid_km))

# 根據計算出的份數，生成 3KM 的網格點
grid_lon = np.linspace(g_conf['min_lon'], g_conf['max_lon'], num_intervals_lon)
grid_lat = np.linspace(g_conf['min_lat'], g_conf['max_lat'], num_intervals_lat)
print(f"  - 3KM 網格計算：經度切 {num_intervals_lon} 份，緯度切 {num_intervals_lat} 份。")

# 修正點 2: 建立網格 DataFrame 之前，必須先產出網格矩陣變數
lon_mesh, lat_mesh = np.meshgrid(grid_lon, grid_lat)

grid_points = pd.DataFrame({
    'lon': lon_mesh.ravel(),
    'lat': lat_mesh.ravel(),
    'hour': target_time.hour,
    'day_of_week': target_time.dayofweek,
    'season': 1 if target_time.month in [3,4,5] else (2 if target_time.month in [6,7,8] else (3 if target_time.month in [9,10,11] else 4))
})

# 克利金 1：為無測站網格生成 Lag 特徵
for lag_t, lag_col in zip([lag_time_1h, lag_time_2h, lag_time_24h], ['pm25_lag_1h', 'pm25_lag_2h', 'pm25_lag_24h']):
    station_lag_data = df_cleaned[df_cleaned['time'] == lag_t]
    ok_lag = OrdinaryKriging(
        station_lag_data['lon'].values, station_lag_data['lat'].values, station_lag_data['pm25'].values,
        variogram_model='linear', verbose=False
    )
    z_grid, _ = ok_lag.execute('grid', grid_lon, grid_lat)
    grid_points[lag_col] = z_grid.ravel()

# 使用【剛剛載入的模型】預測底圖
grid_trend_pred = loaded_xgb_model.predict(grid_points[feature_cols])

# 計算 5 測站殘差
current_stations = df_cleaned[df_cleaned['time'] == target_time]
station_preds = loaded_xgb_model.predict(current_stations[feature_cols])
station_residuals = current_stations['pm25'].values - station_preds

# 克利金 2：殘差空間修正
ok_residual = OrdinaryKriging(
    current_stations['lon'].values, current_stations['lat'].values, station_residuals,
    variogram_model='linear', verbose=False
)
grid_residual_pred, _ = ok_residual.execute('grid', grid_lon, grid_lat)

# 終極融合
final_grid_pm25 = grid_trend_pred + grid_residual_pred.ravel()
final_grid_pm25 = np.clip(final_grid_pm25, 0, None)

print(f"\n🎉 [補值成功] 目標觀測時間：{target_time}")
print(f"  - 全桃園共 {len(final_grid_pm25)} 個空間網格點推估完畢。")
print(f"  - 網格推估範圍：{final_grid_pm25.min():.2f} ~ {final_grid_pm25.max():.2f} PM2.5")