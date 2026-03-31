-- EPA 測站資料庫完整架構
-- 專門用於儲存環保署空氣品質測站的歷史和即時資料
-- 建立日期: 2024
-- 資料範圍: 2019-2026年

-- 0. 啟用必要的 PostgreSQL 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 1. 建立 EPA 測站基本資料表
CREATE TABLE IF NOT EXISTS epa_stations (
    station_id VARCHAR(20) PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    county VARCHAR(50) NOT NULL,
    location GEOMETRY(Point, 4326),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 建立 EPA 污染物種類表（V2 三層架構）
CREATE TABLE IF NOT EXISTS epa_pollutants (
    pollutant_id VARCHAR(10) PRIMARY KEY,
    pollutant_name VARCHAR(50) NOT NULL,
    pollutant_eng_name VARCHAR(50) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    aggregation_type VARCHAR(20) NOT NULL DEFAULT '1hr_mean',
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 建立 EPA 空氣品質小時值資料表（分區表）
CREATE TABLE IF NOT EXISTS epa_hourly_data (
    id BIGSERIAL,
    station_id VARCHAR(20) NOT NULL,
    monitor_date TIMESTAMP NOT NULL,
    pollutant_id VARCHAR(10) NOT NULL,
    pollutant_name VARCHAR(50) NOT NULL,
    pollutant_eng_name VARCHAR(50) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    concentration VARCHAR(20),
    concentration_numeric DECIMAL(10, 4),
    data_quality VARCHAR(10) DEFAULT 'good',
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    source VARCHAR(20) DEFAULT 'history',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),                                    -- 複合主鍵：序列ID + 分區鍵
    FOREIGN KEY (station_id) REFERENCES epa_stations(station_id),      -- 外鍵約束：關聯測站表
    FOREIGN KEY (pollutant_id) REFERENCES epa_pollutants(pollutant_id),-- 外鍵約束：關聯污染物表
    UNIQUE (station_id, monitor_date, pollutant_id)                    -- 唯一約束：防止同測站同時間同污染物重複記錄
) PARTITION BY RANGE (monitor_date);

-- 3-1. 舊版資料庫升級：補齊 V2 欄位（重複執行安全）
ALTER TABLE IF EXISTS epa_hourly_data
    ADD COLUMN IF NOT EXISTS period_start TIMESTAMP,
    ADD COLUMN IF NOT EXISTS period_end TIMESTAMP,
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'history';

UPDATE epa_hourly_data
SET source = 'history'
WHERE source IS NULL;

-- 4. 建立完整分區表（2019-2026年，按月份）

-- 2019年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-01-01') TO ('2019-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-02-01') TO ('2019-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-03-01') TO ('2019-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-04-01') TO ('2019-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-05-01') TO ('2019-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-06-01') TO ('2019-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-07-01') TO ('2019-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-08-01') TO ('2019-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-09-01') TO ('2019-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-10-01') TO ('2019-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-11-01') TO ('2019-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2019_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2019-12-01') TO ('2020-01-01');

-- 2020年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-01-01') TO ('2020-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-02-01') TO ('2020-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-03-01') TO ('2020-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-04-01') TO ('2020-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-05-01') TO ('2020-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-06-01') TO ('2020-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-07-01') TO ('2020-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-08-01') TO ('2020-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-09-01') TO ('2020-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-10-01') TO ('2020-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-11-01') TO ('2020-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2020_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2020-12-01') TO ('2021-01-01');

-- 2021年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-01-01') TO ('2021-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-02-01') TO ('2021-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-03-01') TO ('2021-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-04-01') TO ('2021-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-05-01') TO ('2021-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-06-01') TO ('2021-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-07-01') TO ('2021-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-08-01') TO ('2021-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-09-01') TO ('2021-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-10-01') TO ('2021-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-11-01') TO ('2021-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2021_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2021-12-01') TO ('2022-01-01');

-- 2022年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-01-01') TO ('2022-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-02-01') TO ('2022-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-03-01') TO ('2022-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-04-01') TO ('2022-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-05-01') TO ('2022-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-06-01') TO ('2022-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-07-01') TO ('2022-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-08-01') TO ('2022-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-09-01') TO ('2022-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-10-01') TO ('2022-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-11-01') TO ('2022-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2022_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2022-12-01') TO ('2023-01-01');

-- 2023年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-01-01') TO ('2023-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-02-01') TO ('2023-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-03-01') TO ('2023-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-04-01') TO ('2023-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-05-01') TO ('2023-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-06-01') TO ('2023-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-07-01') TO ('2023-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-08-01') TO ('2023-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-09-01') TO ('2023-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-10-01') TO ('2023-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-11-01') TO ('2023-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2023_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2023-12-01') TO ('2024-01-01');

-- 2024年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2024_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_04 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_05 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_06 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_07 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_08 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_09 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_10 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_11 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2025_12 PARTITION OF epa_hourly_data FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026年分區
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_01 PARTITION OF epa_hourly_data FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_02 PARTITION OF epa_hourly_data FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_03 PARTITION OF epa_hourly_data FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 5. 建立索引
CREATE INDEX IF NOT EXISTS idx_epa_hourly_station ON epa_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_date ON epa_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_pollutant ON epa_hourly_data(pollutant_eng_name);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_station_date ON epa_hourly_data(station_id, monitor_date);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_quality ON epa_hourly_data(data_quality);

-- 6. 建立彙總視圖（方便查詢）
CREATE OR REPLACE VIEW epa_latest_data AS
SELECT 
    s.station_id,
    s.station_name,
    s.county,
    h.monitor_date,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM2.5' THEN h.concentration_numeric END) as pm25,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM10' THEN h.concentration_numeric END) as pm10,
    MAX(CASE WHEN h.pollutant_eng_name = 'O3' THEN h.concentration_numeric END) as o3,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO' THEN h.concentration_numeric END) as co,
    MAX(CASE WHEN h.pollutant_eng_name = 'SO2' THEN h.concentration_numeric END) as so2,
    MAX(CASE WHEN h.pollutant_eng_name = 'NO2' THEN h.concentration_numeric END) as no2
FROM epa_stations s
JOIN epa_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
GROUP BY s.station_id, s.station_name, s.county, h.monitor_date
ORDER BY h.monitor_date DESC;

-- 7. 建立月度統計視圖
CREATE OR REPLACE VIEW epa_monthly_stats AS
SELECT 
    s.station_id,
    s.station_name,
    DATE_TRUNC('month', h.monitor_date) as month,
    h.pollutant_eng_name,
    COUNT(*) as record_count,
    AVG(h.concentration_numeric) as avg_concentration,
    MIN(h.concentration_numeric) as min_concentration,
    MAX(h.concentration_numeric) as max_concentration,
    STDDEV(h.concentration_numeric) as std_concentration
FROM epa_stations s
JOIN epa_hourly_data h ON s.station_id = h.station_id
WHERE h.concentration_numeric IS NOT NULL
GROUP BY s.station_id, s.station_name, DATE_TRUNC('month', h.monitor_date), h.pollutant_eng_name
ORDER BY month DESC, s.station_id, h.pollutant_eng_name;

-- 8. 插入桃園市 5 個測站基本資料
INSERT INTO epa_stations (station_id, station_name, county, latitude, longitude, address) VALUES
('17', '桃園', '桃園市', 24.9936, 121.3010, '桃園區'),
('18', '大園', '桃園市', 25.0608, 121.2000, '大園區'),
('19', '觀音', '桃園市', 25.0354, 121.0820, '觀音區'),
('20', '平鎮', '桃園市', 24.9533, 121.2039, '平鎮區'),
('21', '龍潭', '桃園市', 24.8633, 121.2164, '龍潭區')
-- ('22', '中壢', '桃園市', 24.9536, 121.2256, '中壢區')  -- 資料尚未取得
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- 9. 插入 EPA 污染物種類資料（V2）
INSERT INTO epa_pollutants
    (pollutant_id, pollutant_name, pollutant_eng_name, unit, aggregation_type, description)
VALUES
    ('1',  '二氧化硫',   'SO2',   'ppb',   '1hr_mean', NULL),
    ('2',  '一氧化碳',   'CO',    'ppm',   '1hr_mean', NULL),
    ('3',  '臭氧',       'O3',    'ppb',   '1hr_mean', NULL),
    ('7',  '二氧化氮',   'NO2',   'ppb',   '1hr_mean', NULL),
    ('4',  '懸浮微粒',   'PM10',  'μg/m³', '1hr_mean', NULL),
    ('33', '細懸浮微粒', 'PM2.5', 'μg/m³', '1hr_mean', NULL)
ON CONFLICT (pollutant_id) DO UPDATE SET
    pollutant_name = EXCLUDED.pollutant_name,
    pollutant_eng_name = EXCLUDED.pollutant_eng_name,
    unit = EXCLUDED.unit,
    aggregation_type = EXCLUDED.aggregation_type,
    description = EXCLUDED.description;

-- 10. 更新 location 欄位（PostGIS 幾何）
UPDATE epa_stations 
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL;

-- 11. 建立資料品質檢查函數
CREATE OR REPLACE FUNCTION check_epa_data_quality()
RETURNS TABLE(
    station_id VARCHAR(20),
    station_name VARCHAR(100),
    total_records BIGINT,
    valid_records BIGINT,
    invalid_records BIGINT,
    data_quality_ratio NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.station_id,
        s.station_name,
        COUNT(h.station_id) as total_records,                           -- 實際資料記錄數（忽略 NULL 值）
        COUNT(CASE WHEN h.data_quality = 'good' THEN 1 END) as valid_records,
        COUNT(CASE WHEN h.data_quality = 'invalid' THEN 1 END) as invalid_records,
        ROUND(
            CASE 
                WHEN COUNT(h.station_id) = 0 THEN 0                     -- 無資料時回傳 0%
                ELSE COUNT(CASE WHEN h.data_quality = 'good' THEN 1 END)::NUMERIC 
                     / NULLIF(COUNT(h.station_id), 0)::NUMERIC * 100    -- 防止除零錯誤
            END,
            2
        ) as data_quality_ratio
    FROM epa_stations s
    LEFT JOIN epa_hourly_data h ON s.station_id = h.station_id
    GROUP BY s.station_id, s.station_name
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;

-- 註解
COMMENT ON TABLE epa_stations IS 'EPA 空氣品質測站基本資料';
COMMENT ON TABLE epa_pollutants IS 'EPA 污染物種類與量測設定';
COMMENT ON TABLE epa_hourly_data IS 'EPA 空氣品質小時值資料（分區表，2019-2026年）';
COMMENT ON VIEW epa_latest_data IS '最近24小時的空氣品質資料彙總';
COMMENT ON VIEW epa_monthly_stats IS 'EPA 測站月度統計資料';
COMMENT ON FUNCTION check_epa_data_quality() IS '檢查 EPA 資料品質統計';