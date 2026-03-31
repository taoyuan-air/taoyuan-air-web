-- CWA 氣象測站資料查詢範例 (cwa_queries.sql)


-- 1. 查看所有 CWA 測站及其位置
SELECT 
    station_id, 
    station_name, 
    station_type,
    ST_X(location::geometry) as longitude,
    ST_Y(location::geometry) as latitude,
    elevation_m
FROM cwa_stations
ORDER BY station_type, station_id;

-- 2. 查看資料總量統計 (按測站)
SELECT 
    station_id,
    COUNT(*) as total_records,
    MIN(monitor_date) as start_date,
    MAX(monitor_date) as end_date,
    COUNT(DISTINCT observation_id) as obs_types_count
FROM cwa_hourly_data
GROUP BY station_id
ORDER BY total_records DESC;

-- 3. 核心驗證：查看降水量 (PP01) 的時間平移與區間
SELECT 
    station_id,
    monitor_date,
    concentration_numeric as rain_mm,
    period_start,
    period_end,
    data_quality
FROM cwa_hourly_data
WHERE observation_id = 'PP01'
  AND concentration_numeric > 0
ORDER BY monitor_date DESC
LIMIT 20;

-- 4. 氣象要素橫向展開 (Wide Format 視圖)
SELECT 
    s.station_name,
    h.monitor_date,
    MAX(CASE WHEN h.observation_id = 'TX01' THEN h.concentration_numeric END) as temp_c,
    MAX(CASE WHEN h.observation_id = 'RH01' THEN h.concentration_numeric END) as humidity_pct,
    MAX(CASE WHEN h.observation_id = 'PP01' THEN h.concentration_numeric END) as rain_mm,
    MAX(CASE WHEN h.observation_id = 'WD01' THEN h.concentration_numeric END) as wind_speed_ms,
    MAX(CASE WHEN h.observation_id = 'PS01' THEN h.concentration_numeric END) as pressure_hpa
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '24 hours'
GROUP BY s.station_name, h.monitor_date
ORDER BY h.monitor_date DESC, s.station_name;

-- 5. 查看「雨跡 (Trace)」發生頻率統計
SELECT 
    s.station_name,
    COUNT(*) as trace_events,
    MIN(monitor_date) as earliest_trace,
    MAX(monitor_date) as latest_trace
FROM cwa_hourly_data h
JOIN cwa_stations s ON h.station_id = s.station_id
WHERE h.data_quality = 'trace'
GROUP BY s.station_name
ORDER BY trace_events DESC;

-- 6. 計算最近 7 天的每日平均氣溫與總降雨量
SELECT 
    s.station_name,
    DATE(h.monitor_date) as report_date,
    ROUND(AVG(CASE WHEN h.observation_id = 'TX01' THEN h.concentration_numeric END)::numeric, 2) as avg_temp,
    ROUND(SUM(CASE WHEN h.observation_id = 'PP01' THEN h.concentration_numeric END)::numeric, 2) as daily_rain_sum,
    COUNT(DISTINCT h.monitor_date) as hours_covered
FROM cwa_stations s
JOIN cwa_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '7 days'
GROUP BY s.station_name, DATE(h.monitor_date)
ORDER BY report_date DESC, s.station_name;

-- 7. 資料品質完整檢查
SELECT 
    observation_id,
    data_quality,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY observation_id), 2) as ratio_pct
FROM cwa_hourly_data
GROUP BY observation_id, data_quality
ORDER BY observation_id, data_quality;

-- 8. 搜尋特定時間點附近的異常風速 (WD01 > 10 m/s)
SELECT 
    s.station_name,
    h.monitor_date,
    h.concentration_numeric as wind_speed,
    h.period_start,
    h.period_end
FROM cwa_hourly_data h
JOIN cwa_stations s ON h.station_id = s.station_id
WHERE h.observation_id = 'WD01' 
  AND h.concentration_numeric > 10
ORDER BY h.concentration_numeric DESC;

-- 9. 空間查詢：找出離特定座標最近的 3 個氣象站 (PostGIS)
SELECT 
    station_name,
    ROUND(ST_Distance(
        location, 
        ST_SetSRID(ST_MakePoint(121.301, 24.993), 4326)::geography
    )::numeric / 1000, 2) as distance_km
FROM cwa_stations
ORDER BY location <-> ST_SetSRID(ST_MakePoint(121.301, 24.993), 4326)::geography
LIMIT 3;

-- 10. 隨機抽取 5 筆資料進行完整人工核對
SELECT * FROM cwa_hourly_data 
ORDER BY RANDOM() 
LIMIT 5;