-- MPL 氣膠光達資料庫架構
-- 分支: feat/database-MPL
-- 建立日期: 2026-08-20
-- 儀器: MiniMPL（MMPL5009，觀音站）
-- 資料範圍: 2026-08 起
-- 量測間隔: 每 30 秒，1000 個高度層（0.015～14.985 km）
-- 時間欄位: measure_time 以 UTC TIMESTAMP 儲存
-- 資料流程: .nc → .json → 匯入 DB

-- 0. 啟用必要擴充功能
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 儀器測站基本資料表
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpl_stations (
    station_id   VARCHAR(30)    PRIMARY KEY,  -- e.g. mmpl5009_Guanyin
    site_name    VARCHAR(100)   NOT NULL,     -- e.g. Guanyin
    serial_no    VARCHAR(20),                 -- 儀器序號，e.g. 5009（從檔名解析）
    county       VARCHAR(50)    DEFAULT '桃園市',
    is_active    BOOLEAN        DEFAULT true,
    created_at   TIMESTAMP      DEFAULT NOW(),
    updated_at   TIMESTAMP      DEFAULT NOW()
);

-- 插入觀音站資料
INSERT INTO mpl_stations (station_id, site_name, serial_no, county)
VALUES ('mmpl5009_Guanyin', 'Guanyin', '5009', '桃園市')
ON CONFLICT (station_id) DO UPDATE SET
    site_name  = EXCLUDED.site_name,
    serial_no  = EXCLUDED.serial_no,
    county     = EXCLUDED.county,
    updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 高度層定義表
--    儀器固定 1000 個高度層，獨立儲存供 API 組裝剖面座標用
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpl_range_bins (
    station_id   VARCHAR(30)   NOT NULL,
    bin_index    SMALLINT      NOT NULL,   -- 0 ~ 999
    range_km     NUMERIC(7, 4) NOT NULL,   -- e.g. 0.0150, 0.0450, ...
    PRIMARY KEY (station_id, bin_index),
    FOREIGN KEY (station_id) REFERENCES mpl_stations(station_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 量測資料表（分區表，按月）
--    每筆對應一個量測時間點（30 秒一筆）
--    1D 儀器狀態直接存純量欄位；2D NRB 剖面以陣列存整列，對應 mpl_range_bins
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpl_data (
    id            BIGSERIAL,
    station_id    VARCHAR(30)     NOT NULL,
    measure_time  TIMESTAMP       NOT NULL,    -- UTC，分區鍵，30 秒一筆
    -- 1D 儀器狀態（每個時間點一個值）
    energy_uj     NUMERIC(8, 4),               -- 雷射能量 (μJ)
    las_temp_c    NUMERIC(6, 2),               -- 雷射溫度 (°C)
    det_temp_c    NUMERIC(6, 2),               -- 偵測器溫度 (°C)
    box_temp_c    NUMERIC(6, 2),               -- 機箱溫度 (°C)
    bg_avg_mhz    NUMERIC(10, 6),              -- 背景訊號平均 (MHz)
    bg_std_mhz    NUMERIC(10, 6),              -- 背景訊號標準差 (MHz)
    -- 2D 剖面（陣列，index 對應 mpl_range_bins.bin_index，無效值為 NULL）
    nrb_co        NUMERIC(12, 6)[],            -- Co-polar NRB 剖面 (MHz·km²·μJ⁻¹)
    nrb_cr        NUMERIC(12, 6)[],            -- Cross-polar NRB 剖面 (MHz·km²·μJ⁻¹)
    -- 稽核
    data_quality  VARCHAR(10)     DEFAULT 'good',   -- 'good' 或 'invalid'
    source        VARCHAR(20)     DEFAULT 'realtime', -- 'realtime' 或 'history'
    created_at    TIMESTAMP       DEFAULT NOW(),
    PRIMARY KEY (id, measure_time),
    FOREIGN KEY (station_id) REFERENCES mpl_stations(station_id),
    UNIQUE (station_id, measure_time)
) PARTITION BY RANGE (measure_time);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 分區表（按月，2026-08 起）
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026 年
CREATE TABLE IF NOT EXISTS mpl_data_2026_08 PARTITION OF mpl_data FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS mpl_data_2026_09 PARTITION OF mpl_data FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS mpl_data_2026_10 PARTITION OF mpl_data FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS mpl_data_2026_11 PARTITION OF mpl_data FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS mpl_data_2026_12 PARTITION OF mpl_data FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027 年
CREATE TABLE IF NOT EXISTS mpl_data_2027_01 PARTITION OF mpl_data FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_02 PARTITION OF mpl_data FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_03 PARTITION OF mpl_data FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_04 PARTITION OF mpl_data FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_05 PARTITION OF mpl_data FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_06 PARTITION OF mpl_data FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_07 PARTITION OF mpl_data FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_08 PARTITION OF mpl_data FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_09 PARTITION OF mpl_data FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_10 PARTITION OF mpl_data FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_11 PARTITION OF mpl_data FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS mpl_data_2027_12 PARTITION OF mpl_data FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- 保底分區：避免未涵蓋日期匯入中斷
CREATE TABLE IF NOT EXISTS mpl_data_default PARTITION OF mpl_data DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 索引
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mpl_station      ON mpl_data(station_id);
CREATE INDEX IF NOT EXISTS idx_mpl_time         ON mpl_data(measure_time);
CREATE INDEX IF NOT EXISTS idx_mpl_station_time ON mpl_data(station_id, measure_time);
CREATE INDEX IF NOT EXISTS idx_mpl_quality      ON mpl_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_mpl_source       ON mpl_data(source);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 彙總視圖（最近 1 小時，1D 儀器狀態）
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS mpl_latest;

CREATE VIEW mpl_latest AS
SELECT
    d.station_id,
    d.measure_time,
    d.measure_time + INTERVAL '8 hours' AS measure_time_tw,
    d.energy_uj,
    d.las_temp_c,
    d.det_temp_c,
    d.box_temp_c,
    d.bg_avg_mhz,
    d.bg_std_mhz,
    d.data_quality,
    d.source
FROM mpl_data d
WHERE d.measure_time >= (SELECT MAX(measure_time) FROM mpl_data) - INTERVAL '1 hour'
  AND d.data_quality = 'good'
ORDER BY d.measure_time DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 資料品質檢查函數
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_mpl_data_quality()
RETURNS TABLE(
    station_id         VARCHAR(30),
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
    FROM mpl_stations s
    LEFT JOIN mpl_data d ON s.station_id = d.station_id
    GROUP BY s.station_id
    ORDER BY s.station_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 註解
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE mpl_stations    IS 'MPL 氣膠光達儀器測站基本資料';
COMMENT ON TABLE mpl_range_bins  IS 'MPL 高度層定義（儀器固定 1000 層，0.015～14.985 km）';
COMMENT ON TABLE mpl_data        IS 'MPL 量測資料（分區表，按月，2026-08 起）；NRB 剖面以陣列欄位儲存';
COMMENT ON COLUMN mpl_data.nrb_co       IS 'Co-polar NRB 剖面陣列，index 對應 mpl_range_bins.bin_index';
COMMENT ON COLUMN mpl_data.nrb_cr       IS 'Cross-polar NRB 剖面陣列，index 對應 mpl_range_bins.bin_index';
COMMENT ON COLUMN mpl_data.source       IS '資料來源：realtime（即時匯入）或 history（月末校正版，覆蓋即時資料）';
COMMENT ON VIEW  mpl_latest      IS '最近 1 小時 MPL 儀器狀態（1D 量測）';
COMMENT ON FUNCTION check_mpl_data_quality() IS '檢查 MPL 各測站資料品質統計';
