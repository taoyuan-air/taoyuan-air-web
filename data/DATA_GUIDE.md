# 資料目錄結構說明

| 目錄 | 用途 |
| --- | --- |
| `data/raw/` | 外部來源原始資料，不手改 |
| `data/processed/` | 轉檔/正規化後的中間資料，可由腳本重建 |
| `data/exports/` | 資料庫匯出、成果或備份 |

```text
外部來源 → data/raw → data/processed → PostgreSQL → data/exports
```

CWA、MOE、TYDEP、WindLidar 的桃園過濾資料（2025 年起）已 tracked 在 Git。
原始完整資料（7 GB+）另存雲端；其他來源（TEDS、MPL 等）以 `.gitkeep` 保留資料夾。

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
├── WindLidar/             # 風光達 TMA_328 日檔
├── teds-point/            # TEDS 點源（.gitkeep）
├── MPL/                   # 預留（.gitkeep）
└── NAQO/                  # 預留（.gitkeep）
```

## 匯入腳本對照

| 資料源 | 腳本 |
| --- | --- |
| MOE | `scripts/import_moe_stations.py`（月更新：`update_moe_monthly.py`） |
| CWA | `scripts/import_cwa_stations.py`（月更新：`update_cwa_monthly.py`） |
| TYDEP | `scripts/convert_tydep_xlsx.py` → `scripts/import_tydep_stations.py` |
| UAV | `scripts/import_uav.py` |
| WindLidar | `scripts/import_wind_lidar.py` |
| TEDS | `scripts/import_teds_point.py` |

TYDEP 需先轉檔產生 `data/processed/tydep-stations/json/` 再匯入。
