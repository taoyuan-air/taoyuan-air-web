-- ============================================================
-- TEDS 網格化排放量資料庫架構
-- 專門用於儲存 TEDS 網格化 排放清冊資料
-- 系統：桃園 3D Geo-AI 大氣品質預測系統
-- 建立日期：2026
-- ============================================================

-- 0. 啟用必要的 PostgreSQL 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 1. 建立 TEDS 網格中心點定義表
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_grid_points (
    grid_id         SERIAL PRIMARY KEY,                     -- 自動序號主鍵
    location        GEOMETRY(Point, 4326),                  -- PostGIS 空間幾何欄位
    latitude        DECIMAL(10, 7) NOT NULL,                -- 網格中心緯度 (WGS84_N)
    longitude       DECIMAL(10, 7) NOT NULL,                -- 網格中心經度 (WGS84_E)
    created_at      TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_grid_coord UNIQUE (latitude, longitude)
);

COMMENT ON TABLE  teds_grid_points IS 'TEDS 網格中心點基本資料';

-- ============================================================
-- 2. 建立污染物項目定義表
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_observations (
    observation_id      VARCHAR(10) PRIMARY KEY,            -- 污染物代碼
    observation_name    VARCHAR(50) NOT NULL,               -- 中文名稱
    unit                VARCHAR(20),                        -- 單位
    created_at          TIMESTAMP DEFAULT NOW()
);

-- 插入網格資料中出現的 10 種污染物
INSERT INTO teds_observations (observation_id, observation_name, unit) VALUES
('TSP',  '總懸浮微粒',       '公噸/年'),
('PM10', '懸浮微粒 PM10',    '公噸/年'),
('PM25', '細懸浮微粒 PM2.5', '公噸/年'),
('SOX',  '硫氧化物',         '公噸/年'),
('NOX',  '氮氧化物',         '公噸/年'),
('THC',  '總碳氫化合物',     '公噸/年'),
('NMHC', '非甲烷碳氫化合物', '公噸/年'),
('CO',   '一氧化碳',         '公噸/年'),
('PB',   '鉛及其化合物',     '公噸/年'),
('NH3',  '氨',               '公噸/年')
ON CONFLICT (observation_id) DO NOTHING;

-- ============================================================
-- 3. 建立網格排放量資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_grid_emission_data (
    id                  BIGSERIAL PRIMARY KEY,
    grid_id             INTEGER NOT NULL,                   -- 關聯 teds_grid_points
    observation_id      VARCHAR(10) NOT NULL,               -- 關聯 teds_observations
    emission_value      DECIMAL(18, 6),                    
    data_quality        VARCHAR(10) DEFAULT 'good',
    created_at          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (grid_id) REFERENCES teds_grid_points(grid_id),
    FOREIGN KEY (observation_id) REFERENCES teds_observations(observation_id),
    CONSTRAINT unique_grid_observation UNIQUE (grid_id, observation_id)
);

-- ============================================================
-- 4. 建立索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_grid_location    ON teds_grid_points USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_grid_emission_id ON teds_grid_emission_data(grid_id);
CREATE INDEX IF NOT EXISTS idx_grid_obs_id      ON teds_grid_emission_data(observation_id);

-- ============================================================
-- 5. 空間幾何更新函式
-- ============================================================
CREATE OR REPLACE FUNCTION update_grid_geometries()
RETURNS void AS $$
BEGIN
    UPDATE teds_grid_points
    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    WHERE location IS NULL;
END;
$$ LANGUAGE plpgsql;