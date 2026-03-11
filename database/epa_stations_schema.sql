-- EPA 測站資料庫架構
-- 專門用於儲存環保署空氣品質測站的歷史和即時資料

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

-- 2. 建立 EPA 空氣品質小時值資料表（分區表）
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
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),
    FOREIGN KEY (station_id) REFERENCES epa_stations(station_id)
) PARTITION BY RANGE (monitor_date);

-- 3. 建立分區表（按月份）
-- 2026年1月
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_01 PARTITION OF epa_hourly_data
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- 2026年2月
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_02 PARTITION OF epa_hourly_data
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 2026年3月
CREATE TABLE IF NOT EXISTS epa_hourly_data_2026_03 PARTITION OF epa_hourly_data
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 4. 建立索引
CREATE INDEX IF NOT EXISTS idx_epa_hourly_station ON epa_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_date ON epa_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_pollutant ON epa_hourly_data(pollutant_eng_name);
CREATE INDEX IF NOT EXISTS idx_epa_hourly_station_date ON epa_hourly_data(station_id, monitor_date);

-- 5. 建立彙總視圖（方便查詢）
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

-- 6. 插入桃園市 5 個測站基本資料（中壢站資料尚未取得）
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

-- 7. 更新 location 欄位（PostGIS 幾何）
UPDATE epa_stations 
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL;

COMMENT ON TABLE epa_stations IS 'EPA 空氣品質測站基本資料';
COMMENT ON TABLE epa_hourly_data IS 'EPA 空氣品質小時值資料（分區表）';
COMMENT ON VIEW epa_latest_data IS '最近24小時的空氣品質資料彙總';
