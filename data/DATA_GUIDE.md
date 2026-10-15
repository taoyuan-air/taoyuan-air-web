# 資料目錄結構說明

| 目錄 | 用途 |
| --- | --- |
| `data/raw/` | 外部來源原始資料，不手改 |
| `data/processed/` | 轉檔/正規化後的中間資料，可由腳本重建 |
| `data/exports/` | 資料庫匯出、成果或備份 |

```text
外部來源 → data/raw → data/processed → PostgreSQL → data/exports
```

## Raw Data 管理策略

所有原始資料檔案（txt / csv / xlsx / json）**不納入 Git 版控**，僅保留資料夾結構（`.gitkeep`）。
原始資料請自行放入對應資料夾後執行匯入腳本。

理由：
- 原始檔案體積大（WindLidar 每日約 10 萬行），不適合放在 Git 歷史
- 資料和程式碼分離，降低 repo 體積
- import 腳本找不到檔案只會印錯誤訊息並退出，不影響其他功能

## Raw 資料結構

```text
data/raw/
├── moe-stations/          # 環境部 6 站（桃園/大園/觀音/平鎮/龍潭/中壢）
│   ├── AQX_P_205_Resource/
│   ├── AQX_P_206_Resource/
│   ├── AQX_P_207_Resource/
│   ├── AQX_P_208_Resource/
│   ├── AQX_P_209_Resource/
│   └── AQX_P_255_Resource/
│
├── cwa-stations/          # 氣象署（Package_24780/24781/24937）
│   ├── Package_24780/
│   ├── Package_24781/
│   └── Package_24937/
│
├── tydep-stations/        # 桃園市環保局 Excel（108–115 年）
│   └── 桃園市空氣品質測站監測數據(108-115).xlsx
│
├── teds-point/            # TEDS 點源（TEDS12_POINT_WGS84.csv）
│
├── teds-grid/             # TEDS 網格源（TEDS12.0_total_emission_WGS84.csv）
│
├── exam-point/            # 固定污染源戴奧辛/重金屬/氯化氫排放檢測
│   └── 桃園市固定污染源戴奧辛、重金屬（鉛、鎘、汞）及氯化氫排放檢測資料.csv
│
├── UAV/                   # 無人機垂直剖面 txt（舊版 L3；新版 L2 直接從 SFTP 讀）
│                          # 檔名：UAV_L2_{gas|met}_YYYYMMDD_HHMM_AMV4_Guanyin_V1.txt
│
├── WindLidar/             # 都卜勒風光達日檔（新版直接從 SFTP 讀）
│                          # 檔名：DWL_L1_UVW_YYYYMMDD_L02240328_Guanyin_V1.txt
│
├── MPL/                   # 預留
└── NAQO/                  # 預留
```

## Processed 資料結構

```text
data/processed/
└── tydep-stations/
    └── json/              # 各測站 JSON 檔（由 convert_tydep_xlsx.py 產生）
        ├── <station_id>/
        └── stations_meta.json
```

## 檔名格式說明

統一規則（2026-10）：`儀器_資料級別_量測主要參數_觀測起始年月日_儀器版本_測站_反演版本`
大氣系資料經 SFTP（`/data/sftp_root/uploads/<儀器>/<測站>/<級別>/<年>/`）上傳。匯入程式新舊檔名皆支援。

### WindLidar
```
DWL_L1_UVW_20260811_L02240328_Guanyin_V1.txt
 │   │  │      │        │        │     └─ 反演版本
 │   │  │      │        │        └─ 測站
 │   │  │      │        └─ 儀器序號
 │   │  │      └─ 觀測日期（YYYYMMDD，UTC）
 │   │  └─ 量測參數（水平垂直風）
 │   └─ 資料級別 L1
 └─ 都卜勒風光達
```
舊檔名（Google 雲端，2026-04）：`DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt`。檔案內容格式相同（tab 分隔）。

### UAV
```
UAV_L2_gas_20260330_1647_AMV4_Guanyin_V1.txt
UAV_L2_met_20260330_1647_AMV4_Guanyin_V1.txt
 │   │   │      │      │    │     │     └─ 反演版本
 │   │   │      │      │    │     └─ 測站
 │   │   │      │      │    └─ 儀器版本（Aeromount V4）
 │   │   │      │      └─ 起飛時間（HHMM）
 │   │   │      └─ 觀測日期（YYYYMMDD）
 │   │   └─ 量測主要參數：gas（O3/CO/CO2/SO2/NO2/NH3/H2S/TVOC）、met（P/T/RH/PM/風/位溫等）
 │   └─ 資料級別 L2
 └─ 儀器
```
- 同一趟飛行拆成 gas、met 兩檔，`import_uav.py` 依檔名的 `YYYYMMDD_HHMM` 合併為同一個 `flight_id`
- 檔頭 key 首字大寫（`Max_agl: 300 m`、`Elevation: 17 m`），程式不分大小寫並去除單位
- 舊檔名（Google 雲端，L3 單檔）：`UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt`；同一趟若新舊並存，只採用新格式

## 匯入腳本對照

| 資料源 | 腳本 | 備註 |
| --- | --- | --- |
| MOE | `scripts/convert_zhongli_wide_csv.py` → `scripts/import_moe_stations.py` | 中壢站需先轉檔；月更新：`update_moe_monthly.py` |
| CWA | `scripts/import_cwa_stations.py` | 月更新：`update_cwa_monthly.py` |
| TYDEP | `scripts/convert_tydep_xlsx.py` → `scripts/import_tydep_stations.py` | 需先轉檔，產出至 `processed/tydep-stations/json/` |
| UAV | `scripts/import_uav.py` | 自動解析檔頭；`--raw-dir /data/sftp_root/uploads/UAV`（遞迴） |
| WindLidar | `scripts/import_wind_lidar.py` | 自動從檔名解析 station_id；`--raw-dir /data/sftp_root/uploads/WindLidar --skip-existing` |
| AOD | `scripts/download_maiac.py` → `scripts/import_maiac_aod.py` | 下載需 `EARTHDATA_TOKEN`；已有 npz 可直接匯入 |
| TEDS 點源 | `scripts/import_teds_point.py` | `--csv data/raw/teds-point/TEDS12_POINT_WGS84.csv` |
| TEDS 網格 | `scripts/import_teds_grid.py` | `--csv data/raw/teds-grid/TEDS12.0_total_emission_WGS84.csv` |
| Exam Point | `scripts/import_exam_point.py` | `raw/exam-point/`（固定源排放檢測） |

## 匯入前置作業

1. 確認 Docker 容器已啟動：`docker-compose up -d postgres`
2. 確認 `.env` 已設定 `POSTGRES_PASSWORD`
3. 將原始資料放入 `data/raw/<資料源>/` 對應路徑
4. 執行對應的 schema SQL 建表
5. 執行匯入腳本
