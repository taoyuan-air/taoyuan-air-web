-- 1. 查看前 20 筆點源基本資訊（工廠名稱、地址、座標、煙囪高度）
SELECT serial_no, c_no, comp_nam, comp_kind1, latitude, longitude, stack_height
FROM teds_stations
LIMIT 20;

-- 2. 統計全台點源各項污染物的總排放量（由大到小排序）
-- 用來確認哪些污染物是主要的工業排放來源
SELECT 
    observation_id,
    COUNT(DISTINCT station_id) as total_factories,
    ROUND(SUM(emission_value)::numeric, 4) as total_tons_per_year,
    ROUND(AVG(emission_value)::numeric, 6) as avg_factory_emission,
    MAX(emission_value) as max_single_source
FROM teds_emission_data
GROUP BY observation_id
ORDER BY total_tons_per_year DESC;

-- 3. 查詢特定工廠的所有排放數據 (以工廠名稱模糊搜尋)
-- 檢查特定企業（如「台積電」或「中油」）的排放狀況
SELECT 
    s.comp_nam,
    s.comp_kind1,
    d.observation_id,
    d.emission_value,
    d.data_quality
FROM teds_stations s
JOIN teds_emission_data d ON s.station_id = d.station_id
WHERE s.comp_nam LIKE '%中油%'
ORDER BY d.emission_value DESC;

-- 4. 寬表視圖：查看工廠的污染物排放清單 (Pivot 格式)
-- 像 Excel 一樣橫向比對 PM2.5, NOX, SOX 等數值
SELECT 
    s.comp_nam,
    s.stack_height,
    MAX(CASE WHEN d.observation_id = 'PM25' THEN d.emission_value END) as pm25,
    MAX(CASE WHEN d.observation_id = 'NOX'  THEN d.emission_value END) as nox,
    MAX(CASE WHEN d.observation_id = 'SOX'  THEN d.emission_value END) as sox,
    MAX(CASE WHEN d.observation_id = 'CO'   THEN d.emission_value END) as co,
    MAX(CASE WHEN d.observation_id = 'PB'   THEN d.emission_value END) as pb
FROM teds_stations s
JOIN teds_emission_data d ON s.station_id = d.station_id
GROUP BY s.station_id, s.comp_nam, s.stack_height
LIMIT 15;

-- 5. 尋找「桃園地區」的高排放煙囪 (以 NOX 氮氧化物為例)
SELECT 
    comp_nam,
    stack_height,
    latitude,
    longitude,
    emission_value as nox_tons
FROM teds_stations s
JOIN teds_emission_data d ON s.station_id = d.station_id
WHERE d.observation_id = 'NOX'
  AND s.latitude BETWEEN 24.8 AND 25.1
  AND s.longitude BETWEEN 121.1 AND 121.4
ORDER BY d.emission_value DESC
LIMIT 20;

-- 6. 統計不同行業別 (comp_kind1) 的排放總量
-- 看看哪種產業是特定污染物的排放大戶
SELECT 
    comp_kind1,
    observation_id,
    COUNT(*) as source_count,
    ROUND(SUM(emission_value)::numeric, 2) as total_emi
FROM teds_stations s
JOIN teds_emission_data d ON s.station_id = d.station_id
WHERE observation_id IN ('PM25', 'NOX', 'SOX')
GROUP BY comp_kind1, observation_id
ORDER BY total_emi DESC
LIMIT 20;

-- 7. 檢查資料品質分布 (Good vs Invalid)
-- 驗證 Python 腳本中 safe_float 處理後的標記結果
SELECT 
    data_quality,
    COUNT(*) as record_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM teds_emission_data
GROUP BY data_quality;

-- 8. 空間查詢：找出距離特定座標（如中央大學）5 公里內的工廠 (使用 PostGIS)
-- 假設中大座標為 (121.192, 24.968)
SELECT 
    comp_nam,
    stack_height,
    ROUND(ST_Distance(
        location::geography, 
        ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)::geography
    )::numeric / 1000, 2) as distance_km
FROM teds_stations
WHERE ST_DWithin(
    location::geography, 
    ST_SetSRID(ST_MakePoint(121.192, 24.968), 4326)::geography, 
    5000 -- 5000 公尺
)
ORDER BY distance_km;

-- 9. 檢查是否有重複的 Serial No
SELECT serial_no, COUNT(*) 
FROM teds_stations 
GROUP BY serial_no 
HAVING COUNT(*) > 1;

-- 10. 找出「有鉛 (PB) 排放」且煙囪高度大於 20 公尺的工廠
-- 這通常是環境評估（EIA）會關注的對象
SELECT 
    s.comp_nam,
    s.stack_height,
    d.emission_value as pb_value
FROM teds_stations s
JOIN teds_emission_data d ON s.station_id = d.station_id
WHERE d.observation_id = 'PB'
  AND d.emission_value > 0
  AND s.stack_height > 20
ORDER BY pb_value DESC;