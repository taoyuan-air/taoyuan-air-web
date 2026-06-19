-- UAV 無人機大氣垂直剖面資料庫架構
-- 分支: feat/database-UAV
-- 建立日期: 2026-05-26
-- 儀器: Aeromount V2(A009) + POM(1781)
-- 資料範圍: 2026-03-30，共 6 次飛行任務
-- 量測參數: 24 個（高度 2 種、氣象 11 種、氣膠 3 種、氣體 8 種）
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
    flight_direction  VARCHAR(20),                     -- ascending / descending
    data_level        VARCHAR(5)    DEFAULT 'L3',
    site_name         VARCHAR(100),
    latitude          DECIMAL(10, 8) DEFAULT 25.0605,
    longitude         DECIMAL(11, 8) DEFAULT 121.1287,
    ground_altitude_m DECIMAL(7, 1)  DEFAULT 17.0,    -- 地面海拔高度（公尺）
    created_at        TIMESTAMP     DEFAULT NOW(),
    updated_at        TIMESTAMP     DEFAULT NOW()
);

-- 插入 6 次飛行任務
INSERT INTO uav_flights
    (flight_id, flight_direction, data_level, site_name, latitude, longitude, ground_altitude_m)
VALUES
    ('20260330_0025', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0),
    ('20260330_0242', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0),
    ('20260330_1433', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0),
    ('20260330_1517', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0),
    ('20260330_1601', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0),
    ('20260330_1647', 'ascending', 'L3', 'Guanyin', 25.0605, 121.1287, 17.0)
ON CONFLICT (flight_id) DO UPDATE SET
    site_name  = EXCLUDED.site_name,
    updated_at = NOW();

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
    ('PM25',   '細懸浮微粒',      'PM2.5',                              'ug/m^3', 'aerosol'),
    ('PM10',   '懸浮微粒',        'PM10',                               'ug/m^3', 'aerosol'),
    -- gas
    ('O3',     '臭氧',            'ozone',                              'ppb',    'gas'),
    ('CO',     '一氧化碳',        'carbon monoxide',                    'ppm',    'gas'),
    ('CO2',    '二氧化碳',        'carbon dioxide',                     'ppm',    'gas'),
    ('SO2',    '二氧化硫',        'sulfur dioxide',                     'ppb',    'gas'),
    ('NO2',    '二氧化氮',        'nitrogen dioxide',                   'ppb',    'gas'),
    ('NH3',    '氨',              'ammonia',                            'ppm',    'gas'),
    ('H2S',    '硫化氫',          'hydrogen sulfide',                   'ppm',    'gas'),
    ('TVOC',   '總揮發性有機物',  'total volatile organic compound',    'ppm',    'gas')
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name = EXCLUDED.parameter_name,
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
CREATE OR REPLACE VIEW uav_profile AS
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
    MAX(CASE WHEN d.parameter_id = 'PM25'   THEN d.value END) AS PM25,
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
COMMENT ON TABLE uav_parameters IS 'UAV 量測參數定義（24 個：高度 2、氣象 11、氣膠 3、氣體 8；CO2 為本專案必要欄位）';
COMMENT ON TABLE uav_data       IS 'UAV 量測資料（長表，按 flight_id LIST 分區，agl 為層鍵不另存為參數）';
COMMENT ON VIEW  uav_profile    IS 'UAV 垂直剖面寬表視圖（常用氣象+污染物欄位）';
COMMENT ON FUNCTION check_uav_data_quality() IS '檢查 UAV 各飛行任務資料品質統計';
