-- WindLidar 風光達資料庫架構
-- 分支: feat/database-WindLidar
-- 建立日期: 2026-05-25
-- 儀器: TMA_328（可擴充）
-- 資料範圍: 2026-03-27 至 2026-04-15，共 20 天
-- 量測間隔: 每 10 分鐘，760 高度層（9.1m～984.6m）
-- 資料流程: txt → 直接匯入 DB（資料量過大，不產生 JSON 中間層）

-- 0. 啟用必要擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 儀器基本資料表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_stations (
    station_id  VARCHAR(20)           PRIMARY KEY,
    county      VARCHAR(50)           NOT NULL DEFAULT '桃園市',
    location    GEOMETRY(Point, 4326),
    latitude    DECIMAL(10, 8),
    longitude   DECIMAL(11, 8),
    altitude_m  DECIMAL(7, 1),                    -- 儀器架設地面高度（公尺）
    address     TEXT,
    is_active   BOOLEAN               DEFAULT true,
    created_at  TIMESTAMP             DEFAULT NOW(),
    updated_at  TIMESTAMP             DEFAULT NOW()
);

-- 插入 TMA_328 儀器資料（架設於華亞工業區）
INSERT INTO wind_lidar_stations
    (station_id, county, latitude, longitude, altitude_m, address)
VALUES
    ('TMA_328', '桃園市', 25.0505, 121.3713, 0.0, '桃園市龜山區華亞工業區')
ON CONFLICT (station_id) DO UPDATE SET
    latitude   = EXCLUDED.latitude,
    longitude  = EXCLUDED.longitude,
    altitude_m = EXCLUDED.altitude_m,
    updated_at = NOW();

-- 空間索引
CREATE INDEX IF NOT EXISTS idx_wl_stations_location
    ON wind_lidar_stations USING GIST(location);

-- 更新 PostGIS location 欄位
UPDATE wind_lidar_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 量測參數種類表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_parameters (
    parameter_id   VARCHAR(10)  PRIMARY KEY,
    parameter_name VARCHAR(50)  NOT NULL,
    parameter_eng  VARCHAR(50)  NOT NULL,
    unit           VARCHAR(20)  NOT NULL,
    data_type      VARCHAR(10)  NOT NULL DEFAULT 'float',  -- 'float' 或 'integer'
    description    TEXT,
    created_at     TIMESTAMP    DEFAULT NOW()
);

INSERT INTO wind_lidar_parameters
    (parameter_id, parameter_name, parameter_eng, unit, data_type, description)
VALUES
    ('hsp',       '水平風速', 'Hsp',       'm/s', 'float',   'Hsp=0 表示訊號不足，整列無效'),
    ('vsp',       '垂直風速', 'Vsp',       'm/s', 'float',   '正值向上，負值向下'),
    ('wdir',      '風向',     'Wdir',      '度',  'float',   '範圍 [0, 360)，0/360 為正北，順時針'),
    ('turb',      '紊流強度', 'Turb',      '',    'float',   '紊流強度指標'),
    ('min_int',   '最小強度', 'Min int.',  '',    'float',   '量測區間最小後向散射強度'),
    ('mean_int',  '平均強度', 'Mean int.', '',    'float',   '量測區間平均後向散射強度'),
    ('n_samples', '樣本數',   'n',         '',    'integer', '區間內有效光脈衝樣本數（1～401）')
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name = EXCLUDED.parameter_name,
    unit           = EXCLUDED.unit,
    data_type      = EXCLUDED.data_type;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 量測資料表（分區表，按天分區）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wind_lidar_data (
    id           BIGSERIAL,
    station_id   VARCHAR(20)    NOT NULL,
    measure_time TIMESTAMP      NOT NULL,           -- 分區鍵，10分鐘均值的區間終點
    height_m     NUMERIC(7, 1)  NOT NULL,           -- 量測高度（公尺）
    parameter_id VARCHAR(10)    NOT NULL,
    value        NUMERIC(10, 3),                    -- 量測數值（無效值為 NULL）
    raw_value    VARCHAR(30),                       -- 原始字串值
    data_quality VARCHAR(10)    DEFAULT 'good',     -- 'good' 或 'invalid'
    period_start TIMESTAMP,                         -- measure_time - 10 分鐘
    period_end   TIMESTAMP,                         -- 等同 measure_time
    source       VARCHAR(20)    DEFAULT 'history',
    created_at   TIMESTAMP      DEFAULT NOW(),
    PRIMARY KEY (id, measure_time),
    FOREIGN KEY (station_id)   REFERENCES wind_lidar_stations(station_id),
    FOREIGN KEY (parameter_id) REFERENCES wind_lidar_parameters(parameter_id),
    UNIQUE (station_id, measure_time, height_m, parameter_id)
) PARTITION BY RANGE (measure_time);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 分區表（按天，2026-03-27 至 2026-04-15）
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026 年 3 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_27 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-27') TO ('2026-03-28');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_28 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-28') TO ('2026-03-29');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_29 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-29') TO ('2026-03-30');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_30 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-30') TO ('2026-03-31');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_31 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-31') TO ('2026-04-01');

-- 2026 年 4 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_01 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-01') TO ('2026-04-02');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_02 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-02') TO ('2026-04-03');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_03 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-03') TO ('2026-04-04');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_04 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-04') TO ('2026-04-05');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_05 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-05') TO ('2026-04-06');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_06 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-06') TO ('2026-04-07');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_07 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-07') TO ('2026-04-08');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_08 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-08') TO ('2026-04-09');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_09 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-09') TO ('2026-04-10');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_10 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-10') TO ('2026-04-11');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_11 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-11') TO ('2026-04-12');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_12 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-12') TO ('2026-04-13');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_13 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-13') TO ('2026-04-14');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_14 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-14') TO ('2026-04-15');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_15 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-15') TO ('2026-04-16');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_16 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-16') TO ('2026-04-17');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 索引
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wl_station   ON wind_lidar_data(station_id);
CREATE INDEX IF NOT EXISTS idx_wl_time      ON wind_lidar_data(measure_time);
CREATE INDEX IF NOT EXISTS idx_wl_height    ON wind_lidar_data(height_m);
CREATE INDEX IF NOT EXISTS idx_wl_parameter ON wind_lidar_data(parameter_id);
CREATE INDEX IF NOT EXISTS idx_wl_quality   ON wind_lidar_data(data_quality);
-- 垂直剖面複合索引（最常用查詢）
CREATE INDEX IF NOT EXISTS idx_wl_station_time_height
    ON wind_lidar_data(station_id, measure_time, height_m);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 彙總視圖（最近 1 小時，pivot 回寬表格式）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW wind_lidar_latest AS
SELECT
    s.station_id,
    d.measure_time,
    d.height_m,
    MAX(CASE WHEN d.parameter_id = 'hsp'      THEN d.value END) AS hsp,
    MAX(CASE WHEN d.parameter_id = 'vsp'      THEN d.value END) AS vsp,
    MAX(CASE WHEN d.parameter_id = 'wdir'     THEN d.value END) AS wdir,
    MAX(CASE WHEN d.parameter_id = 'turb'     THEN d.value END) AS turb,
    MAX(CASE WHEN d.parameter_id = 'min_int'  THEN d.value END) AS min_int,
    MAX(CASE WHEN d.parameter_id = 'mean_int' THEN d.value END) AS mean_int,
    MAX(CASE WHEN d.parameter_id = 'n_samples'THEN d.value END) AS n_samples
FROM wind_lidar_stations s
JOIN wind_lidar_data d ON s.station_id = d.station_id
WHERE d.measure_time >= (SELECT MAX(measure_time) FROM wind_lidar_data) - INTERVAL '1 hour'
    AND d.data_quality = 'good'
GROUP BY s.station_id, d.measure_time, d.height_m
ORDER BY d.measure_time DESC, d.height_m ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 資料品質檢查函數
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_wind_lidar_quality()
RETURNS TABLE(
    station_id         VARCHAR(20),
    total_records      BIGINT,
    valid_records      BIGINT,
    invalid_records    BIGINT,
    data_quality_ratio NUMERIC(5, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.station_id,
        COUNT(d.station_id)                                         AS total_records,
        COUNT(CASE WHEN d.data_quality = 'good'    THEN 1 END)     AS valid_records,
        COUNT(CASE WHEN d.data_quality = 'invalid' THEN 1 END)     AS invalid_records,
        ROUND(
            CASE
                WHEN COUNT(d.station_id) = 0 THEN 0
                ELSE COUNT(CASE WHEN d.data_quality = 'good' THEN 1 END)::NUMERIC
                     / NULLIF(COUNT(d.station_id), 0)::NUMERIC * 100
            END, 2
        )                                                           AS data_quality_ratio
    FROM wind_lidar_stations s
    LEFT JOIN wind_lidar_data d ON s.station_id = d.station_id
    GROUP BY s.station_id
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE wind_lidar_stations   IS 'WindLidar 風光達儀器基本資料';
COMMENT ON TABLE wind_lidar_parameters IS 'WindLidar 量測參數種類（7 項）';
COMMENT ON TABLE wind_lidar_data       IS 'WindLidar 量測資料（分區表，按天，2026-03-27 至 2026-04-15）';
COMMENT ON VIEW  wind_lidar_latest     IS '最近 1 小時 WindLidar 量測資料（寬表格式）';
COMMENT ON FUNCTION check_wind_lidar_quality() IS '檢查 WindLidar 資料品質統計';
