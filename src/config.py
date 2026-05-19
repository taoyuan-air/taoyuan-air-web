COMMON_CONFIG = {
    # 桃園 6 個核心空品測站
    'target_stations': ['桃園', '中壢', '平鎮', '觀音', '大園', '龍潭'],
    # 時間滯後項
    'lag_hours': [1, 2, 24],
    # 桃園網格範圍
    'grid': {
        'min_lon': 120.98,
        'max_lon': 121.48,
        'min_lat': 24.78,
        'max_lat': 25.13,
        'grid_size_km': 3.0 # 固定切出 3KM * 3KM 的空間網格
    }
}