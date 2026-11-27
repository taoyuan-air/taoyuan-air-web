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

## 資料存放位置（依老師 11/13 列的 6 類）
 
| # | 資料 | 歷史資料 | 即時資料 |
| --- | --- | --- | --- |
| 1 | 環境部空品站 | `data/raw/moe-stations/` | 後端直接呼叫環境部 API |
| 2 | 氣象署 | `data/raw/cwa-stations/` | 後端直接呼叫氣象署 API |
| 3 | 環保局空品站 4 站＋觀音工業區氣象站 4 站 | `data/raw/tydep-stations/` | 環保局 SFTP → watcher → `data/raw/tydep-stations/realtime/` → 每小時匯入 |
| 4 | NAQO 中大空品站 | Supabase 同步到 `naqo_hourly_data` | 後端直接查 Supabase |
| 5 | 排放源（TEDS、特殊排放點源） | `data/raw/teds-point/`、`teds-grid/`、`exam-point/` | —（不更新） |
| 6 | IOP（僅 IOP 期間） | VM 的 `/data/sftp_root/uploads/TYDEP/2026IOP{1,2}/` | —（上傳後手動匯入） |

## data/raw/（第 1、2、3、5 類）

```text
data/raw/
├── moe-stations/          # 1. 環境部 6 站（桃園/大園/觀音/平鎮/龍潭/中壢）
│   ├── AQX_P_205_Resource/
│   ├── AQX_P_206_Resource/
│   ├── AQX_P_207_Resource/
│   ├── AQX_P_208_Resource/
│   ├── AQX_P_209_Resource/
│   └── AQX_P_255_Resource/
│
├── cwa-stations/          # 2. 氣象署（Package_24780/24781/24937）
│   ├── Package_24780/
│   ├── Package_24781/
│   ├── Package_24937/
│   └── json/              # 轉檔後暫存（*.agr_hr.json / *.auto_hr.json / *.cwa_hr.json）      
│       
├── tydep-stations/        # 3. 桃園市環保局 8 站（108–115 年）
│   ├── 桃園市空氣品質測站監測數據(108-115).xlsx
│   ├── json/              # 轉檔後暫存（convert_tydep_xlsx.py 產生）
│   └── realtime/          # 環保局即時 CSV（watcher 從 SFTP 搬入，匯入後歸檔到 imported/YYYY/MM/）
│
├── teds-point/            # 5. TEDS 點源
│   ├── TEDS12_POINT_WGS84.csv
│   └── json/              # 轉檔後暫存（TEDS12_POINT_WGS84.json）
│
├── teds-grid/             # 5. TEDS 網格源
│   └── TEDS12.0_total_emission_WGS84.csv
│
├── teds-stations/         # 5. TEDS 測站暫存
│   └── json/              # grid_temp_TEDS12.0_total_emission_WGS84.json
│
├── exam-point/            # 5. 固定污染源戴奧辛/重金屬/氯化氫排放檢測
│   └── 桃園市固定污染源戴奧辛、重金屬（鉛、鎘、汞）及氯化氫排放檢測資料.csv
│
│
└── aod/                   # （不在 6 類內，待老師確認是否保留）MAIAC 衛星 AOD
    ├── maiac_crop/        # 裁切檔（download_maiac.py 產生，或從雲端取得，約 300 MB）
    │   └── <年>/MCD19A2.AYYYYDDD.h28v06|h29v06.061.*.npz
    └── boundaries/        # 內政部縣市界線（補 aod_grids.county 用）
        └── COUNTY_MOI_1140318.gml
```

### SFTP 上傳資料夾（第 6 類 IOP，依老師的架構）
 
由大氣系經 SFTP 上傳，只保留 IOP 期間（IOP1 3/27–4/03 觀音、IOP2 8/17–8/24 大園）。新檔上傳後手動執行對應的匯入腳本。
 
```text
/data/sftp_root/uploads/
├── NAQO/                          # 預留（NAQO 目前由 Supabase 同步，不經 SFTP）
└── TYDEP/
    ├── 2026IOP1/
    │   ├── UAS/                   # 無人機
    │   ├── LCS/                   # 微型感測器
    │   ├── WindLidar/             # 風光達
    │   ├── miniMPL/               # 微脈衝光達
    │   ├── Aerosol Chemistry/     # 氣膠化學濾紙
    │   ├── VOCs/                  # VOCs 採樣罐
    │   └── Hg/                    # 大氣汞（含 Notes.txt：採樣時間表與標記定義）
    └── 2026IOP2/                  # 同上
```
 
UAS、LCS、Hg、WindLidar 用 `--raw-dir /data/sftp_root/uploads/TYDEP` 會同時讀到 IOP1 和 IOP2；VOCs、氣膠化學請指定到儀器資料夾（見匯入腳本對照）。
本機測試時可把檔案放在任意資料夾，再用 `--raw-dir` 指定。

## Processed 資料結構

```text
data/processed/
└── tydep-stations/
    └── json/              # 各測站 JSON 檔（由 convert_tydep_xlsx.py 產生）
        ├── <station_id>/
        └── stations_meta.json
```

## IOP 檔名格式
 
| 儀器 | 檔名 |
| --- | --- |
| UAS | `UAS_{Aeromount-M4\|POM-1782\|POM-1720}_L2_{gas\|o3}_YYYYMMDD_HHMM_{測站}_V1.txt` |
| LCS | `LCS_AeroboxGas_L2_{測站}_2026IOP{n}_TYDEPproject.txt` |
| WindLidar | `DWL_L02240328_L1_UVW_YYYYMMDD_Guanyin_V1.txt` |
| miniMPL | `MMPL_5009_L1_NRB_YYYYMMDD_Guanyin_V1.nc` |
| Aerosol Chemistry | `AersolChemistry_{PM2p5\|PM1}FilterSample_{測站}_2026IOP{n}_TYDEPproject.xlsx` |
| VOCs | `VOCs_{Trigger\|UAV}CanisterSampling_GC-FID_{測站}_2026IOP{n}_TYDEPproject.xlsx` |
| Hg | `Hg_Sampler_{測站}_2026IOP{n}_TYDEPproject.xlsx` |
 
### WindLidar
```
DWL_L02240328_L1_UVW_20260327_Guanyin_V1.txt
 │      │      │  │      │        │     └─ 反演版本
 │      │      │  │      │        └─ 測站
 │      │      │  │      └─ 觀測日期（YYYYMMDD，UTC）
 │      │      │  └─ 量測參數（水平垂直風）
 │      │      └─ 資料級別 L1
 │      └─ 儀器序號
 └─ 都卜勒風光達
```
- `station_id` 為 `L02240328_Guanyin`；匯入某一天前先刪掉同一天的舊資料再寫入
- 2026/11 依老師指示清除舊資料；舊檔名與舊匯入程式 `import_wind_lidar.py` 已移除

### UAS（無人機）
```
UAS_Aeromount-M4_L2_gas_20260330_1647_Guanyin_V1.txt   # 氣象、PM、氣體（O3 為 NaN）
UAS_POM-1782_L2_o3_20260330_1647_Guanyin_V1.txt        # POM 臭氧儀，只有 O3
 │    │           │   │    │        │     │      └─ 反演版本
 │    │           │   │    │        │     └─ 測站
 │    │           │   │    │        └─ 起飛時間（HHMM）
 │    │           │   │    └─ 觀測日期（YYYYMMDD）
 │    │           │   └─ 量測主要參數：gas / o3
 │    │           └─ 資料級別 L2
 │    └─ 儀器（Aeromount-M4、POM-1782、POM-1720）
 └─ 無人機系統
```
- 目前資料：2026IOP1 觀音 3/30 共 6 趟（POM-1782）、2026IOP2 大園 8/21 共 6 趟（POM-1720）
- 同一趟飛行的兩個儀器檔合併為同一個 `flight_id`（`YYYYMMDD_HHMM`）；O3 以 POM 為準
- `PM2p5` 欄位對應 `PM2.5`；`Max agl: 300 m` 讀為最大離地高度
- 分隔線後的「單位行」與「欄名行」順序不固定（IOP1 單位在上、IOP2 欄名在上），程式以開頭為 `agl` 的那行當欄名
- `-999`（Missing_value）、`-888`（QC_rejected）、`NaN` 不存數值，`data_quality` 分別標 `missing`、`rejected`、`invalid`，剖面圖不會畫出

## 匯入腳本對照
 
| 資料源 | 腳本 | 備註 |
| --- | --- | --- |
| MOE | `scripts/convert_zhongli_wide_csv.py` → `scripts/import_moe_stations.py` | 中壢站需先轉檔；月更新：`update_moe_monthly.py` |
| CWA | `scripts/import_cwa_stations.py` | 月更新：`update_cwa_monthly.py` |
| TYDEP | `scripts/convert_tydep_xlsx.py` → `scripts/import_tydep_stations.py` | 需先轉檔，產出至 `processed/tydep-stations/json/` |
| TYDEP 即時 | `scripts/update_tydep_realtime.py` | 讀 `raw/tydep-stations/realtime/*.csv`，`source=realtime`，不覆蓋 history；每小時排程執行 |
| TEDS 點源 | `scripts/import_teds_point.py` | `--csv data/raw/teds-point/TEDS12_POINT_WGS84.csv` |
| TEDS 網格 | `scripts/import_teds_grid.py` | `--csv data/raw/teds-grid/TEDS12.0_total_emission_WGS84.csv` |
| Exam Point | `scripts/import_exam_point.py` | `raw/exam-point/`（固定源排放檢測） |
| AOD | `scripts/download_maiac.py` → `scripts/import_maiac_aod.py` | 下載需 `EARTHDATA_TOKEN`；已有 npz 可直接匯入 |
| IOP UAS | `scripts/import_iop_uas.py` | 預設讀 `/data/sftp_root/uploads/TYDEP`（遞迴）；`--dry-run` 只解析 |
| IOP WindLidar | `scripts/import_iop_wind_lidar.py` | 預設讀 `/data/sftp_root/uploads/TYDEP/2026IOP{1,2}/WindLidar/`；同一天先刪舊資料再寫入；`--iop IOP1\|IOP2` 只匯一期；`--dry-run` 只列檔案 |
| IOP 微型感測器 | `scripts/import_iop_lcs.py` | `--raw-dir /data/sftp_root/uploads/TYDEP`；逐時 8 項；-999 缺值不匯入、-888 存成 QC |
| IOP 大氣汞 | `scripts/import_iop_hg.py` | `--raw-dir /data/sftp_root/uploads/TYDEP`；採樣時間依程式內 `SCHEDULE_2026` 對應（IOP2 檔案的日期沿用 IOP1） |
| IOP VOCs | `scripts/import_iop_vocs.py` | 每期分開指定：`--raw-dir /data/sftp_root/uploads/TYDEP/2026IOP1/VOCs`（IOP2 同理）；指定整個 `TYDEP` 會讀到其他儀器的 xlsx 而報錯；IOP 以檔名為準 |
| IOP 氣膠化學 | `scripts/import_iop_aerosol.py` | 每期分開指定：`--raw-dir "/data/sftp_root/uploads/TYDEP/2026IOP1/Aerosol Chemistry"`（IOP2 同理，路徑有空格要加引號）；指定整個 `TYDEP` 會讀到其他儀器的 xlsx 而報錯 |
| IOP miniMPL | （建置中） | |
 
每小時排程：`scripts/run_data_imports.sh`（`deploy/systemd/taoyuan-air-data-import.{service,timer}`）只匯入 TYDEP 即時資料。IOP 資料改為上傳後手動執行上表的 IOP 腳本。
 
## 匯入前置作業
 
1. 確認 Docker 容器已啟動：`docker-compose up -d postgres`
2. 確認 `.env` 已設定 `POSTGRES_PASSWORD`
3. 歷史資料放入 `data/raw/<資料源>/`；IOP 資料由 SFTP 上傳到 `/data/sftp_root/uploads/TYDEP/2026IOP{1,2}/`
4. 執行對應的 schema SQL 建表
5. 執行匯入腳本
 