-- 1. 查看網格點位基本資料
SELECT grid_id, latitude, longitude, ST_AsText(location) as geom_wkt
FROM teds_grid_points
LIMIT 50;

-- 2. 統計各污染物的總筆數與排放量概況
SELECT 
    observation_id,
    COUNT(*) as total_grids,
    ROUND(SUM(emission_value)::numeric, 4) as total_emissions,
    ROUND(AVG(emission_value)::numeric, 6) as avg_emission,
    MAX(emission_value) as max_value
FROM teds_grid_emission_data
GROUP BY observation_id
ORDER BY total_grids DESC;

-- 3. 隨機抽查一個網格的所有 10 個測項
SELECT 
    p.grid_id,
    p.latitude,
    p.longitude,
    d.observation_id,
    d.emission_value
FROM teds_grid_points p
JOIN teds_grid_emission_data d ON p.grid_id = d.grid_id
WHERE p.grid_id = (SELECT grid_id FROM teds_grid_points OFFSET floor(random() * (SELECT count(*) FROM teds_grid_points)) LIMIT 1);

-- 4. 尋找「桃園地區」排放熱點 (以 PM2.5 為例)
SELECT 
    p.grid_id,
    p.latitude,
    p.longitude,
    d.emission_value as pm25_value
FROM teds_grid_points p
JOIN teds_grid_emission_data d ON p.grid_id = d.grid_id
WHERE d.observation_id = 'PM25'
  AND p.latitude BETWEEN 24.8 AND 25.1
  AND p.longitude BETWEEN 121.1 AND 121.4
ORDER BY d.emission_value DESC
LIMIT 20;

-- 5. 查看微量污染物 (如 PB 鉛) 的非零分佈
SELECT 
    p.grid_id,
    p.latitude,
    p.longitude,
    d.emission_value as pb_value
FROM teds_grid_points p
JOIN teds_grid_emission_data d ON p.grid_id = d.grid_id
WHERE d.observation_id = 'PB'
  AND d.emission_value > 0
ORDER BY d.emission_value DESC
LIMIT 20;

-- 6. 寬表視圖：查看特定網格的各項污染物對照 
SELECT 
    p.grid_id,
    p.latitude,
    p.longitude,
    MAX(CASE WHEN d.observation_id = 'PM25' THEN d.emission_value END) as pm25,
    MAX(CASE WHEN d.observation_id = 'NOX'  THEN d.emission_value END) as nox,
    MAX(CASE WHEN d.observation_id = 'SOX'  THEN d.emission_value END) as sox,
    MAX(CASE WHEN d.observation_id = 'CO'   THEN d.emission_value END) as co,
    MAX(CASE WHEN d.observation_id = 'PB'   THEN d.emission_value END) as pb
FROM teds_grid_points p
JOIN teds_grid_emission_data d ON p.grid_id = d.grid_id
GROUP BY p.grid_id, p.latitude, p.longitude
LIMIT 10;

-- 7. 空間查詢：找出距離特定座標最近的網格 
SELECT 
    grid_id,
    latitude,
    longitude,
    ROUND(ST_Distance(
        location, 
        ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)
    )::numeric, 5) as distance_deg
FROM teds_grid_points
ORDER BY location <-> ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)
LIMIT 5;

-- 8. 統計資料庫中「零排放」與「有排放」的比例
SELECT 
    observation_id,
    SUM(CASE WHEN emission_value = 0 THEN 1 ELSE 0 END) as zero_count,
    SUM(CASE WHEN emission_value > 0 THEN 1 ELSE 0 END) as non_zero_count,
    ROUND(SUM(CASE WHEN emission_value > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as non_zero_percentage
FROM teds_grid_emission_data
GROUP BY observation_id;

-- 9. 檢查座標重複性
SELECT latitude, longitude, COUNT(*) 
FROM teds_grid_points 
GROUP BY latitude, longitude 
HAVING COUNT(*) > 1;

