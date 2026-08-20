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
├── cwa-stations/          # 氣象署（Package_24780/24781/24937）
├── tydep-stations/        # 桃園市環保局 Excel（108–115 年）
├── UAV/                   # 無人機垂直剖面 txt
│                          # 檔名：UAV_V1_L3_gas_YYYYMMDD_HHMM_Aeromount(V4)_Guanyin.txt
├── WindLidar/             # 都卜勒風光達日檔
│                          # 檔名：DWL_V1_L1_UVW_YYYYMMDD_L02240328_Guanyin.txt
├── teds-point/            # TEDS 點源
├── MPL/                   # 預留
└── NAQO/                  # 預留
```

## 檔名格式說明

### WindLidar
```
DWL_V1_L1_UVW_20260330_L02240328_Guanyin.txt
 │   │  │  │      │        │        └─ 測站
 │   │  │  │      │        └─ 儀器序號
 │   │  │  │      └─ 觀測日期（YYYYMMDD）
 │   │  │  └─ 量測參數（水平垂直風）
 │   │  └─ 等級1資料
 │   └─ 版本1
 └─ 都卜勒風光達
```

### UAV
```
UAV_V1_L3_gas_20260330_0025_Aeromount(V4)_Guanyin.txt
 │   │  │   │     │      │       │            └─ 測站
 │   │  │   │     │      │       └─ 儀器版本
 │   │  │   │     │      └─ 起飛時間（HHMM）
 │   │  │   │     └─ 觀測日期（YYYYMMDD）
 │   │  │   └─ 量測主要參數
 │   │  └─ 資料級別 L3
 │   └─ 反演版本1
 └─ 儀器
```

## 匯入腳本對照

| 資料源 | 腳本 | 備註 |
| --- | --- | --- |
| MOE | `scripts/import_moe_stations.py` | 月更新：`update_moe_monthly.py` |
| CWA | `scripts/import_cwa_stations.py` | 月更新：`update_cwa_monthly.py` |
| TYDEP | `scripts/convert_tydep_xlsx.py` → `scripts/import_tydep_stations.py` | 需先轉檔 |
| UAV | `scripts/import_uav.py` | 自動解析檔案 metadata header |
| WindLidar | `scripts/import_wind_lidar.py` | 自動從檔名解析 station_id |
| TEDS | `scripts/import_teds_point.py` | — |

## 匯入前置作業

1. 確認 Docker 容器已啟動：`docker-compose up -d postgres`
2. 確認 `.env` 已設定 `POSTGRES_PASSWORD`
3. 將原始資料放入 `data/raw/<資料源>/` 對應路徑
4. 執行對應的 schema SQL 建表
5. 執行匯入腳本
