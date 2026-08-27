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

## 設計文檔

| 檔案 | 用途 |
| --- | --- |
| `naqo_database_design.md` | NAQO Supabase 對接、後端 adapter、本地 cache 與 VM 部署規劃 |

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
