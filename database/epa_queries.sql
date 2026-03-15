-- EPA 測站資料查詢範例

-- 1. 查看所有測站
SELECT * FROM epa_stations;

-- 2. 查看資料總筆數
SELECT 
    station_id,
    COUNT(*) as total_records,
    MIN(monitor_date) as earliest_date,
    MAX(monitor_date) as latest_date
FROM epa_hourly_data
GROUP BY station_id
ORDER BY station_id;

-- 3. 查看最新的空氣品質資料（所有測站）
SELECT * FROM epa_latest_data
ORDER BY monitor_date DESC, station_id
LIMIT 50;

-- 4. 查看特定測站的最新資料（桃園站）
SELECT 
    monitor_date,
    pollutant_eng_name,
    concentration_numeric,
    unit
FROM epa_hourly_data
WHERE station_id = '17'
    AND monitor_date >= NOW() - INTERVAL '24 hours'
ORDER BY monitor_date DESC, pollutant_eng_name;

-- 5. 查看 PM2.5 的時間序列（最近7天）
SELECT 
    s.station_name,
    h.monitor_date,
    h.concentration_numeric as pm25
FROM epa_stations s
JOIN epa_hourly_data h ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
    AND h.monitor_date >= NOW() - INTERVAL '7 days'
    AND h.concentration_numeric IS NOT NULL
ORDER BY h.monitor_date DESC, s.station_name;

-- 6. 計算各測站的 PM2.5 平均值（最近30天）
SELECT 
    s.station_name,
    ROUND(AVG(h.concentration_numeric)::numeric, 2) as avg_pm25,
    ROUND(MIN(h.concentration_numeric)::numeric, 2) as min_pm25,
    ROUND(MAX(h.concentration_numeric)::numeric, 2) as max_pm25,
    COUNT(*) as data_count
FROM epa_stations s
JOIN epa_hourly_data h ON s.station_id = h.station_id
WHERE h.pollutant_eng_name = 'PM2.5'
    AND h.monitor_date >= NOW() - INTERVAL '30 days'
    AND h.concentration_numeric IS NOT NULL
GROUP BY s.station_name
ORDER BY avg_pm25 DESC;

-- 7. 查看資料品質統計
SELECT 
    station_id,
    data_quality,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY station_id), 2) as percentage
FROM epa_hourly_data
GROUP BY station_id, data_quality
ORDER BY station_id, data_quality;

-- 8. 查看各污染物的最新值（所有測站）
SELECT 
    s.station_name,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM2.5' THEN h.concentration_numeric END) as pm25,
    MAX(CASE WHEN h.pollutant_eng_name = 'PM10' THEN h.concentration_numeric END) as pm10,
    MAX(CASE WHEN h.pollutant_eng_name = 'O3' THEN h.concentration_numeric END) as o3,
    MAX(CASE WHEN h.pollutant_eng_name = 'CO' THEN h.concentration_numeric END) as co,
    MAX(CASE WHEN h.pollutant_eng_name = 'SO2' THEN h.concentration_numeric END) as so2,
    MAX(CASE WHEN h.pollutant_eng_name = 'NO2' THEN h.concentration_numeric END) as no2,
    MAX(h.monitor_date) as latest_time
FROM epa_stations s
JOIN epa_hourly_data h ON s.station_id = h.station_id
WHERE h.monitor_date >= NOW() - INTERVAL '2 hours'
GROUP BY s.station_name
ORDER BY s.station_name;

-- 9. 查看每小時的平均 PM2.5（最近24小時）
SELECT 
    DATE_TRUNC('hour', monitor_date) as hour,
    ROUND(AVG(concentration_numeric)::numeric, 2) as avg_pm25,
    COUNT(DISTINCT station_id) as station_count
FROM epa_hourly_data
WHERE pollutant_eng_name = 'PM2.5'
    AND monitor_date >= NOW() - INTERVAL '24 hours'
    AND concentration_numeric IS NOT NULL
GROUP BY DATE_TRUNC('hour', monitor_date)
ORDER BY hour DESC;

-- 10. 查看測站之間的距離（使用 PostGIS）
SELECT 
    a.station_name as station_a,
    b.station_name as station_b,
    ROUND(ST_Distance(
        ST_Transform(a.location, 3857),
        ST_Transform(b.location, 3857)
    )::numeric / 1000, 2) as distance_km
FROM epa_stations a
CROSS JOIN epa_stations b
WHERE a.station_id < b.station_id
ORDER BY distance_km;
