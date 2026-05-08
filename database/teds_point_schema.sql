-- ============================================================
-- TEDS 煙囪排放源資料庫架構 (無分區)
-- 專門用於儲存環保署 TEDS 點源排放清冊資料
-- 系統：桃園 3D Geo-AI 大氣品質預測系統
-- 建立日期：2026
-- 資料版本：TEDS12 (2021發布資料)
-- ============================================================

-- 0. 啟用必要的 PostgreSQL 擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- 1. 建立 TEDS 排放源（煙囪）基本資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_stations (
    station_id      SERIAL PRIMARY KEY,                     -- 自動序號主鍵
    serial_no       INTEGER,                                -- TEDS 原始序號 (SERIAL_NO)
    c_no            VARCHAR(10),                            -- 管制編號 (C_NO)
    comp_nam        VARCHAR(100),                           -- 工廠名稱 (COMP_NAM)
    comp_kind1      VARCHAR(10),                            -- 行業別代碼 (COMP_KIND1)
    location        GEOMETRY(Point, 4326),                  -- PostGIS 空間幾何欄位
    latitude        DECIMAL(10, 7),                         -- 緯度 WGS84 (WGS84_N)
    longitude       DECIMAL(10, 7),                         -- 經度 WGS84 (WGS84_E)
    stack_height    DECIMAL(7, 1),                          -- 煙囪高度 m (HEI)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_serial_no UNIQUE (serial_no)
);

COMMENT ON TABLE  teds_stations              IS 'TEDS 點源排放口（煙囪）基本資料';
COMMENT ON COLUMN teds_stations.c_no         IS '管制編號 C_NO，對應環保署許可管制系統';
COMMENT ON COLUMN teds_stations.comp_nam     IS '工廠名稱 COMP_NAM';
COMMENT ON COLUMN teds_stations.comp_kind1   IS '行業別代碼 COMP_KIND1';
COMMENT ON COLUMN teds_stations.stack_height IS '煙囪高度 m，來源欄位 HEI';
-- ============================================================
-- 2. 建立 TEDS 污染物排放量定義表（對應 CWA cwa_observations）
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_observations (
    observation_id      VARCHAR(10) PRIMARY KEY,            -- 污染物代碼（如 TSP、PM25）
    observation_name    VARCHAR(50) NOT NULL,               -- 污染物中文名稱
    unit                VARCHAR(20),                        -- 排放量單位
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE  teds_observations                IS 'TEDS 污染物排放量項目定義表';
COMMENT ON COLUMN teds_observations.observation_id   IS '污染物代碼（TSP/PM/PM25/SOX/NOX/THC/NMHC/CO/PB）';
COMMENT ON COLUMN teds_observations.unit             IS '排放量單位，TEDS 均為公噸/年';

-- 插入 9 種污染物定義
INSERT INTO teds_observations (observation_id, observation_name, unit) VALUES
('TSP',  '總懸浮微粒',           '公噸/年'),
('PM10', '懸浮微粒 PM10',      '公噸/年'),
('PM25', '細懸浮微粒 PM2.5',     '公噸/年'),
('SOX',  '硫氧化物',             '公噸/年'),
('NOX',  '氮氧化物',             '公噸/年'),
('THC',  '總碳氫化合物',         '公噸/年'),
('NMHC', '非甲烷碳氫化合物',     '公噸/年'),
('CO',   '一氧化碳',             '公噸/年'),
('PB',   '鉛及其化合物',         '公噸/年')
ON CONFLICT (observation_id) DO UPDATE SET
    observation_name = EXCLUDED.observation_name,
    unit             = EXCLUDED.unit,
    updated_at       = NOW();

-- ============================================================
-- 3. -- 建立 TEDS 排放量資料表（單一表，不分區）
-- ============================================================
CREATE TABLE IF NOT EXISTS teds_emission_data (
    id                  BIGSERIAL PRIMARY KEY,
    station_id          INTEGER NOT NULL,                   -- 關聯 teds_stations.station_id
    observation_id      VARCHAR(10) NOT NULL,               -- 關聯 teds_observations.observation_id
    emission_value      DECIMAL(12, 3),                     -- 排放量數值（公噸/年），NULL 表示缺值
    data_quality        VARCHAR(10) DEFAULT 'good',         -- 資料品質標記 (good / invalid)
    created_at          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (station_id)    REFERENCES teds_stations(station_id),
    FOREIGN KEY (observation_id) REFERENCES teds_observations(observation_id),
    CONSTRAINT unique_station_observation UNIQUE (station_id, observation_id)
) ;

COMMENT ON TABLE teds_emission_data IS 'TEDS 點源年排放量資料';
COMMENT ON COLUMN teds_emission_data.emission_value IS '年排放量（公噸/年），缺值填補為 0，原始空白為 NULL';
COMMENT ON COLUMN teds_emission_data.data_quality   IS '資料品質標記：good=有效值，invalid=缺值或異常';

-- ============================================================
-- 4. 建立索引
-- ============================================================
-- 空間索引：加速半徑查詢、GIS 疊加分析
CREATE INDEX IF NOT EXISTS idx_teds_stations_location   ON teds_stations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_teds_stations_c_no        ON teds_stations(c_no);
CREATE INDEX IF NOT EXISTS idx_teds_emission_station    ON teds_emission_data(station_id);
CREATE INDEX IF NOT EXISTS idx_teds_emission_obs        ON teds_emission_data(observation_id);
CREATE INDEX IF NOT EXISTS idx_teds_emission_quality    ON teds_emission_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_teds_emission_sta_obs    ON teds_emission_data(station_id, observation_id);

-- ============================================================
-- 5. 建立彙總視圖
-- ============================================================
CREATE OR REPLACE VIEW teds_latest_data AS
SELECT
    s.station_id,
    s.c_no,                                               
    s.comp_nam,
    s.latitude,
    s.longitude,
    s.stack_height,
    MAX(CASE WHEN e.observation_id = 'TSP'  THEN e.emission_value END) AS tsp_emi,
    MAX(CASE WHEN e.observation_id = 'PM10'  THEN e.emission_value END) AS pm10_emi,
    MAX(CASE WHEN e.observation_id = 'PM25' THEN e.emission_value END) AS pm25_emi,
    MAX(CASE WHEN e.observation_id = 'SOX'  THEN e.emission_value END) AS sox_emi,
    MAX(CASE WHEN e.observation_id = 'NOX'  THEN e.emission_value END) AS nox_emi,
    MAX(CASE WHEN e.observation_id = 'THC'  THEN e.emission_value END) AS thc_emi,
    MAX(CASE WHEN e.observation_id = 'NMHC' THEN e.emission_value END) AS nmhc_emi,
    MAX(CASE WHEN e.observation_id = 'CO'   THEN e.emission_value END) AS co_emi,
    MAX(CASE WHEN e.observation_id = 'PB'   THEN e.emission_value END) AS pb_emi
FROM teds_stations s
LEFT JOIN teds_emission_data e ON s.station_id = e.station_id
GROUP BY
    s.station_id, s.c_no, s.comp_nam, s.latitude, s.longitude, s.stack_height;

COMMENT ON VIEW teds_latest_data IS 'TEDS 排放源寬表視圖：將 9 種污染物 Pivot 為欄位，方便空間分析與預測模型使用';

-- ============================================================
-- 6. 建立 PostGIS 空間欄位更新（匯入後執行）
-- ============================================================
-- 執行 Python 腳本匯入後，再執行此語句補齊 location 幾何欄位：
UPDATE teds_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL AND longitude IS NOT NULL AND latitude IS NOT NULL;
