# Database 目錄說明

此目錄保留資料庫 schema 與 SQL 查詢範例。正式建表請使用各資料源獨立 schema，不再使用舊版通用 `init.sql`。

## 正式 Schema

| 檔案 | 資料源 | 用途 |
| --- | --- | --- |
| `moe_stations_schema.sql` | MOE 環境部測站 | 空氣品質測站與小時值資料 |
| `cwa_stations_schema.sql` | CWA 氣象署測站 | 氣象測站與小時觀測資料 |
| `tydep_stations_schema.sql` | TYDEP 桃園市環保局 | 桃園市環保局測站與小時值資料 |
| `teds_point_schema.sql` | TEDS 點源 | 排放源位置與年排放量資料 |
| `uav_schema.sql` | UAV 無人機 | 無人機垂直剖面資料 |
| `wind_lidar_schema.sql` | WindLidar 風光達 | 風光達垂直風場資料 |
| `auth_schema.sql` | 登入系統使用者資料表 |

## 查詢範例

查詢範例放在 `database/examples/`，不屬於建表流程。

```text
database/examples/
├── cwa_queries.sql
├── moe_queries.sql
└── teds_point_queries.sql
```

## 分區與更新流程

| 資料源 | 分區策略 | 自動建立位置 | 補正或更新流程 |
| --- | --- | --- | --- |
| MOE | 依 `monitor_date` 月分區 | `scripts/import_moe_stations.py` | `scripts/update_moe_monthly.py` 以 history 覆蓋 realtime |
| CWA | 依 `monitor_date` 月分區 | `scripts/import_cwa_stations.py` | `scripts/update_cwa_monthly.py` 以 history 覆蓋 realtime |
| TYDEP | 依 `monitor_date` 月分區 | `scripts/import_tydep_stations.py` | 目前以歷史資料批次匯入為主 |
| UAV | 依 `flight_id` LIST 分區 | `scripts/import_uav.py` | 每個飛行任務自動補一個分區 |
| WindLidar | 依 `measure_time` 日分區 | `scripts/import_wind_lidar.py` | 每日資料匯入時自動補日分區 |

## 已移除舊檔

| 舊檔 | 移除原因 |
| --- | --- |
| `init.sql` | 舊版通用 schema，已被各資料源獨立 schema 取代 |
| `test_data.sql` | 舊版 `init.sql` 的測試資料，與目前資料表不一致 |

## 建議建置順序

依需要執行單一資料源 schema：

```bash
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/moe_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/cwa_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/tydep_stations_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/teds_point_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/uav_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/wind_lidar_schema.sql
docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air < database/auth_schema.sql
```
