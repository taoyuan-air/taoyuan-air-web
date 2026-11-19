-- ============================================================
-- TYDEP 資料庫升級（v1 → v2）
--
-- 只有「已經建過舊版 TYDEP 資料表」的資料庫需要執行；新資料庫直接執行
-- database/tydep_stations_schema.sql 即可。
--
-- 會做的事：
--   1. tydep_pollutants 改名為 tydep_parameters
--   2. pollutant_id / pollutant_name / pollutant_eng_name 改名為 parameter_*
--   3. tydep_stations 新增 station_type 欄位
--   4. 測站編號改成與即時 CSV 檔名一致：
--        0604616A0002 → TYDEP_Xinxing   0604316A0003 → TYDEP_Neili
--        0604816I0005 → TYDEP_Huaya     0605316I0004 → TYDEP_Guanyin
--      歷史資料一併改到新編號
--
-- 執行方式（整段在同一個 transaction，失敗會整個還原）：
--   docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -v ON_ERROR_STOP=1 < database/migrate_tydep_v2.sql
--   docker exec -i taoyuan-air-db psql -U taoyuan_user -d taoyuan_air -v ON_ERROR_STOP=1 < database/tydep_stations_schema.sql
--
-- 重複執行不會出錯。
-- ============================================================

BEGIN;

-- 舊的檢視表引用舊欄位名稱，先刪除，最後由 tydep_stations_schema.sql 重建
DROP VIEW IF EXISTS tydep_latest_data;
DROP VIEW IF EXISTS tydep_monthly_stats;

-- 1. 參數表改名
DO $$
BEGIN
    IF to_regclass('public.tydep_pollutants') IS NOT NULL
       AND to_regclass('public.tydep_parameters') IS NULL THEN
        ALTER TABLE tydep_pollutants RENAME TO tydep_parameters;
    END IF;
END $$;

-- 2. 欄位改名（分區表改母表即可，所有分區會跟著改）
DO $$
DECLARE
    t TEXT;
    pair TEXT[];
BEGIN
    FOREACH t IN ARRAY ARRAY['tydep_parameters', 'tydep_hourly_data'] LOOP
        FOREACH pair SLICE 1 IN ARRAY ARRAY[
            ARRAY['pollutant_id',       'parameter_id'],
            ARRAY['pollutant_name',     'parameter_name'],
            ARRAY['pollutant_eng_name', 'parameter_eng_name']
        ] LOOP
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = pair[1]
            ) THEN
                EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', t, pair[1], pair[2]);
            END IF;
        END LOOP;
    END LOOP;
END $$;

ALTER INDEX IF EXISTS idx_tydep_hourly_pollutant RENAME TO idx_tydep_hourly_parameter;

-- 3. 測站類型欄位
ALTER TABLE tydep_stations ADD COLUMN IF NOT EXISTS station_type VARCHAR(20);

-- 4. 測站編號改新版
CREATE TEMP TABLE tydep_id_map (old_id VARCHAR(20), new_id VARCHAR(20)) ON COMMIT DROP;
INSERT INTO tydep_id_map VALUES
    ('0604616A0002', 'TYDEP_Xinxing'),
    ('0604316A0003', 'TYDEP_Neili'),
    ('0604816I0005', 'TYDEP_Huaya'),
    ('0605316I0004', 'TYDEP_Guanyin');

-- 4-1. 先建立新編號（複製舊測站資料）
INSERT INTO tydep_stations
    (station_id, station_name, county, district, location, latitude, longitude, station_type, is_active)
SELECT m.new_id, s.station_name, s.county, s.district, s.location, s.latitude, s.longitude,
       '空品＋氣象', s.is_active
FROM tydep_stations s
JOIN tydep_id_map m ON s.station_id = m.old_id
ON CONFLICT (station_id) DO NOTHING;

-- 4-2. 新編號已經有同一筆資料時（例如即時資料已用新編號匯入），刪掉舊編號那筆，避免重複
DELETE FROM tydep_hourly_data o
USING tydep_id_map m, tydep_hourly_data n
WHERE o.station_id = m.old_id
  AND n.station_id = m.new_id
  AND n.monitor_date = o.monitor_date
  AND n.parameter_id = o.parameter_id;

-- 4-3. 歷史資料改到新編號
UPDATE tydep_hourly_data h
SET station_id = m.new_id
FROM tydep_id_map m
WHERE h.station_id = m.old_id;

-- 4-4. 刪除舊編號
DELETE FROM tydep_stations s
USING tydep_id_map m
WHERE s.station_id = m.old_id;

COMMIT;

-- 完成後請接著執行 database/tydep_stations_schema.sql，
-- 補上 4 個氣象站、9 個新參數，並重建檢視表。
