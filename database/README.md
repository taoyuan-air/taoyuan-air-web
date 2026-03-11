# 資料庫結構說明

## 📁 檔案結構

```
database/
├── init.sql                    # 主系統初始化（多資料源架構）
├── epa_stations_schema.sql     # EPA 完整資料庫結構（推薦使用）
├── epa_queries.sql            # EPA 常用查詢
└── test_data.sql              # 測試資料
```

## 🗄️ 主要資料表

### EPA 相關表格

#### 1. `epa_stations` - 測站基本資料
- **用途：** 儲存桃園市 5 個 EPA 測站的基本資訊
- **主鍵：** `station_id`
- **包含：** 測站名稱、座標、地址等

#### 2. `epa_hourly_data` - 空氣品質小時值（分區表）
- **用途：** 儲存 2019-2026 年的空氣品質監測資料
- **分區方式：** 按月份分區（88 個分區表）
- **資料量：** 約 200 萬筆記錄
- **分區命名：** `epa_hourly_data_YYYY_MM`

### 分區表詳細資訊

| 年份 | 分區數量 | 命名範例 | 資料範圍 |
|------|----------|----------|----------|
| 2019 | 12 | `epa_hourly_data_2019_01` | 2019-01-01 到 2019-12-31 |
| 2020 | 12 | `epa_hourly_data_2020_01` | 2020-01-01 到 2020-12-31 |
| 2021 | 12 | `epa_hourly_data_2021_01` | 2021-01-01 到 2021-12-31 |
| 2022 | 12 | `epa_hourly_data_2022_01` | 2022-01-01 到 2022-12-31 |
| 2023 | 12 | `epa_hourly_data_2023_01` | 2023-01-01 到 2023-12-31 |
| 2024 | 12 | `epa_hourly_data_2024_01` | 2024-01-01 到 2024-12-31 |
| 2025 | 12 | `epa_hourly_data_2025_01` | 2025-01-01 到 2025-12-31 |
| 2026 | 3 | `epa_hourly_data_2026_01` | 2026-01-01 到 2026-03-31 |

## 📊 視圖和函數

### 視圖

1. **`epa_latest_data`** - 最近 24 小時資料彙總
2. **`epa_monthly_stats`** - 月度統計資料

### 函數

1. **`check_epa_data_quality()`** - 資料品質檢查

## 🔧 使用方式

### 初始化資料庫

```bash
# 方法 1: 使用完整 EPA 結構（推薦）
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/epa_stations_schema.sql

# 方法 2: 使用主系統結構
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/init.sql
```

### 常用查詢

```sql
-- 查詢最新資料
SELECT * FROM epa_latest_data;

-- 查詢特定測站 2024 年資料
SELECT * FROM epa_hourly_data 
WHERE station_id = '17' 
AND monitor_date >= '2024-01-01' 
AND monitor_date < '2025-01-01';

-- 檢查資料品質
SELECT * FROM check_epa_data_quality();

-- 查詢月度統計
SELECT * FROM epa_monthly_stats 
WHERE station_id = '17' 
AND month >= '2024-01-01';
```

## 📈 效能優化

### 分區表優勢
- **查詢效能：** 按時間範圍查詢時只掃描相關分區
- **維護便利：** 可以獨立維護各個分區
- **儲存優化：** 舊資料可以單獨壓縮或歸檔

### 索引策略
- `station_id` - 測站查詢
- `monitor_date` - 時間範圍查詢
- `pollutant_eng_name` - 污染物查詢
- `(station_id, monitor_date)` - 複合查詢
- `data_quality` - 資料品質篩選

## 🔄 資料匯入

使用 `scripts/import_epa_stations.py` 匯入 EPA 資料：

```bash
python scripts/import_epa_stations.py
```

## ⚠️ 注意事項

1. **棄用檔案：** 無
2. **分區擴展：** 需要新增年份時，在 `epa_stations_schema.sql` 中添加對應分區
3. **資料一致性：** 使用 `check_epa_data_quality()` 定期檢查資料品質
4. **備份策略：** 分區表可以按月份進行增量備份

## 🚀 未來擴展

- 支援更多測站（中壢站等）
- 增加即時資料 API 介面
- 實作自動分區管理
- 增加資料視覺化視圖