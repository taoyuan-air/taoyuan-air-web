# Database 目錄說明

此目錄放各資料源的建表 schema。資料存放位置、檔名格式與匯入方式見 `data/DATA_GUIDE.md`；本機啟動方式見根目錄 `README.md`。

## 正式 Schema

依老師 11/13 列的 6 類資料整理。

| 檔案 | 類別 | 用途 |
| --- | --- | --- |
| `moe_stations_schema.sql` | 1. 環境部空品站 | 測站與小時值（歷史＋即時） |
| `cwa_stations_schema.sql` | 2. 氣象署 | 測站與小時觀測（歷史＋即時） |
| `tydep_stations_schema.sql` | 3. 環保局 | 空品站 4 站＋觀音工業區氣象站 4 站、15 個量測項目（歷史＋即時） |
| `migrate_tydep_v2.sql` | 3. 環保局 | 舊版 TYDEP 資料表升級用，見下方「TYDEP 升級」 |
| `naqo_schema.sql` | 4. NAQO 中大空品站 | Supabase 同步到本地的小時資料 |
| `teds_point_schema.sql` | 5. 排放源 | TEDS 點源位置與年排放量 |
| `teds_grid_schema.sql` | 5. 排放源 | TEDS 網格源 |
| `exam_point_schema.sql` | 5. 排放源 | 特殊排放點源（固定污染源戴奧辛/重金屬/HCl 檢測） |
| `iop_schema.sql` | 6. IOP | IOP 清單（`iop_events`）與 VOCs 採樣 |
| `iop_aerosol_schema.sql` | 6. IOP | 氣膠化學濾紙（PM2.5、PM1） |
| `iop_lcs_schema.sql` | 6. IOP | 微型感測器逐時資料 |
| `iop_hg_schema.sql` | 6. IOP | 大氣汞（GEM、GOM、PBM） |
| `uav_schema.sql` | 6. IOP | UAS 無人機垂直剖面（表名沿用 `uav_*`） |
| `wind_lidar_schema.sql` | 6. IOP | 風光達垂直風場（寬表：一個時間 × 高度一列） |
| `aod_schema.sql` | 待老師確認是否保留 | MAIAC 衛星 AOD 與 PM2.5 補值模型特徵 |
| `auth_schema.sql` | 網站 | 登入帳號 |

`iop_*` 開頭的表都有 `iop_id` 欄位（FK → `iop_events`）；`uav_*`、`wind_lidar_*` 沒有，網頁依 `iop_events` 的起訖日期篩選。

查詢範例放在 `database/examples/`，不屬於建表流程。

## 建表

**`iop_schema.sql` 必須先於其他 IOP 表；`teds_point` 必須先於 `teds_grid`**（兩者共用 `teds_observations`）。

```bash
DB="docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air"

$DB < database/moe_stations_schema.sql
$DB < database/cwa_stations_schema.sql
$DB < database/tydep_stations_schema.sql
$DB < database/naqo_schema.sql
$DB < database/teds_point_schema.sql
$DB < database/teds_grid_schema.sql
$DB < database/exam_point_schema.sql
$DB < database/iop_schema.sql
$DB < database/iop_aerosol_schema.sql
$DB < database/iop_lcs_schema.sql
$DB < database/iop_hg_schema.sql
$DB < database/uav_schema.sql
$DB < database/wind_lidar_schema.sql
$DB < database/aod_schema.sql
$DB < database/auth_schema.sql
```

所有 schema 都可重複執行（已存在的表會略過）。

### TYDEP 升級（只有舊版資料庫需要）

2026/11 TYDEP 改為 v2：8 個測站、15 個量測項目，測站編號改成與即時 CSV 檔名一致（如 `0604616A0002` → `TYDEP_Xinxing`），`tydep_pollutants` 改名為 `tydep_parameters`。

**以前用舊版建過 TYDEP 表的資料庫**，先升級再執行 schema（歷史資料會一併換成新編號）：

```bash
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -v ON_ERROR_STOP=1 < database/migrate_tydep_v2.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -v ON_ERROR_STOP=1 < database/tydep_stations_schema.sql
```

新資料庫只需要執行 `tydep_stations_schema.sql`。VM 已於 2026/11 升級完成。

## 分區與更新方式

| 資料源 | 分區 | 匯入腳本 | 更新方式 |
| --- | --- | --- | --- |
| MOE | `monitor_date` 月分區 | `import_moe_stations.py` | 即時由後端呼叫 API；`update_moe_monthly.py` 以 history 覆蓋 realtime |
| CWA | `monitor_date` 月分區 | `import_cwa_stations.py` | 即時由後端呼叫 API；`update_cwa_monthly.py` 以 history 覆蓋 realtime |
| TYDEP | `monitor_date` 月分區 | `import_tydep_stations.py` | 即時：每小時排程執行 `update_tydep_realtime.py`，寫入 realtime，不覆蓋 history |
| NAQO | 不分區 | `sync_naqo.py` | 以 Supabase 的 `inserted_at` 浮標增量同步 |
| TEDS 點源、網格 | 不分區 | `import_teds_point.py`、`import_teds_grid.py` | 不更新；重複略過 |
| 特殊排放點源 | 不分區 | `import_exam_point.py` | 以 `(source_id, item_id, exam_date)` UPSERT |
| IOP UAS | `flight_id` LIST 分區 | `import_iop_uas.py` | IOP 新檔上傳後手動匯入；整趟飛行重寫 |
| IOP WindLidar | `measure_time` 日分區 | `import_iop_wind_lidar.py` | IOP 新檔上傳後手動匯入；同一天先刪後寫 |
| IOP LCS、Hg、VOCs、氣膠 | 不分區 | `import_iop_*.py` | IOP 新檔上傳後手動匯入 |
| AOD | `obs_date` 月分區 | `import_maiac_aod.py` | 以日為單位整天替換 |

各腳本的參數與資料夾位置見 `data/DATA_GUIDE.md`。

## NAQO

NAQO 資料來源是 Supabase。後端即時資料直接查 Supabase；歷史資料同步到本地 `naqo_hourly_data`：

```bash
python scripts/sync_naqo.py
```

連線設定寫在 `backend/.env`（範本見 `backend/.env.example`），**不要把真正的 `NAQO_SUPABASE_ANON_KEY` 提交到 Git**。

## 重建資料表

schema 有變更（如欄位改名）時，先 DROP 再重新執行 schema 與匯入腳本，例如：

```sql
-- 風光達
DROP TABLE IF EXISTS wind_lidar_data CASCADE;
DROP TABLE IF EXISTS wind_lidar_stations CASCADE;
DROP TABLE IF EXISTS wind_lidar_parameters CASCADE;

-- UAS（表名沿用 uav_*）
DROP TABLE IF EXISTS uav_data CASCADE;
DROP TABLE IF EXISTS uav_flights CASCADE;
DROP TABLE IF EXISTS uav_parameters CASCADE;
```

DROP 會刪掉資料，在 VM 上執行前先確認原始檔都還在。
