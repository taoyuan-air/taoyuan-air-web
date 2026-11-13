-- WindLidar 舊版（一個參數一列）→ 寬表（一個時間 × 高度一列）轉換，只需執行一次
-- 一天一天轉，每轉完一天就刪掉舊的那天，過程中不需要額外的大量空間
--
-- 執行（VM）：
--   docker exec -i taoyuan-air-db psql -v ON_ERROR_STOP=1 -U taoyuan_user -d taoyuan_air < database/wind_lidar_migrate_wide.sql
--   docker exec -i taoyuan-air-db psql -v ON_ERROR_STOP=1 -U taoyuan_user -d taoyuan_air < database/wind_lidar_schema.sql

-- 1. 舊的 view 依賴舊欄位，先拿掉（wind_lidar_schema.sql 會重建）
DROP VIEW IF EXISTS wind_lidar_latest;

-- 2. 把舊表與它的每日分區改名，讓出 wind_lidar_data 這個名字
DO $$
DECLARE
    child TEXT;
    i     INT := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wind_lidar_data' AND column_name = 'parameter_id'
    ) THEN
        RAISE NOTICE 'wind_lidar_data 已經是新格式，略過改名';
        RETURN;
    END IF;

    FOR child IN
        SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid
        WHERE h.inhparent = 'wind_lidar_data'::regclass ORDER BY c.relname
    LOOP
        i := i + 1;
        EXECUTE format('ALTER TABLE %I RENAME TO %I', child, 'wind_lidar_long_' || i);
    END LOOP;

    ALTER TABLE wind_lidar_data RENAME TO wind_lidar_data_long;
    RAISE NOTICE '舊表已改名為 wind_lidar_data_long（% 個分區）', i;
END
$$;

-- 3. 建立新的寬表
CREATE TABLE IF NOT EXISTS wind_lidar_data (
    station_id   VARCHAR(20)    NOT NULL REFERENCES wind_lidar_stations(station_id),
    measure_time TIMESTAMP      NOT NULL,
    height_m     NUMERIC(7, 1)  NOT NULL,
    hsp          REAL,
    vsp          REAL,
    wdir         REAL,
    turb         REAL,
    min_int      REAL,
    mean_int     REAL,
    n_samples    INTEGER,
    PRIMARY KEY (station_id, measure_time, height_m)
) PARTITION BY RANGE (measure_time);

-- 4. 一個分區一個分區轉：寫入新表 → 刪掉舊分區 → COMMIT（釋放空間）
DO $$
DECLARE
    children TEXT[];
    child    TEXT;
    d        TIMESTAMP;
    part     TEXT;
    n        BIGINT;
BEGIN
    IF to_regclass('wind_lidar_data_long') IS NULL THEN
        RAISE NOTICE '沒有舊表需要轉換';
        RETURN;
    END IF;

    SELECT array_agg(c.relname ORDER BY c.relname) INTO children
    FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid
    WHERE h.inhparent = 'wind_lidar_data_long'::regclass;

    FOREACH child IN ARRAY COALESCE(children, '{}')
    LOOP
        -- 依資料實際日期建立新表的日分區
        FOR d IN EXECUTE format(
            'SELECT DISTINCT date_trunc(''day'', measure_time) FROM %I', child)
        LOOP
            part := 'wind_lidar_data_' || to_char(d, 'YYYY_MM_DD');
            IF to_regclass(part) IS NULL THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF wind_lidar_data FOR VALUES FROM (%L) TO (%L)',
                    part, d, d + INTERVAL '1 day');
            END IF;
        END LOOP;

        EXECUTE format($q$
            INSERT INTO wind_lidar_data
                (station_id, measure_time, height_m, hsp, vsp, wdir, turb, min_int, mean_int, n_samples)
            SELECT station_id, measure_time, height_m,
                   MAX(value) FILTER (WHERE parameter_id = 'hsp'),
                   MAX(value) FILTER (WHERE parameter_id = 'vsp'),
                   MAX(value) FILTER (WHERE parameter_id = 'wdir'),
                   MAX(value) FILTER (WHERE parameter_id = 'turb'),
                   MAX(value) FILTER (WHERE parameter_id = 'min_int'),
                   MAX(value) FILTER (WHERE parameter_id = 'mean_int'),
                   MAX(value) FILTER (WHERE parameter_id = 'n_samples')::INTEGER
            FROM %I
            GROUP BY station_id, measure_time, height_m
            ON CONFLICT DO NOTHING
        $q$, child);
        GET DIAGNOSTICS n = ROW_COUNT;

        EXECUTE format('DROP TABLE %I', child);
        COMMIT;
        RAISE NOTICE '% 轉換完成：% 列', child, n;
    END LOOP;

    DROP TABLE wind_lidar_data_long;
    COMMIT;
    RAISE NOTICE '全部轉換完成';
END
$$;

-- 5. 結果
SELECT COUNT(*) AS days,
       pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS total_size
FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid
WHERE h.inhparent = 'wind_lidar_data'::regclass;
