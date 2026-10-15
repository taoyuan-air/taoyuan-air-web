-- WindLidar 風光達資料庫架構
-- 分支: feat/database-WindLidar
-- 建立日期: 2026-05-25
-- 更新日期: 2026-10-15（改為寬表：一個時間 × 高度一列，空間約為舊版 1/15）
-- 儀器: L02240328_Guanyin（可擴充）
-- 資料範圍: 2026-03-27 起，每天一個分區（匯入時自動建立）
-- 量測間隔: 每 10 分鐘，760 高度層（9.1m～984.6m）
-- 時間欄位: 原始 Date/time 以 UTC TIMESTAMP 儲存；View 另提供 UTC+8 台灣時間欄位
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
    latitude    DECIMAL(10, 8),
    longitude   DECIMAL(11, 8),
    altitude_m  DECIMAL(7, 1),                    -- 儀器離地高度（公尺）
    is_active   BOOLEAN               DEFAULT true,
    created_at  TIMESTAMP             DEFAULT NOW(),
    updated_at  TIMESTAMP             DEFAULT NOW()
);

ALTER TABLE IF EXISTS wind_lidar_stations
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
    ADD COLUMN IF NOT EXISTS altitude_m DECIMAL(7, 1),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    DROP COLUMN IF EXISTS address;

-- 插入 L02240328 儀器資料
INSERT INTO wind_lidar_stations
    (station_id, county, latitude, longitude, altitude_m)
VALUES
    ('L02240328_Guanyin', '桃園市', 25.05283056, 121.11794722, 36.0)
ON CONFLICT (station_id) DO UPDATE SET
    latitude   = EXCLUDED.latitude,
    longitude  = EXCLUDED.longitude,
    altitude_m = EXCLUDED.altitude_m,
    updated_at = NOW();

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
    ('hsp',       '水平風速',     'horizontal speed', 'm/s',    'float',   '水平風速'),
    ('vsp',       '垂直風速',     'vertical speed',   'm/s',    'float',   '正值向上，負值向下'),
    ('wdir',      '風向',         'wind direction',   'degree', 'float',   '範圍 [0, 360)，0/360 為正北，順時針'),
    ('turb',      '亂流強度',     'turbulence',       '無因次', 'float',   '亂流強度'),
    ('min_int',   '最小訊號強度', 'minimum intensity', '',      'float',   '最小訊號強度'),
    ('mean_int',  '平均訊號強度', 'mean intensity',    '',      'float',   '平均訊號強度'),
    ('n_samples', '樣本數',       'number of samples', '',      'integer', '該時間與高度層之統計筆數')
ON CONFLICT (parameter_id) DO UPDATE SET
    parameter_name = EXCLUDED.parameter_name,
    parameter_eng  = EXCLUDED.parameter_eng,
    unit           = EXCLUDED.unit,
    data_type      = EXCLUDED.data_type,
    description    = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 量測資料表（寬表，按天分區）
--    一列 = 一個測站 × 一個時間 × 一個高度，7 個參數各一欄
--    舊版（一個參數一列）請先執行 wind_lidar_migrate_wide.sql 轉換
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wind_lidar_data' AND column_name = 'parameter_id'
    ) THEN
        RAISE EXCEPTION 'wind_lidar_data 還是舊版格式，請先執行 database/wind_lidar_migrate_wide.sql';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS wind_lidar_data (
    station_id   VARCHAR(20)    NOT NULL REFERENCES wind_lidar_stations(station_id),
    measure_time TIMESTAMP      NOT NULL,           -- 分區鍵，10 分鐘均值的區間終點（UTC）
    height_m     NUMERIC(7, 1)  NOT NULL,           -- 量測高度（公尺）
    hsp          REAL,                              -- 水平風速 m/s
    vsp          REAL,                              -- 垂直風速 m/s
    wdir         REAL,                              -- 風向 degree
    turb         REAL,                              -- 亂流強度
    min_int      REAL,                              -- 最小訊號強度
    mean_int     REAL,                              -- 平均訊號強度
    n_samples    INTEGER,                           -- 樣本數
    PRIMARY KEY (station_id, measure_time, height_m)
) PARTITION BY RANGE (measure_time);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 分區表（按天；之後的日期由 import_wind_lidar.py 自動建立）
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026 年 3 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_27 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-27 00:00:00+00') TO ('2026-03-28 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_28 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-28 00:00:00+00') TO ('2026-03-29 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_29 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-29 00:00:00+00') TO ('2026-03-30 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_30 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-30 00:00:00+00') TO ('2026-03-31 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_03_31 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-03-31 00:00:00+00') TO ('2026-04-01 00:00:00+00');

-- 2026 年 4 月
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_01 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-04-02 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_02 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-02 00:00:00+00') TO ('2026-04-03 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_03 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-03 00:00:00+00') TO ('2026-04-04 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_04 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-04 00:00:00+00') TO ('2026-04-05 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_05 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-05 00:00:00+00') TO ('2026-04-06 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_06 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-06 00:00:00+00') TO ('2026-04-07 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_07 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-07 00:00:00+00') TO ('2026-04-08 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_08 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-08 00:00:00+00') TO ('2026-04-09 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_09 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-09 00:00:00+00') TO ('2026-04-10 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_10 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-10 00:00:00+00') TO ('2026-04-11 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_11 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-11 00:00:00+00') TO ('2026-04-12 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_12 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-12 00:00:00+00') TO ('2026-04-13 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_13 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-13 00:00:00+00') TO ('2026-04-14 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_14 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-14 00:00:00+00') TO ('2026-04-15 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_15 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-15 00:00:00+00') TO ('2026-04-16 00:00:00+00');
CREATE TABLE IF NOT EXISTS wind_lidar_data_2026_04_16 PARTITION OF wind_lidar_data FOR VALUES FROM ('2026-04-16 00:00:00+00') TO ('2026-04-17 00:00:00+00');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 索引：主鍵 (station_id, measure_time, height_m) 已涵蓋常用查詢，不另建
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 最近 1 小時視圖（含台灣時間）
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS wind_lidar_latest;

CREATE VIEW wind_lidar_latest AS
SELECT
    station_id,
    measure_time,
    measure_time + INTERVAL '8 hours' AS measure_time_tw,
    height_m,
    hsp, vsp, wdir, turb, min_int, mean_int, n_samples
FROM wind_lidar_data
WHERE measure_time >= (SELECT MAX(measure_time) FROM wind_lidar_data) - INTERVAL '1 hour'
ORDER BY measure_time DESC, height_m ASC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 資料品質檢查函數（有效 = 水平風速有值）
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS check_wind_lidar_quality();

CREATE FUNCTION check_wind_lidar_quality()
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
        COUNT(d.station_id)                              AS total_records,
        COUNT(d.hsp)                                     AS valid_records,
        COUNT(d.station_id) - COUNT(d.hsp)               AS invalid_records,
        ROUND(COUNT(d.hsp)::NUMERIC / NULLIF(COUNT(d.station_id), 0) * 100, 2)
                                                         AS data_quality_ratio
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
COMMENT ON TABLE wind_lidar_parameters IS 'WindLidar 量測參數種類（7 項，對應 wind_lidar_data 的欄位）';
COMMENT ON TABLE wind_lidar_data       IS 'WindLidar 量測資料（寬表，按天分區）';
COMMENT ON VIEW  wind_lidar_latest     IS '最近 1 小時 WindLidar 量測資料';
COMMENT ON FUNCTION check_wind_lidar_quality() IS '檢查 WindLidar 資料品質統計';
