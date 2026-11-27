-- IOP miniMPL（微脈衝光達）資料庫架構
-- 建立日期: 2026-11-27
-- 儀器: MMPL 5009（觀音；IOP1、IOP2 都在觀音）
-- 資料來源: /data/sftp_root/uploads/TYDEP/2026IOP{1,2}/miniMPL/MMPL_5009_L1_NRB_YYYYMMDD_<站>_V1.nc
-- 時間: 檔內 Time（一年中的第幾天，小數）換算為 UTC TIMESTAMP；每 30 秒一格，實際約每 60 秒一筆有效剖面
-- 高度: range 0.015～29.985 km，每層 30 m，共 1000 層（存在 mpl_stations.range_km）
-- 儲存方式: 一個時間一列，1000 層訊號存成 REAL[]（NaN 存成 NULL）
--           一天約 1,300 列，16 天約 2 萬列；若改成一層一列會超過 4,000 萬列
-- 匯入程式: scripts/import_iop_mpl.py

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 儀器／測站
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpl_stations (
    station_id   VARCHAR(30)    PRIMARY KEY,          -- 例：MMPL5009_Guanyin
    serial       VARCHAR(10)    NOT NULL,             -- 儀器序號（檔名第 2 段）
    site         VARCHAR(30)    NOT NULL,             -- 站點（檔名）
    latitude     DECIMAL(10, 6),
    longitude    DECIMAL(10, 6),
    elevation_m  DECIMAL(7, 1),
    range_km     REAL[]         NOT NULL,             -- 各高度層離儀器距離（km），長度 = 剖面長度
    created_at   TIMESTAMP      DEFAULT NOW(),
    updated_at   TIMESTAMP      DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 剖面資料（一個時間一列）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mpl_profiles (
    station_id    VARCHAR(30)  NOT NULL REFERENCES mpl_stations(station_id),
    measure_time  TIMESTAMP    NOT NULL,              -- UTC
    nrb_co        REAL[]       NOT NULL,              -- Co-polar NRB（MHz km^2 uJ^-1），對應 range_km
    nrb_cr        REAL[]       NOT NULL,              -- Cross-polar NRB（MHz km^2 uJ^-1）
    source_file   VARCHAR(100),
    created_at    TIMESTAMP    DEFAULT NOW(),
    PRIMARY KEY (station_id, measure_time)
);

CREATE INDEX IF NOT EXISTS idx_mpl_profiles_time ON mpl_profiles (measure_time);

-- 網頁查詢用：台灣時間
CREATE OR REPLACE VIEW mpl_profiles_tw AS
SELECT
    station_id,
    measure_time                        AS measure_time_utc,
    measure_time + INTERVAL '8 hours'   AS measure_time_tw,
    nrb_co,
    nrb_cr
FROM mpl_profiles;
