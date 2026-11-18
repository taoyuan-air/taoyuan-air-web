CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cwa_stations (
    station_id VARCHAR(20) PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    county VARCHAR(50) NOT NULL,
    station_type VARCHAR(100) NOT NULL,
    location GEOMETRY(Point, 4326),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    altitude DECIMAL(8, 2),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cwa_observations (
    observation_id VARCHAR(20) PRIMARY KEY,
    observation_name VARCHAR(100) NOT NULL,
    unit VARCHAR(20),
    aggregation_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cwa_hourly_data (
    id BIGSERIAL,
    station_id VARCHAR(20) NOT NULL,
    monitor_date TIMESTAMP NOT NULL,
    observation_id VARCHAR(20) NOT NULL,
    concentration VARCHAR(20),
    concentration_numeric DECIMAL(10, 4),
    data_quality VARCHAR(10) DEFAULT 'good',
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    source VARCHAR(20) DEFAULT 'history',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, monitor_date),
    FOREIGN KEY (station_id) REFERENCES cwa_stations(station_id),
    FOREIGN KEY (observation_id) REFERENCES cwa_observations(observation_id),
    UNIQUE (station_id, monitor_date, observation_id)
) PARTITION BY RANGE (monitor_date);

CREATE TABLE IF NOT EXISTS cwa_hourly_data_default
    PARTITION OF cwa_hourly_data DEFAULT;

CREATE INDEX IF NOT EXISTS idx_cwa_hourly_station ON cwa_hourly_data(station_id);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_date ON cwa_hourly_data(monitor_date);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_observation ON cwa_hourly_data(observation_id);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_station_date ON cwa_hourly_data(station_id, monitor_date);
CREATE INDEX IF NOT EXISTS idx_cwa_hourly_quality ON cwa_hourly_data(data_quality);
CREATE INDEX IF NOT EXISTS idx_cwa_stations_location ON cwa_stations USING GIST(location);

INSERT INTO cwa_observations (observation_id, observation_name, unit, aggregation_type) VALUES
('PP01', 'precipitation', 'mm', 'hourly_acc'),
('PS01', 'pressure', 'hPa', '1min_inst'),
('RH01', 'relative_humidity', '%', '1min_inst'),
('TX01', 'temperature', 'C', '1min_inst'),
('WD01', 'wind_speed', 'm/s', '10min_mean'),
('WD02', 'wind_direction', 'degree', '10min_mean'),
('GR01', 'solar_radiation', 'MJ/m2', 'hourly_acc')
ON CONFLICT (observation_id) DO UPDATE SET
    observation_name = EXCLUDED.observation_name,
    unit = EXCLUDED.unit,
    aggregation_type = EXCLUDED.aggregation_type,
    updated_at = NOW();

INSERT INTO cwa_stations
    (station_id, station_name, county, station_type, latitude, longitude, altitude, address)
VALUES
('467050', 'Xinwu', 'Taoyuan', 'weather_station', 25.006725, 121.047492, 20.6, NULL),
('C1C510', 'Yangmei', 'Taoyuan', 'auto_station', 24.940081, 121.087161, 106.0, NULL),
('C0C800', 'Lala Mountain', 'Taoyuan', 'auto_station', 24.647330, 121.429300, 1167.0, NULL),
('C0C790', 'Baling', 'Taoyuan', 'auto_station', 24.828400, 121.408880, 858.0, NULL),
('C0C750', 'Xinhai', 'Taoyuan', 'auto_station', 25.006100, 121.097100, 72.0, NULL),
('C0C740', 'Guanyin Coast', 'Taoyuan', 'auto_station', 25.064764, 121.114856, 5.3, NULL),
('C0C730', 'Yong-an Fishing Port', 'Taoyuan', 'auto_station', 24.966126, 121.008581, 5.0, NULL),
('C0C720', 'Zhuwei', 'Taoyuan', 'auto_station', 25.112692, 121.239824, 21.0, NULL),
('C0C710', 'Sanmin', 'Taoyuan', 'auto_station', 24.892936, 121.324975, 143.0, NULL),
('C0C700', 'Zhongli', 'Taoyuan', 'auto_station', 24.977661, 121.256375, 151.0, NULL),
('C0C680', 'Guishan', 'Taoyuan', 'auto_station', 25.028460, 121.386560, 228.0, NULL),
('C0C670', 'Longtan', 'Taoyuan', 'auto_station', 24.870056, 121.221389, 250.0, NULL),
('C0C660', 'Hukou', 'Taoyuan', 'auto_station', 24.912375, 121.143047, 176.0, NULL),
('C0C650', 'Pingzhen', 'Taoyuan', 'auto_station', 24.897503, 121.214636, 208.0, NULL),
('C0C630', 'Sanmin Local', 'Taoyuan', 'auto_station', 24.882853, 121.265547, 209.0, NULL),
('C0C620', 'Luzhu', 'Taoyuan', 'auto_station', 25.084275, 121.265767, 19.0, NULL),
('C0C490', 'Bade', 'Taoyuan', 'auto_station', 24.928708, 121.283289, 157.0, NULL),
('C0C460', 'Fuxing', 'Taoyuan', 'auto_station', 24.820208, 121.352281, 482.0, NULL),
('72C440', 'Taoyuan Agriculture', 'Taoyuan', 'agri_station', 24.950944, 121.030583, 70.0, NULL),
('82C160', 'Xinwu Agriculture', 'Taoyuan', 'agri_station', 24.908472, 121.185333, 195.0, NULL),
('A2C560', 'Zhongli Agriculture', 'Taoyuan', 'agri_station', 24.985917, 121.239833, 121.0, NULL),
('C2C410', 'Yangmei Agriculture', 'Taoyuan', 'agri_station', 24.967652, 121.185165, 129.0, NULL),
('C2C590', 'Guanyin Agriculture', 'Taoyuan', 'agri_station', 25.027072, 121.153317, 72.0, NULL)
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    station_type = EXCLUDED.station_type,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    altitude = EXCLUDED.altitude,
    address = EXCLUDED.address,
    updated_at = NOW();

UPDATE cwa_stations
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE longitude IS NOT NULL AND latitude IS NOT NULL;
