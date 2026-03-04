-- 桃園市空氣污染監測系統 - 資料庫初始化腳本
-- 建立日期: 2024
-- PostgreSQL 15 + PostGIS 3.3

-- 啟用 PostGIS 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 建立資料來源類型表（新增）
CREATE TABLE IF NOT EXISTS data_source_types (
    source_type_id VARCHAR(20) PRIMARY KEY,
    source_name VARCHAR(100) NOT NULL,
    description TEXT,
    measurement_frequency VARCHAR(50), -- 例如: '每小時', '每5分鐘', '每日'
    data_quality_level VARCHAR(20), -- 例如: 'high', 'medium', 'low'
    created_at TIMESTAMP DEFAULT NOW()
);

-- 建立測站資料表
CREATE TABLE IF NOT EXISTS stations (
    station_id VARCHAR(20) PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    station_type VARCHAR(20) NOT NULL CHECK (station_type IN (
        'EPA',           -- 環保署空品測站
        'CWA',           -- 中央氣象署測站
        'IoT',           -- 微型感測器
        'Lidar',         -- 光達
        'UAV',           -- 無人機
        'WindProfiler', -- 剖風儀
        'GroundSampling', -- 地面採樣
        'Mobile'         -- 移動式監測
    )),
    location GEOMETRY(Point, 4326) NOT NULL,
    district VARCHAR(50),
    address TEXT,
    elevation FLOAT,
    is_active BOOLEAN DEFAULT true,
    operator VARCHAR(100), -- 營運單位（例如：環保署、中央大學、桃園市環保局）
    equipment_model VARCHAR(100), -- 設備型號
    calibration_date DATE, -- 最後校正日期
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 建立即時空品資料表（分區表，擴充版）
CREATE TABLE IF NOT EXISTS realtime_air_quality (
    id SERIAL,
    station_id VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    data_source VARCHAR(20) NOT NULL, -- 新增：資料來源標記
    aqi INTEGER,
    pm25 FLOAT,
    pm10 FLOAT,
    o3 FLOAT,
    co FLOAT,
    so2 FLOAT,
    no2 FLOAT,
    nox FLOAT,
    vocs FLOAT, -- 新增：揮發性有機物
    data_quality_flag VARCHAR(10), -- 新增：資料品質旗標（'good', 'suspect', 'bad'）
    qc_status VARCHAR(20), -- 新增：品質控制狀態
    raw_value JSONB, -- 新增：原始數據（JSON格式）
    PRIMARY KEY (id, timestamp),
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
) PARTITION BY RANGE (timestamp);

-- 建立氣象觀測資料表
CREATE TABLE IF NOT EXISTS weather_observations (
    id SERIAL PRIMARY KEY,
    station_id VARCHAR(20),
    timestamp TIMESTAMP NOT NULL,
    temperature FLOAT,
    humidity FLOAT,
    pressure FLOAT,
    wind_speed FLOAT,
    wind_direction FLOAT,
    rainfall FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 建立網格資料表
CREATE TABLE IF NOT EXISTS grid_cells (
    grid_id VARCHAR(10) PRIMARY KEY,
    geometry GEOMETRY(Polygon, 4326) NOT NULL,
    center_point GEOMETRY(Point, 4326) NOT NULL,
    district VARCHAR(50),
    area_km2 FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 建立網格即時資料表
CREATE TABLE IF NOT EXISTS grid_realtime_data (
    id SERIAL PRIMARY KEY,
    grid_id VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    pollutant VARCHAR(20) NOT NULL,
    value FLOAT NOT NULL,
    interpolation_method VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (grid_id) REFERENCES grid_cells(grid_id)
);

-- 建立空間特徵資料表
CREATE TABLE IF NOT EXISTS spatial_features (
    id SERIAL PRIMARY KEY,
    feature_type VARCHAR(50) NOT NULL,
    name VARCHAR(200),
    geometry GEOMETRY(Geometry, 4326) NOT NULL,
    properties JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 建立垂直剖面資料表（擴充版）
CREATE TABLE IF NOT EXISTS vertical_profiles (
    id SERIAL PRIMARY KEY,
    station_id VARCHAR(20),
    timestamp TIMESTAMP NOT NULL,
    data_source VARCHAR(20) NOT NULL, -- 'Lidar', 'UAV', 'WindProfiler'
    height_m INTEGER NOT NULL,
    backscatter FLOAT, -- 光達後向散射係數
    extinction FLOAT, -- 光達消光係數
    pm25_estimate FLOAT,
    pm10_estimate FLOAT,
    wind_speed FLOAT, -- 剖風儀風速
    wind_direction FLOAT, -- 剖風儀風向
    temperature FLOAT, -- 無人機溫度
    humidity FLOAT, -- 無人機濕度
    data_quality_flag VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_stations_location ON stations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_stations_type ON stations(station_type);
CREATE INDEX IF NOT EXISTS idx_stations_operator ON stations(operator);
CREATE INDEX IF NOT EXISTS idx_realtime_timestamp ON realtime_air_quality(timestamp);
CREATE INDEX IF NOT EXISTS idx_realtime_station ON realtime_air_quality(station_id);
CREATE INDEX IF NOT EXISTS idx_realtime_source ON realtime_air_quality(data_source); -- 新增
CREATE INDEX IF NOT EXISTS idx_weather_timestamp ON weather_observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_grid_geometry ON grid_cells USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_grid_center ON grid_cells USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_grid_data_timestamp ON grid_realtime_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_spatial_geometry ON spatial_features USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_vertical_timestamp ON vertical_profiles(timestamp);
CREATE INDEX IF NOT EXISTS idx_vertical_source ON vertical_profiles(data_source); -- 新增
CREATE INDEX IF NOT EXISTS idx_vertical_height ON vertical_profiles(height_m); -- 新增

-- 建立分區表（最近3個月）
CREATE TABLE IF NOT EXISTS realtime_air_quality_current PARTITION OF realtime_air_quality
    FOR VALUES FROM (CURRENT_DATE - INTERVAL '3 months') TO (MAXVALUE);

-- 插入預設資料來源類型
INSERT INTO data_source_types (source_type_id, source_name, description, measurement_frequency, data_quality_level) VALUES
('EPA', '環保署空品測站', '環境部空氣品質監測網標準測站', '每小時', 'high'),
('CWA', '中央氣象署測站', '中央氣象署自動氣象站', '每10分鐘', 'high'),
('IoT', '微型感測器', '空氣盒子、LASS等微型感測器', '每5分鐘', 'medium'),
('Lidar', '光達', '中央大學光達垂直剖面觀測', '每15分鐘', 'high'),
('UAV', '無人機', '無人機垂直採樣', '不定期', 'medium'),
('WindProfiler', '剖風儀', '風場垂直剖面觀測', '每30分鐘', 'high'),
('GroundSampling', '地面採樣', '人工地面採樣分析', '不定期', 'high'),
('Mobile', '移動式監測', '移動式監測車', '不定期', 'medium')
ON CONFLICT (source_type_id) DO NOTHING;

COMMENT ON TABLE data_source_types IS '資料來源類型定義表';
COMMENT ON TABLE stations IS '監測站點資料表（支援多種資料來源）';
COMMENT ON TABLE realtime_air_quality IS '即時空氣品質資料表（含資料來源標記）';
COMMENT ON TABLE weather_observations IS '氣象觀測資料表';
COMMENT ON TABLE grid_cells IS '3km網格資料表';
COMMENT ON TABLE grid_realtime_data IS '網格即時數據表';
COMMENT ON TABLE spatial_features IS '空間特徵資料表（工業區、POI等）';
COMMENT ON TABLE vertical_profiles IS '垂直剖面資料表（光達、無人機、剖風儀）';
