-- UAV 無人機大氣垂直剖面資料庫架構
-- 分支: feat/database-UAV
-- 建立日期: 2026-05-26
-- 儀器: Aeromount V2(A009) + POM(1781)
-- 資料範圍: 2026-03-30，共 6 次飛行任務
-- 量測參數: 23 個主要欄位（高度 2 種、氣象 11 種、氣膠 3 種、氣體 7 種）；CO2 為預留欄位
-- 資料流程: txt → 直接匯入 DB
-- 注意: agl 欄位作為 agl_m 層鍵，不另存為參數資料

-- 0. 啟用必要擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 飛行任務基本資料表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uav_flights (
    flight_id         VARCHAR(20)   PRIMARY KEY,       -- 如：20260330_0025
    takeoff_time      TIMESTAMP,                        -- 起飛時間（當地時間，由檔名解析）
    flight_direction  VARCHAR(20)   DEFAULT 'ascending', -- ascending / descending
    data_level        VARCHAR(5)    DEFAULT 'L3',
    data_release_date DATE,
    project_name      VARCHAR(100),
    instrument        VARCHAR(100),
    site_name         VARCHAR(100)  DEFAULT 'Guanyin',
    location          GEOMETRY(Point, 4326),
    latitude          DECIMAL(10, 8) DEFAULT 25.0605,
    longitude         DECIMAL(11, 8) DEFAULT 121.1287,
    ground_altitude_m DECIMAL(7, 1)  DEFAULT 17.0,    -- 地面海拔高度（公尺）
    highest_flight_altitude_m DECIMAL(7, 1),
    average_ascent_rate_ms    DECIMAL(4, 1),
    created_at        TIMESTAMP     DEFAULT NOW(),
    updated_at        TIMESTAMP     DEFAULT NOW()
);

ALTER TABLE IF EXISTS uav_flights
    ADD COLUMN IF NOT EXISTS flight_direction VARCHAR(20),
    ADD COLUMN IF NOT EXISTS data_level VARCHAR(5),
    ADD COLUMN IF NOT EXISTS site_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
    ADD COLUMN IF NOT EXISTS ground_altitude_m DECIMAL(7, 1),
    ADD COLUMN IF NOT EXISTS takeoff_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS data_release_date DATE,
    ADD COLUMN IF NOT EXISTS project_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS instrument VARCHAR(100),
    ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326),
    ADD COLUMN IF NOT EXISTS highest_flight_altitude_m DECIMAL(7, 1),
    ADD COLUMN IF NOT EXISTS average_ascent_rate_ms DECIMAL(4, 1);

ALTER TABLE IF EXISTS uav_flights
    ALTER COLUMN flight_direction SET DEFAULT 'ascending',
    ALTER COLUMN data_level SET DEFAULT 'L3',
    ALTER COLUMN site_name SET DEFAULT 'Guanyin',
    ALTER COLUMN latitude SET DEFAULT 25.0605,
    ALTER COLUMN longitude SET DEFAULT 121.1287,
    ALTER COLUMN ground_altitude_m SET DEFAULT 17.0;

-- 插入 6 次飛行任務
INSERT INTO uav_flights
    (flight_id, takeoff_time, flight_direction, data_level, data_release_date, project_name,
     instrument, site_name, location, latitude, longitude, ground_altitude_m,
     highest_flight_altitude_m, average_ascent_rate_ms)
VALUES
    ('20260330_0025', '2026-03-30 00:25:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8),
    ('20260330_0242', '2026-03-30 02:42:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8),
    ('20260330_1433', '2026-03-30 14:33:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8),
    ('20260330_1517', '2026-03-30 15:17:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8),
    ('20260330_1601', '2026-03-30 16:01:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8),
    ('20260330_1647', '2026-03-30 16:47:00', 'ascending', 'L3', '2026-04-17', '桃園環保局', 'Aeromount V2(A009)+POM(1781)', 'Guanyin', ST_SetSRID(ST_MakePoint(121.1287, 25.0605), 4326), 25.0605, 121.1287, 17.0, 301.0, 2.8)
ON CONFLICT (flight_id) DO UPDATE SET
    takeoff_time              = EXCLUDED.takeoff_time,
    data_release_date         = EXCLUDED.data_release_date,
    project_name              = EXCLUDED.project_name,
    instrument                = EXCLUDED.instrument,
    flight_direction          = EXCLUDED.flight_direction,
    data_level                = EXCLUDED.data_level,
    site_name                 = EXCLUDED.site_name,
    location                  = EXCLUDED.location,
    latitude                  = EXCLUDED.latitude,
    longitude                 = EXCLUDED.longitude,
    ground_altitude_m         = EXCLUDED.ground_altitude_m,
    highest_flight_altitude_m = EXCLUDED.highest_flight_altitude_m,
    average_ascent_rate_ms    = EXCLUDED.average_ascent_rate_ms,
    updated_at                = NOW();

CREATE INDEX IF NOT EXISTS idx_uav_flights_location
    ON uav_flights USING GIST(location);

UPDATE uav_flights
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 量測參數定義表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uav_parameters (
    parameter_id   VARCHAR(20)  PRIMARY KEY,
    parameter_name VARCHAR(100) NOT NULL,
    parameter_eng  VARCHAR(100) NOT NULL,
    unit           VARCHAR(20),
    category       VARCHAR(20),  -- altitude / meteorology / aerosol / gas
    description    TEXT,
    created_at     TIMESTAMP    DEFAULT NOW()
);

ALTER TABLE IF EXISTS uav_parameters
    ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO uav_parameters
    (parameter_id, parameter_name, parameter_eng, unit, category)
VALUES
    -- altitude
    ('agl',    '距地面高度',      'height above ground level',          'm',      'altitude'),
    ('asl',    '海拔高度',        'height above mean sea level',        'm',      'altitude'),
    -- meteorology
    ('P',      '氣壓',            'pressure',                           'hPa',    'meteorology'),
    ('T',      '氣溫',            'temperature',                        '°C',     'meteorology'),
    ('RH',     '相對溼度',        'relative humidity',                  '%',      'meteorology'),
    ('ws',     '風速',            'wind speed',                         'm/s',    'meteorology'),
    ('wd',     '風向',            'wind direction',                     '°',      'meteorology'),
    ('theta',  '位溫',            'potential temperature',               'K',      'meteorology'),
    ('Td',     '露點溫度',        'dew point temperature',               '°C',     'meteorology'),
    ('q',      '比溼',            'specific humidity',                  'g/kg',   'meteorology'),
    ('mixR',   '水氣混合比',      'mixing ratio',                       'g/kg',   'meteorology'),
    ('Tv',     '虛溫',            'virtual temperature',                 'K',      'meteorology'),
    ('thetav', '虛位溫',          'virtual potential temperature',       'K',      'meteorology'),
    -- aerosol
    ('PM1',    'PM1',             'PM1',                                'ug/m^3', 'aerosol'),
    ('PM2.5',  '細懸浮微粒',      'PM2.5',                              'ug/m^3', 'aerosol'),
    ('PM10',   '懸浮微粒',        'PM10',                               'ug/m^3', 'aerosol'),
    -- gas
    ('O3',     '臭氧',            'ozone',                              'ppb',    'gas'),
    ('CO',     '一氧化碳',        'carbon monoxide',                    'ppm',    'gas'),
    ('CO2',    '二氧化碳',        'carbon dioxide',                     'ppm',    'gas'),
    ('SO2',    '二氧化硫',        'sulfur dioxide',                     'ppb',    'gas'),
    ('NO2',    '二氧化氮',        'nitrogen dioxide',                   'ppb',    'gas'),
    ('NH3',    '氨',              'ammonia',                            'ppm',    'gas'),
    ('H2S',    '硫化氫',          'hydrogen sulfide',                   'ppb',    'gas'),
    ('TVOC',   '總揮發性有機物',  'total volatile organic compound',    'ppm',    'gas')
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name = EXCLUDED.parameter_name,
    parameter_eng  = EXCLUDED.parameter_eng,
    unit           = EXCLUDED.unit,
    category       = EXCLUDED.category;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 量測資料表（長表，按 flight_id LIST 分區）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uav_data (
    id           BIGSERIAL,
    flight_id    VARCHAR(20)   NOT NULL,
    agl_m        NUMERIC(8, 2) NOT NULL,          -- 離地高度（垂直剖面層鍵）
    parameter_id VARCHAR(20)   NOT NULL,
    raw_value    VARCHAR(30),                     -- 原始字串值
    value        NUMERIC(12, 4),                  -- 量測數值（NaN → NULL）
    data_quality VARCHAR(10)   DEFAULT 'good',    -- 'good' 或 'invalid'
    created_at   TIMESTAMP     DEFAULT NOW(),
    PRIMARY KEY (id, flight_id),
    FOREIGN KEY (flight_id)    REFERENCES uav_flights(flight_id),
    FOREIGN KEY (parameter_id) REFERENCES uav_parameters(parameter_id),
    UNIQUE (flight_id, agl_m, parameter_id)
) PARTITION BY LIST (flight_id);

-- 每次飛行一個分區
CREATE TABLE IF NOT EXISTS uav_data_20260330_0025 PARTITION OF uav_data FOR VALUES IN ('20260330_0025');
CREATE TABLE IF NOT EXISTS uav_data_20260330_0242 PARTITION OF uav_data FOR VALUES IN ('20260330_0242');
CREATE TABLE IF NOT EXISTS uav_data_20260330_1433 PARTITION OF uav_data FOR VALUES IN ('20260330_1433');
CREATE TABLE IF NOT EXISTS uav_data_20260330_1517 PARTITION OF uav_data FOR VALUES IN ('20260330_1517');
CREATE TABLE IF NOT EXISTS uav_data_20260330_1601 PARTITION OF uav_data FOR VALUES IN ('20260330_1601');
CREATE TABLE IF NOT EXISTS uav_data_20260330_1647 PARTITION OF uav_data FOR VALUES IN ('20260330_1647');

-- 舊版使用 PM25；統一遷移為原始欄位名稱 PM2.5。
DELETE FROM uav_data old_data
USING uav_data new_data
WHERE old_data.parameter_id = 'PM25'
  AND new_data.parameter_id = 'PM2.5'
  AND old_data.flight_id = new_data.flight_id
  AND old_data.agl_m = new_data.agl_m;

UPDATE uav_data
SET parameter_id = 'PM2.5'
WHERE parameter_id = 'PM25';

DELETE FROM uav_parameters
WHERE parameter_id = 'PM25';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 索引
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_uav_flight    ON uav_data(flight_id);
CREATE INDEX IF NOT EXISTS idx_uav_agl       ON uav_data(agl_m);
CREATE INDEX IF NOT EXISTS idx_uav_parameter ON uav_data(parameter_id);
CREATE INDEX IF NOT EXISTS idx_uav_quality   ON uav_data(data_quality);
-- 垂直剖面複合索引
CREATE INDEX IF NOT EXISTS idx_uav_flight_agl_param
    ON uav_data(flight_id, agl_m, parameter_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 彙總視圖（pivot 回寬表，常用氣象+污染物欄位）
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS uav_profile;

CREATE VIEW uav_profile AS
SELECT
    d.flight_id,
    f.site_name,
    d.agl_m,
    MAX(CASE WHEN d.parameter_id = 'T'      THEN d.value END) AS T,
    MAX(CASE WHEN d.parameter_id = 'RH'     THEN d.value END) AS RH,
    MAX(CASE WHEN d.parameter_id = 'P'      THEN d.value END) AS P,
    MAX(CASE WHEN d.parameter_id = 'ws'     THEN d.value END) AS ws,
    MAX(CASE WHEN d.parameter_id = 'wd'     THEN d.value END) AS wd,
    MAX(CASE WHEN d.parameter_id = 'theta'  THEN d.value END) AS theta,
    MAX(CASE WHEN d.parameter_id = 'PM1'    THEN d.value END) AS PM1,
    MAX(CASE WHEN d.parameter_id = 'PM2.5'  THEN d.value END) AS "PM2.5",
    MAX(CASE WHEN d.parameter_id = 'PM10'   THEN d.value END) AS PM10,
    MAX(CASE WHEN d.parameter_id = 'O3'     THEN d.value END) AS O3,
    MAX(CASE WHEN d.parameter_id = 'NO2'    THEN d.value END) AS NO2,
    MAX(CASE WHEN d.parameter_id = 'SO2'    THEN d.value END) AS SO2,
    MAX(CASE WHEN d.parameter_id = 'CO'     THEN d.value END) AS CO,
    MAX(CASE WHEN d.parameter_id = 'CO2'    THEN d.value END) AS CO2
FROM uav_data d
JOIN uav_flights f ON d.flight_id = f.flight_id
WHERE d.data_quality = 'good'
GROUP BY d.flight_id, f.site_name, d.agl_m
ORDER BY d.flight_id, d.agl_m ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 資料品質檢查函數
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_uav_data_quality()
RETURNS TABLE(
    flight_id          VARCHAR(20),
    total_records      BIGINT,
    valid_records      BIGINT,
    invalid_records    BIGINT,
    data_quality_ratio NUMERIC(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.flight_id,
        COUNT(d.flight_id)                                         AS total_records,
        COUNT(CASE WHEN d.data_quality = 'good'    THEN 1 END)    AS valid_records,
        COUNT(CASE WHEN d.data_quality = 'invalid' THEN 1 END)    AS invalid_records,
        ROUND(
            CASE
                WHEN COUNT(d.flight_id) = 0 THEN 0
                ELSE COUNT(CASE WHEN d.data_quality = 'good' THEN 1 END)::NUMERIC
                     / NULLIF(COUNT(d.flight_id), 0)::NUMERIC * 100
            END, 2
        )                                                          AS data_quality_ratio
    FROM uav_flights f
    LEFT JOIN uav_data d ON f.flight_id = d.flight_id
    GROUP BY f.flight_id
    ORDER BY f.flight_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE uav_flights    IS 'UAV 飛行任務基本資料（6 次，2026-03-30）';
COMMENT ON TABLE uav_parameters IS 'UAV 量測參數定義（23 個主要欄位：高度 2、氣象 11、氣膠 3、氣體 7；CO2 為預留欄位，原始檔若提供則匯入）';
COMMENT ON TABLE uav_data       IS 'UAV 量測資料（長表，按 flight_id LIST 分區，agl 為層鍵不另存為參數）';
COMMENT ON VIEW  uav_profile    IS 'UAV 垂直剖面寬表視圖（常用氣象+污染物欄位）';
COMMENT ON FUNCTION check_uav_data_quality() IS '檢查 UAV 各飛行任務資料品質統計';
