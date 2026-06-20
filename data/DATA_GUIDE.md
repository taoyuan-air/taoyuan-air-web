# 資料目錄結構說明

## 目錄定位

| 目錄 | 用途 | 是否應手動修改 |
| --- | --- | --- |
| `data/raw/` | 外部來源取得的原始資料 | 不建議修改 |
| `data/processed/` | 轉檔、清理、正規化後的中間資料 | 可由腳本重建 |
| `data/exports/` | 從資料庫匯出的成果、備份或分享檔 | 視用途而定 |

原則上：

```text
外部來源 → data/raw → data/processed → PostgreSQL → data/exports
```

若資料量太大，實際資料檔可能不進 Git，只保留 `.gitkeep` 讓資料夾存在。

## Raw 資料

### `data/raw/moe-stations/`

環境部空氣品質測站資料。

```text
data/raw/moe-stations/
├── AQX_P_205_Resource/  # 桃園
├── AQX_P_206_Resource/  # 大園
├── AQX_P_207_Resource/  # 觀音
├── AQX_P_208_Resource/  # 平鎮
├── AQX_P_209_Resource/  # 龍潭
└── AQX_P_255_Resource/  # 中壢
```

目前中壢站有 `MOEaqdata_068_Zhongli.csv`，可用 `scripts/convert_zhongli_wide_csv.py` 轉成與其他 MOE JSON 相同的格式。

站名正規化：MOE 觀音站在資料庫中統一命名為 `觀音_S`，避免與 TYDEP 的 `觀音_N` 混淆。此規則已寫在 `moe_stations_schema.sql` 與 `scripts/import_moe_stations.py`。

### `data/raw/cwa-stations/`

中央氣象署資料。原始下載包放在 `Package_*` 資料夾。

```text
data/raw/cwa-stations/
├── Package_24780/
├── Package_24781/
└── Package_24937/
```

`scripts/import_cwa_stations.py` 可直接讀取 `.txt`，必要時也可用 `--json-dir` 將解析後資料落地。

### `data/raw/tydep-stations/`

桃園市環保局資料，也就是原 tEPA 的 TYDEP 版本。

```text
data/raw/tydep-stations/
└── 桃園市空氣品質測站監測數據(108-115).xlsx
```

原始 Excel 不應修改。轉檔後的 JSON 應放在 `data/processed/tydep-stations/json/`。

站名正規化：TYDEP 觀音站在資料庫中統一命名為 `觀音_N`。此規則已寫在 `tydep_stations_schema.sql`、`scripts/convert_tydep_xlsx.py` 與 `scripts/import_tydep_stations.py`。

### `data/raw/UAV/`

無人機垂直剖面原始 txt。

```text
data/raw/UAV/
├── 20260330_0025_L3_ascending.txt
├── 20260330_0242_L3_ascending.txt
├── 20260330_1433_L3_ascending.txt
├── 20260330_1517_L3_ascending.txt
├── 20260330_1601_L3_ascending.txt
└── 20260330_1647_L3_ascending.txt
```

匯入腳本：`scripts/import_uav.py`

### `data/raw/WindLidar/`

WindLidar 風光達原始 txt。

```text
data/raw/WindLidar/
├── TMA_328_27Mar2026.txt
├── ...
└── TMA_328_15Apr2026.txt
```

匯入腳本：`scripts/import_wind_lidar.py`

### `data/raw/teds-point/`

TEDS 點源排放清冊原始資料。資料量可能較大，目前以 `.gitkeep` 保留資料夾。

匯入腳本：`scripts/import_teds_point.py`

### `data/raw/MPL/`、`data/raw/NAQO/`

預留給 MPL 與 NAQO 資料來源，目前以 `.gitkeep` 保留資料夾。

## Processed 資料

### `data/processed/tydep-stations/json/`

TYDEP Excel 轉出的中間 JSON。

```text
data/processed/tydep-stations/json/
├── 0604616A0002/
├── 0604316A0003/
├── 0604816I0005/
├── 0605316I0004/
└── stations_meta.json
```

產生方式：

```bash
python scripts/convert_tydep_xlsx.py
```

匯入方式：

```bash
python scripts/import_tydep_stations.py
```

`import_tydep_stations.py` 會優先讀取 `data/processed/tydep-stations/json/`。若此路徑不存在，才 fallback 到舊路徑 `data/raw/tydep-stations/json/`。

## Exports 資料

`data/exports/` 存放人工匯出、交付、分析成果或備份用資料。若輸出檔可重建且很大，不建議放進 Git。

## 資料匯入腳本對照

| 資料源 | Raw / Processed 位置 | 匯入或轉檔腳本 | 分區或更新規則 |
| --- | --- | --- | --- |
| MOE | `data/raw/moe-stations/` | `scripts/import_moe_stations.py`；月資料補正：`scripts/update_moe_monthly.py` | 依 `monitor_date` 自動補月分區；history 可覆蓋 realtime |
| CWA | `data/raw/cwa-stations/` | `scripts/import_cwa_stations.py`；月資料補正：`scripts/update_cwa_monthly.py` | 依 `monitor_date` 自動補月分區；history 可覆蓋 realtime |
| TYDEP | `data/raw/tydep-stations/` → `data/processed/tydep-stations/json/` | `scripts/convert_tydep_xlsx.py`、`scripts/import_tydep_stations.py` | 依 `monitor_date` 自動補月分區 |
| UAV | `data/raw/UAV/` | `scripts/import_uav.py` | 依 `flight_id` 自動補 LIST 分區；`CO2` 為預留欄位，原始檔若提供則匯入 |
| WindLidar | `data/raw/WindLidar/` | `scripts/import_wind_lidar.py` | 依 `measure_time` 自動補日分區 |
| TEDS | `data/raw/teds-point/` | `scripts/import_teds_point.py` | 目前不分區 |

## 資料管理原則

1. `raw/` 保存原始檔，不直接手改。
2. `processed/` 放腳本產生的中間資料，可刪除後重建。
3. `exports/` 放資料庫匯出或分析成果。
4. 大檔案不進 Git，資料夾用 `.gitkeep` 保留。
5. 新資料源要補三件事：資料夾位置、轉檔或匯入腳本、對應 schema 說明。
