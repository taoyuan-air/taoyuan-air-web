import os
import requests
import urllib3
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, timedelta
from dotenv import load_dotenv

# 隱藏 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 載入環境變數與資料庫設定
load_dotenv()
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": os.getenv("POSTGRES_PORT", "5432"),
    "dbname": os.getenv("POSTGRES_DB", "taoyuan_air"),
    "user": os.getenv("POSTGRES_USER", "taoyuan_user"),
    "password": os.getenv('POSTGRES_PASSWORD') 
}

API_KEY = "***REMOVED***"

# 3 大目標資料集
DATASET_IDS = [
    "O-A0001-001", # 負責抓自動氣象站
    "O-A0003-001"  # 負責抓有人站 + 農業站
]

TAOYUAN_STATION_IDS = {
    # 中央氣象署有人站
    "467050",
    # 自動氣象站 
    "C1C510",   "C0C800",   "C0C790",   "C0C750",
    "C0C740",   "C0C730",   "C0C720",   "C0C710",
    "C0C700",   "C0C680",   "C0C670",   "C0C660",
    "C0C650",   "C0C630",   "C0C620",   "C0C490",
    "C0C460", 
    # 農業氣象站 
    "72C440",   "82C160",   "A2C560",   "C2C410",
    "C2C590", 
    # 依實際需求繼續補充 ...
}

OBS_MAP = {
    'Precipitation': 'PP01',
    'AirTemperature': 'TX01',
    'RelativeHumidity': 'RH01',
    'AirPressure': 'PS01',
    'WindSpeed': 'WD01',
    'WindDirection': 'WD02',
    'GlobalSolarRadiation': 'GR01'
}

def parse_and_insert_realtime_data():
    # 改用 dictionary 來儲存，利用 (station_id, monitor_date, obs_id) 當作 key 來去重複
    unique_rows = {}
    
    # 依序抓取三大資料集
    for dataset_id in DATASET_IDS:
        url = f"https://opendata.cwa.gov.tw/api/v1/rest/datastore/{dataset_id}?Authorization={API_KEY}&format=JSON"
        print(f"正在抓取 {dataset_id} 資料中...")
        
        response = requests.get(url, verify=False)
        if response.status_code != 200:
            print(f"❌ {dataset_id} 請求失敗")
            continue
            
        # 安全取值，避免 JSON 結構有微小差異導致報錯
        stations = response.json().get('records', {}).get('Station', [])
        
        for station in stations:
            station_id = station.get('StationId')
            if station_id not in TAOYUAN_STATION_IDS:
                continue
                
            obs_time_str = station.get('ObsTime', {}).get('DateTime')
            if not obs_time_str:
                continue
                
            raw_dt = datetime.strptime(obs_time_str[:19], "%Y-%m-%dT%H:%M:%S")
            weather_elements = station.get('WeatherElement', {})
            
            for api_key, obs_id in OBS_MAP.items():
                val = weather_elements.get(api_key)
                if val is None or val in [-99, -999, -9999, -99.0, -999.0]:
                    continue
                    
                if obs_id in ['PP01', 'GR01']:
                    monitor_date = raw_dt - timedelta(hours=1)
                    p_start = monitor_date
                    p_end = monitor_date + timedelta(minutes=59)
                elif obs_id in ['WD01', 'WD02']:
                    monitor_date = raw_dt
                    p_start = raw_dt - timedelta(minutes=10)
                    p_end = raw_dt - timedelta(minutes=1)
                else: 
                    monitor_date = raw_dt
                    p_start = raw_dt - timedelta(minutes=1)
                    p_end = raw_dt
                    
                # 建立唯一的 Key
                key = (station_id, monitor_date, obs_id)
                # 寫入字典（若有重複的 Key 會自動覆蓋舊資料，達到去重複的效果）
                unique_rows[key] = (
                    station_id, monitor_date, obs_id, str(val), float(val), 'good', p_start, p_end, 'realtime'
                )
                
    # 將去重複後的字典 values 轉回 List，準備寫入資料庫
    rows_to_insert = list(unique_rows.values())
                
    print(f"✅ 解析完成！去重複後共篩選出 {len(rows_to_insert)} 筆紀錄，準備寫入資料庫...")
    
    # --- 寫入資料庫邏輯 ---
    if rows_to_insert:
        conn = None
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            with conn.cursor() as cur:
                insert_sql = """
                    INSERT INTO cwa_hourly_data 
                    (station_id, monitor_date, observation_id, concentration, concentration_numeric, data_quality, period_start, period_end, source)
                    VALUES %s
                    ON CONFLICT (station_id, monitor_date, observation_id) 
                    DO UPDATE SET 
                        concentration = EXCLUDED.concentration,
                        concentration_numeric = EXCLUDED.concentration_numeric,
                        data_quality = EXCLUDED.data_quality
                    WHERE cwa_hourly_data.source = 'realtime'; 
                """
                execute_values(cur, insert_sql, rows_to_insert)
                conn.commit()
                print(f"🎉 成功寫入 {cur.rowcount} 筆即時資料到 cwa_hourly_data！")
                
        except Exception as e:
            print(f"❌ 寫入資料庫失敗: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                conn.close()
    else:
        print("沒有新的資料需要寫入。")

if __name__ == "__main__":
    parse_and_insert_realtime_data()