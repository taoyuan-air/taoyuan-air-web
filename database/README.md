# Database 目錄說明

此目錄保留資料庫 schema 與 SQL 查詢範例。正式建表請使用各資料源獨立 schema。

## 正式 Schema

| 檔案 | 資料源 | 用途 |
| --- | --- | --- |
| `moe_stations_schema.sql` | MOE 環境部測站 | 空氣品質測站與小時值資料 |
| `cwa_stations_schema.sql` | CWA 氣象署測站 | 氣象測站與小時觀測資料 |
| `tydep_stations_schema.sql` | TYDEP 桃園市環保局 | 桃園市環保局測站與小時值資料 |
| `teds_point_schema.sql` | TEDS 點源 | 排放源位置與年排放量資料 |
| `uav_schema.sql` | UAV 無人機 | 無人機垂直剖面資料 |
| `wind_lidar_schema.sql` | WindLidar 風光達 | 風光達垂直風場資料 |
| `naqo_schema.sql` | NAQO 中大空品站 | 中大空品站小時資料本地 cache / history |
| `auth_schema.sql` | 登入系統 | 使用者資料表 |

## 資料源檔名格式（2026-08 更新）

| 資料源 | 檔名範例 | 說明 |
| --- | --- | --- |
| WindLidar | `DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt` | 都卜勒風光達_版本_等級_參數_日期_序號_站點 |
| UAV | `UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt` | 儀器_版本_等級_參數_日期_時間_儀器版本_站點 |

## 查詢範例

查詢範例放在 `database/examples/`，不屬於建表流程。

## 分區與更新流程

| 資料源 | 分區策略 | 自動建立位置 | 補正或更新流程 |
| --- | --- | --- | --- |
| MOE | 依 `monitor_date` 月分區 | `scripts/import_moe_stations.py` | `scripts/update_moe_monthly.py` 以 history 覆蓋 realtime |
| CWA | 依 `monitor_date` 月分區 | `scripts/import_cwa_stations.py` | `scripts/update_cwa_monthly.py` 以 history 覆蓋 realtime |
| TYDEP | 依 `monitor_date` 月分區 | `scripts/import_tydep_stations.py` | 歷史資料批次匯入 |
| UAV | 依 `flight_id` LIST 分區 | `scripts/import_uav.py` | 每個飛行任務自動補一個分區 |
| WindLidar | 依 `measure_time` 日分區 | `scripts/import_wind_lidar.py` | 每日資料匯入時自動補日分區 |
| NAQO | 第一版不分區 | `database/naqo_schema.sql` | 第一階段後端即時查 Supabase；第二階段 `scripts/sync_naqo.py` 以 `inserted_at` 浮標同步 |

## NAQO 對接流程

NAQO 資料來源維持 Supabase，第一階段不需要先匯入本地 PostgreSQL：

```text
NAQO cron job -> Supabase table min60 -> FastAPI /api/naqo/* -> frontend-web 數據檢索頁「中大空品站」
```

後端環境變數設定在 `backend/.env`：

```bash
NAQO_SUPABASE_URL=https://ohofnntxmncifmssbmpt.supabase.co
NAQO_SUPABASE_ANON_KEY=your_naqo_supabase_anon_key
NAQO_SUPABASE_TABLE=min60
NAQO_DEFAULT_DATA_TYPE=min60
NAQO_TZ_WORKAROUND=true
```

`NAQO_SUPABASE_ANON_KEY` 不要寫進 Git。若需要本地歷史查詢或 cache，再進入第二階段：建立 `database/naqo_schema.sql`，並用 `scripts/sync_naqo.py` 從 Supabase 增量同步。

## NAQO FastAPI endpoints

| Endpoint | 用途 | 階段 1 來源 | 階段 2 來源 |
| --- | --- | --- | --- |
| `GET /api/naqo/status` | 檢查 Supabase 設定與上游連線 | Supabase | Supabase + DB |
| `GET /api/naqo/types` | 取得可用 `data_type` | Supabase distinct | `naqo_hourly_data` |
| `GET /api/naqo/latest?limit=5` | 最新資料 | Supabase | `naqo_latest_data` |
| `GET /api/naqo/data?days=7` | 指定天數資料 | Supabase | `naqo_hourly_data` |
| `GET /api/explorer/history?days=7` | 數據檢索頁歷史資料 | 本機 DB 既有資料源 | 本機 DB + `naqo_hourly_data` |

後端職責：

1. 從 `backend/.env` 讀取 Supabase 設定，前端不直接接觸 key。
2. 處理 NAQO 來源時間欄位的時區修正。
3. 將 Supabase 寬表轉成前端卡片需要的資料格式。
4. 欄位正規化：`PM25` 顯示為 `PM2.5`，`NOX` 顯示為 `NOx`。
5. 補上展示欄位：`source = '中大空品站'`、`region = '中壢區'`、`station = 'NAQO 中大空品站'`。
6. 上游或單一歷史資料源失敗時回傳明確錯誤資訊，避免前端整頁掛掉。

## NAQO 本機啟動

本機測試時需要同時開後端與前端。後端讀 `backend/.env`，前端讀 `frontend-web/.env.local`。

### 後端環境變數

`backend/.env` 至少需要：

```bash
DATABASE_URL=postgresql+asyncpg://taoyuan_user:taoyuan_pass@localhost:5432/taoyuan_air
SECRET_KEY=your_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_URL=http://localhost:3000

NAQO_SUPABASE_URL=https://ohofnntxmncifmssbmpt.supabase.co
NAQO_SUPABASE_ANON_KEY=your_naqo_supabase_anon_key
NAQO_SUPABASE_TABLE=min60
NAQO_DEFAULT_DATA_TYPE=min60
NAQO_TZ_WORKAROUND=true

COOKIE_SECURE=false
COOKIE_SAMESITE=lax
COOKIE_PATH=/
```

### 前端環境變數

`frontend-web/.env.local` 本機開發建議設定：

```bash
NEXT_PUBLIC_API_BASE=/api
BACKEND_ORIGIN=http://127.0.0.1:8000
```

若後端改開 `8001`，`BACKEND_ORIGIN` 也要同步改成 `http://127.0.0.1:8001`。

### 開啟服務

Terminal 1：開本機資料庫。

```bash
cd /Users/yunhsuan/taoyuan-air
docker-compose up -d
```

Terminal 2：開後端。

```bash
cd /Users/yunhsuan/taoyuan-air/backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 3：開前端。

```bash
cd /Users/yunhsuan/taoyuan-air
npm run web
```

瀏覽器開啟：

```text
http://localhost:3000/explorer
```

`AuthGuard` 應維持登入保護，不要提交本機 `dev_auth` 繞過登入的改動。若要進頁面測試，請使用正常登入流程。

前端驗證重點：

1. 成功登入後可進入「數據檢索」頁。
2. 資料來源可選擇「中大空品站」。
3. 卡片不再顯示「模擬資料」。
4. 時間顯示為台灣時間，不應差 8 小時。
5. 參數選單不顯示 NAQO 不提供的 `PM10`、`NO2`。

## NAQO 歷史資料庫匯入與驗證

歷史資料庫會讀本機 PostgreSQL 的 `naqo_hourly_data`，不是直接讀 Supabase。第一次測試請依序做：確認 DB 開啟、建立 schema、同步資料、查詢筆數、測後端 API。

### 1. 確認資料庫容器

```bash
cd /Users/yunhsuan/taoyuan-air
docker-compose up -d
docker ps
```

需看到 `taoyuan-air-db` 正在執行。

### 2. 建立 NAQO schema

```bash
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/naqo_schema.sql
```

### 3. 安裝同步腳本依賴

```bash
source backend/.venv/bin/activate
pip install -r scripts/requirements.txt
```

若歷史 API 出現 `No module named 'greenlet'`，請在 backend `.venv` 補裝：

```bash
pip install greenlet
```

### 4. 同步 Supabase 至本機 PostgreSQL

首次執行會以 `1970-01-01` 作為初始浮標，將 Supabase `min60` 依 `inserted_at` 增量同步到 `naqo_hourly_data`。

```bash
python scripts/sync_naqo.py
```

指定時間範圍回補：

```bash
python scripts/import_naqo_supabase.py --start "2026-08-01T00:00:00" --end "2026-08-08T00:00:00"
```

`--full-check` 目前為保留參數，實際完整驗證請以下方 SQL 與 API 回傳結果為準。

### 5. SQL 驗證

```bash
docker exec -it taoyuan-air-db psql -U taoyuan_user -d taoyuan_air
```

進入 psql 後執行：

```sql
SELECT COUNT(*) FROM naqo_stations;      -- 應為 1
SELECT COUNT(*) FROM naqo_pollutants;    -- 目前應為 6
SELECT COUNT(*) FROM naqo_hourly_data;   -- 同步後應大於 0

SELECT * FROM naqo_latest_data;
SELECT * FROM check_naqo_data_quality();

SELECT MAX(source_inserted_at) AS watermark
FROM naqo_hourly_data;

SELECT monitor_date, COUNT(*) AS pollutant_count
FROM naqo_hourly_data
WHERE monitor_date >= NOW() - INTERVAL '48 hours'
GROUP BY monitor_date
ORDER BY monitor_date DESC;
```

離開 psql：

```sql
\q
```

### 6. API 驗證

後端需保持開啟：

```bash
curl -i http://localhost:8000/api/naqo/status
curl -i http://localhost:8000/api/naqo/latest?limit=5
curl -i http://localhost:8000/api/explorer/history?days=7
```

判讀方式：

| 結果 | 意義 |
| --- | --- |
| `/api/naqo/latest` 有資料 | Supabase 即時資料串接成功 |
| `/api/explorer/history` 回 `data` 且含 `中大空品站` | 本機歷史資料已同步並可供前端使用 |
| `/api/explorer/history` 回 `data: []`、`errors: {}` | DB 可連線，但本機歷史表尚無資料 |
| `/api/explorer/history` 回 `errors` | 依錯誤內容檢查 DB、schema 或欄位 |

## 建議建置順序

依需要執行單一資料源 schema：

```bash
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/moe_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/cwa_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/tydep_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/teds_point_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/uav_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/wind_lidar_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/naqo_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/auth_schema.sql
```

## 匯入資料

原始資料不納入 Git 版控。請自行將資料放入 `data/raw/<資料源>/` 後執行匯入腳本。

```bash
# WindLidar
python scripts/import_wind_lidar.py

# UAV
python scripts/import_uav.py

# CWA
python scripts/import_cwa_stations.py

# MOE
python scripts/import_moe_stations.py

# TYDEP（需先轉檔）
python scripts/convert_tydep_xlsx.py
python scripts/import_tydep_stations.py

# NAQO（第二階段：同步 Supabase min60 至本地 PostgreSQL）
python scripts/sync_naqo.py

# NAQO 指定時間範圍回補
python scripts/import_naqo_supabase.py --start "2026-08-01T00:00:00" --end "2026-08-08T00:00:00"
```

## 重新匯入（清空重來）

如果 schema 有變更（如欄位重新命名），需先 DROP 舊表再重建：

```sql
-- 範例：重建 WindLidar
DROP TABLE IF EXISTS wind_lidar_data CASCADE;
DROP TABLE IF EXISTS wind_lidar_stations CASCADE;
DROP TABLE IF EXISTS wind_lidar_parameters CASCADE;

-- 範例：重建 UAV
DROP TABLE IF EXISTS uav_data CASCADE;
DROP TABLE IF EXISTS uav_flights CASCADE;
DROP TABLE IF EXISTS uav_parameters CASCADE;

-- 範例：重建 NAQO
DROP TABLE IF EXISTS naqo_hourly_data CASCADE;
DROP TABLE IF EXISTS naqo_stations CASCADE;
DROP TABLE IF EXISTS naqo_pollutants CASCADE;
```

然後重新執行 schema SQL + import 腳本。

## 已移除舊檔

| 舊檔 | 移除原因 |
| --- | --- |
| `init.sql` | 舊版通用 schema，已被各資料源獨立 schema 取代 |
| `test_data.sql` | 舊版 `init.sql` 的測試資料，與目前資料表不一致 |
