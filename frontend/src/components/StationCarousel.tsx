import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CARD_SPACING = 16;
const SIDE_SPACING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

interface DistrictData {
  name: string;
  region: string;
  pm25: number;
  o3: number;
  aqi: number;
  status: "GOOD" | "MODERATE" | "UNHEALTHY";
  trend: number[];
}

const DISTRICTS: DistrictData[] = [
  {
    name: "桃園區",
    region: "北桃園",
    pm25: 20,
    o3: 48,
    aqi: 75,
    status: "MODERATE",
    trend: [0.45, 0.5, 0.55, 0.6, 0.58, 0.62, 0.48, 0.52, 0.65, 0.42, 0.38, 0.55, 0.68, 0.45, 0.52],
  },
  {
    name: "中壢區",
    region: "北桃園",
    pm25: 18,
    o3: 42,
    aqi: 72,
    status: "MODERATE",
    trend: [0.4, 0.5, 0.6, 0.55, 0.7, 0.75, 0.42, 0.38, 0.65, 0.58, 0.48, 0.72, 0.35, 0.62, 0.68],
  },
  {
    name: "八德區",
    region: "北桃園",
    pm25: 16,
    o3: 40,
    aqi: 68,
    status: "MODERATE",
    trend: [0.35, 0.4, 0.42, 0.45, 0.48, 0.5, 0.38, 0.32, 0.46, 0.52, 0.44, 0.36, 0.48, 0.42, 0.38],
  },
  {
    name: "龜山區",
    region: "北桃園",
    pm25: 19,
    o3: 44,
    aqi: 73,
    status: "MODERATE",
    trend: [0.42, 0.48, 0.52, 0.58, 0.55, 0.6, 0.45, 0.38, 0.62, 0.48, 0.52, 0.58, 0.44, 0.56, 0.5],
  },
  {
    name: "蘆竹區",
    region: "北桃園",
    pm25: 14,
    o3: 36,
    aqi: 62,
    status: "MODERATE",
    trend: [0.28, 0.32, 0.35, 0.4, 0.38, 0.42, 0.25, 0.3, 0.45, 0.35, 0.28, 0.38, 0.32, 0.36, 0.3],
  },
  {
    name: "大園區",
    region: "北桃園",
    pm25: 12,
    o3: 35,
    aqi: 58,
    status: "GOOD",
    trend: [0.25, 0.3, 0.28, 0.32, 0.35, 0.33, 0.22, 0.26, 0.38, 0.3, 0.24, 0.32, 0.28, 0.34, 0.26],
  },
  {
    name: "大溪區",
    region: "北桃園",
    pm25: 13,
    o3: 37,
    aqi: 60,
    status: "GOOD",
    trend: [0.26, 0.31, 0.29, 0.34, 0.36, 0.35, 0.24, 0.28, 0.38, 0.32, 0.26, 0.34, 0.3, 0.36, 0.28],
  },
  {
    name: "平鎮區",
    region: "南桃園",
    pm25: 16,
    o3: 40,
    aqi: 68,
    status: "MODERATE",
    trend: [0.35, 0.4, 0.42, 0.45, 0.48, 0.5, 0.32, 0.38, 0.52, 0.44, 0.36, 0.46, 0.4, 0.48, 0.42],
  },
  {
    name: "楊梅區",
    region: "南桃園",
    pm25: 17,
    o3: 41,
    aqi: 70,
    status: "MODERATE",
    trend: [0.38, 0.43, 0.45, 0.48, 0.5, 0.52, 0.35, 0.4, 0.55, 0.46, 0.38, 0.48, 0.42, 0.5, 0.44],
  },
  {
    name: "龍潭區",
    region: "南桃園",
    pm25: 15,
    o3: 38,
    aqi: 65,
    status: "MODERATE",
    trend: [0.3, 0.35, 0.4, 0.45, 0.5, 0.48, 0.28, 0.32, 0.46, 0.42, 0.34, 0.44, 0.38, 0.46, 0.4],
  },
  {
    name: "觀音區",
    region: "南桃園",
    pm25: 22,
    o3: 45,
    aqi: 78,
    status: "MODERATE",
    trend: [0.5, 0.6, 0.65, 0.7, 0.68, 0.72, 0.48, 0.55, 0.75, 0.62, 0.58, 0.68, 0.52, 0.7, 0.64],
  },
  {
    name: "新屋區",
    region: "南桃園",
    pm25: 21,
    o3: 43,
    aqi: 76,
    status: "MODERATE",
    trend: [0.48, 0.55, 0.62, 0.68, 0.65, 0.7, 0.45, 0.52, 0.72, 0.58, 0.5, 0.65, 0.48, 0.68, 0.6],
  },
  {
    name: "復興區",
    region: "南桃園",
    pm25: 10,
    o3: 32,
    aqi: 52,
    status: "GOOD",
    trend: [0.2, 0.25, 0.22, 0.28, 0.3, 0.26, 0.18, 0.24, 0.32, 0.26, 0.22, 0.28, 0.24, 0.3, 0.22],
  },
];

// 各區域的大概座標
const DISTRICT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "桃園區": { latitude: 24.9936, longitude: 121.3010 },
  "中壢區": { latitude: 24.9539, longitude: 121.2248 },
  "八德區": { latitude: 24.9440, longitude: 121.2970 },
  "龜山區": { latitude: 25.0026, longitude: 121.3540 },
  "蘆竹區": { latitude: 25.0442, longitude: 121.2918 },
  "大園區": { latitude: 25.0608, longitude: 121.2006 },
  "大溪區": { latitude: 24.8838, longitude: 121.2681 },
  "平鎮區": { latitude: 24.9530, longitude: 121.2017 },
  "楊梅區": { latitude: 24.9175, longitude: 121.1460 },
  "龍潭區": { latitude: 24.8635, longitude: 121.2168 },
  "觀音區": { latitude: 25.0354, longitude: 121.0823 },
  "新屋區": { latitude: 24.9697, longitude: 121.1063 },
  "復興區": { latitude: 24.8186, longitude: 121.3496 },
};

// 計算兩點間距離的函數
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // 地球半徑 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// 找到最近的區域
const findNearestDistrict = (userLat: number, userLon: number): string => {
  let nearestDistrict = "中壢區"; // 預設值
  let minDistance = Infinity;

  Object.entries(DISTRICT_COORDINATES).forEach(([district, coords]) => {
    const distance = calculateDistance(userLat, userLon, coords.latitude, coords.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestDistrict = district;
    }
  });

  return nearestDistrict;
};

// 定位相關的 hook
const useUserLocation = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [permission, setPermission] = useState<Location.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = async () => {
    setIsLoading(true);
    try {
      // 請求定位權限
      let { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status);
      
      if (status !== 'granted') {
        Alert.alert(
          '定位權限',
          '需要定位權限來顯示您附近的空氣品質資訊',
          [{ text: '確定', style: 'default' }]
        );
        return;
      }

      // 獲取當前位置
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(location);
    } catch (error) {
      console.error('獲取定位失敗:', error);
      Alert.alert('定位失敗', '無法獲取您的位置，將使用預設區域');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  return { location, permission, isLoading, requestLocation };
};

const TrendBars: React.FC<{ trend: number[] }> = ({ trend }) => {
  // 獲取當前時間並生成時間標籤
  const getCurrentTimeLabels = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const labels = [];
    const times = [];
    
    // 生成過去5個整點時間（歷史數據）
    for (let i = 5; i >= 1; i--) {
      const pastHour = currentHour - i;
      const hour = pastHour < 0 ? pastHour + 24 : pastHour;
      times.push(hour);
      labels.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    
    // 當前時間
    times.push(currentHour);
    labels.push(`${currentHour.toString().padStart(2, '0')}:00 NOW`);
    
    // 生成未來5個整點時間（預測數據）
    for (let i = 1; i <= 5; i++) {
      const futureHour = (currentHour + i) % 24;
      times.push(futureHour);
      labels.push(`${futureHour.toString().padStart(2, '0')}:00`);
    }
    
    return { labels, times };
  };

  // 根據數值決定顏色
  const getBarColor = (value: number, isPrediction: boolean = false) => {
    let baseColor;
    if (value <= 0.3) baseColor = 'rgba(106, 190, 116'; // 綠色 - 低
    else if (value <= 0.5) baseColor = 'rgba(255, 193, 7'; // 黃色 - 一般
    else if (value <= 0.7) baseColor = 'rgba(255, 87, 34'; // 紅色 - 高
    else baseColor = 'rgba(156, 39, 176'; // 紫色 - 很高
    
    // 預測數據使用更透明的樣式
    const opacity = isPrediction ? ', 0.5)' : ', 0.8)';
    return baseColor + opacity;
  };

  const maxHeight = 56;  // 從48增加到56 (+17%)
  const barWidth = 12;   // 從10增加到12 (+20%)
  const barSpacing = 6;  // 從5增加到6 (+20%)
  const { labels } = getCurrentTimeLabels();
  
  // 使用前11個數據點（5個歷史 + 1個當前 + 5個預測）
  const displayData = trend.slice(0, 11);
  const totalWidth = displayData.length * (barWidth + barSpacing) - barSpacing;

  return (
    <View style={styles.trendBarsWrapper}>
      {/* 柱狀圖 */}
      <View style={[styles.trendBarsContainer, { width: totalWidth }]}>
        {displayData.map((value, index) => {
          const barHeight = Math.max(5, value * maxHeight); // 最小高度從4增加到5
          const isPrediction = index > 5; // 索引大於5的是預測數據
          const isNow = index === 5; // 索引5是當前時間
          
          return (
            <View key={index} style={styles.barWrapper}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: barHeight,
                    width: barWidth,
                    backgroundColor: getBarColor(value, isPrediction),
                    marginRight: index < displayData.length - 1 ? barSpacing : 0,
                    borderWidth: isNow ? 1 : 0,
                    borderColor: isNow ? '#7FAE8A' : 'transparent',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      
      {/* 時間標籤 */}
      <View style={styles.timeLabelsContainer}>
        {labels.slice(0, 11).map((label, index) => {
          const isNow = index === 5;
          const isPrediction = index > 5;
          
          return (
            <View 
              key={index} 
              style={[
                styles.timeLabelWrapper,
                { 
                  width: barWidth,
                  marginRight: index < displayData.length - 1 ? barSpacing : 0
                }
              ]}
            >
              <Text 
                style={[
                  styles.timeLabel,
                  isNow && styles.timeLabelNow,
                  isPrediction && styles.timeLabelPrediction
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {isNow ? 'NOW' : label.replace(':00', '')}
              </Text>
              {isNow && (
                <View style={styles.nowIndicator} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const DistrictCard: React.FC<{ district: DistrictData }> = ({ district }) => {
  return (
    <View style={styles.cardContainer}>
      {/* Blobs inside card for blur effect */}
      <View style={styles.cardBlob1} />
      <View style={styles.cardBlob2} />

      <BlurView intensity={75} tint="light" style={styles.card}>
        {/* Glass Tint - clean and clear */}
        <View style={styles.glassTint} />
        <View style={styles.glassTintBrand} />

        {/* Edge Highlight - full card subtle glow */}
        <LinearGradient
          colors={[
            "rgba(255, 255, 255, 0.35)",
            "rgba(255, 255, 255, 0.08)",
            "transparent",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.edgeHighlight}
        />

        {/* Corner Light - subtle refraction */}
        <View style={styles.cornerLight} />

        {/* Inner Depth - top bright only */}
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.12)", "transparent"]}
          locations={[0, 0.4]}
          style={styles.innerDepth}
        />

        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <Text style={styles.stationName}>{district.name}</Text>
            <Text style={styles.updateTime}>Updated 10:37</Text>
          </View>

          <View style={styles.stationTypeRow}>
            <Feather name="map-pin" size={13} color="#7FAE8A" />
            <Text style={styles.stationType}>{district.region}</Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>PM2.5</Text>
              <Text style={[styles.metricValue, { color: "#504E4F" }]}>
                {district.pm25}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>O3</Text>
              <Text style={[styles.metricValue, { color: "#504E4F" }]}>
                {district.o3}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>AQI</Text>
              <Text style={[styles.metricValue, { color: "#7FAE8A" }]}>
                {district.aqi}
              </Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.statusBadge, { color: "#7FAE8A" }]}>
              {district.status}
            </Text>
            <Text style={styles.trendLabel}>24hr Trend</Text>
          </View>

          <View style={styles.trendContainer}>
            <TrendBars trend={district.trend} />
          </View>
        </View>
      </BlurView>
    </View>
  );
};

export const StationCarousel: React.FC = () => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const { location, permission, isLoading } = useUserLocation();
  const [defaultDistrict, setDefaultDistrict] = useState("中壢區");
  
  // 根據定位或預設值計算預設索引
  const defaultIndex = useMemo(() => {
    const index = DISTRICTS.findIndex(district => district.name === defaultDistrict);
    return index !== -1 ? index + 1 : 1; // +1 因為有無限滾動的前置項目
  }, [defaultDistrict]);
  
  const currentIndex = useRef(defaultIndex);

  const infiniteDistricts = [
    DISTRICTS[DISTRICTS.length - 1],
    ...DISTRICTS,
    DISTRICTS[0],
  ];

  // 當獲取到定位時，計算最近的區域
  useEffect(() => {
    if (location && permission === 'granted') {
      const nearest = findNearestDistrict(
        location.coords.latitude, 
        location.coords.longitude
      );
      setDefaultDistrict(nearest);
    }
  }, [location, permission]);

  // 初始化滾動位置
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x: defaultIndex * (CARD_WIDTH + CARD_SPACING),
        animated: false,
      });
      currentIndex.current = defaultIndex;
    }, 100);
  }, []);

  // 當 defaultIndex 改變時重新滾動到正確位置
  useEffect(() => {
    if (scrollViewRef.current && defaultIndex !== currentIndex.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: defaultIndex * (CARD_WIDTH + CARD_SPACING),
          animated: true, // 讓使用者看到滾動效果
        });
        currentIndex.current = defaultIndex;
      }, 200);
    }
  }, [defaultIndex]);

  const handleMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    currentIndex.current = index;

    // 處理無限滾動的邊界情況
    if (index === 0) {
      setTimeout(() => {
        currentIndex.current = DISTRICTS.length;
        scrollViewRef.current?.scrollTo({
          x: DISTRICTS.length * (CARD_WIDTH + CARD_SPACING),
          animated: false,
        });
      }, 50);
    } else if (index === infiniteDistricts.length - 1) {
      setTimeout(() => {
        currentIndex.current = 1;
        scrollViewRef.current?.scrollTo({
          x: CARD_WIDTH + CARD_SPACING,
          animated: false,
        });
      }, 50);
    }

    // 移除自動輪播重啟
    // startAutoPlay();
  };

  return (
    <View style={styles.container}>
      {/* 定位狀態提示 */}
      {isLoading && (
        <View style={styles.locationStatus}>
          <Feather name="map-pin" size={14} color="#7FAE8A" />
          <Text style={styles.locationStatusText}>正在獲取您的位置...</Text>
        </View>
      )}
      {permission === 'granted' && location && (
        <View style={styles.locationStatus}>
          <Feather name="check-circle" size={14} color="#7FAE8A" />
          <Text style={styles.locationStatusText}>已定位到 {defaultDistrict}</Text>
        </View>
      )}
      {permission === 'denied' && (
        <View style={styles.locationStatus}>
          <Feather name="map-pin" size={14} color="#999" />
          <Text style={styles.locationStatusTextGray}>使用預設區域：{defaultDistrict}</Text>
        </View>
      )}
      
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="start"
        contentContainerStyle={{ 
          paddingLeft: SIDE_SPACING,
          paddingRight: SIDE_SPACING,
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {infiniteDistricts.map((district, index) => {
          const inputRange = [
            (index - 1) * (CARD_WIDTH + CARD_SPACING),
            index * (CARD_WIDTH + CARD_SPACING),
            (index + 1) * (CARD_WIDTH + CARD_SPACING),
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.9, 1, 0.9],
            extrapolate: "clamp",
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [1, 1, 1],
            extrapolate: "clamp",
          });

          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [10, 0, 10],
            extrapolate: "clamp",
          });

          const shadowOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0, 0, 0],
            extrapolate: "clamp",
          });

          const shadowRadius = scrollX.interpolate({
            inputRange,
            outputRange: [0, 0, 0],
            extrapolate: "clamp",
          });

          const shadowOffset = scrollX.interpolate({
            inputRange,
            outputRange: [0, 0, 0],
            extrapolate: "clamp",
          });

          return (
            <Animated.View
              key={`${district.name}-${index}`}
              style={[
                styles.cardWrapper,
                {
                  transform: [{ scale }, { translateY }],
                  opacity,
                  // No shadow
                  shadowColor: "transparent",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0,
                  shadowRadius: 0,
                  elevation: 0,
                },
              ]}
            >
              <DistrictCard district={district} />
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {DISTRICTS.map((_, index) => {
          const realIndex = index + 1;
          const inputRange = [
            (realIndex - 1) * (CARD_WIDTH + CARD_SPACING),
            realIndex * (CARD_WIDTH + CARD_SPACING),
            (realIndex + 1) * (CARD_WIDTH + CARD_SPACING),
          ];

          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [6, 18, 6],
            extrapolate: "clamp",
          });

          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.25, 1, 0.25],
            extrapolate: "clamp",
          });

          return (
            <TouchableOpacity
              key={index}
              onPress={() => {
                currentIndex.current = index + 1;
                scrollViewRef.current?.scrollTo({
                  x: (index + 1) * (CARD_WIDTH + CARD_SPACING),
                  animated: true,
                });
              }}
            >
              <Animated.View
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: "#7FAE8A",
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 24,
    position: "relative",
  },
  locationStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 16,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(127, 174, 138, 0.2)",
  },
  locationStatusText: {
    fontSize: 12,
    color: "#7FAE8A",
    fontWeight: "500",
  },
  locationStatusTextGray: {
    fontSize: 12,
    color: "#999",
    fontWeight: "500",
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
  },
  cardContainer: {
    // No shadow here - only on wrapper
  },
  cardBlob1: {
    position: "absolute",
    top: 30,
    left: 20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(127, 174, 138, 0.38)",
    zIndex: 0,
  },
  cardBlob2: {
    position: "absolute",
    bottom: 40,
    right: 30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(168, 216, 227, 0.35)",
    zIndex: 0,
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.7)",
  },
  glassTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.32)",
  },
  glassTintBrand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(219, 239, 246, 0.12)",
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
  },
  cornerLight: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  innerDepth: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
  },
  cardInner: {
    paddingVertical: 20,
    paddingHorizontal: 30,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  stationName: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: "#1a2332",
  },
  updateTime: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: "400",
    color: "rgba(93, 115, 137, 0.7)",
  },
  stationTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 22,
  },
  stationType: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: "#7FAE8A",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    gap: 20,
  },
  metricItem: {
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    marginBottom: 6,
    fontWeight: "400",
    letterSpacing: 0.3,
    color: "rgba(93, 115, 137, 0.75)",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2c3036",
  },
  divider: {
    width: 1,
    height: 48,
    marginHorizontal: 2,
    backgroundColor: "rgba(93, 115, 137, 0.15)",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  trendLabel: {
    fontSize: 12,
    color: "rgba(93, 115, 137, 0.65)",
  },
  trendContainer: {
    height: 80,  // 從70增加到80以配合更大的柱狀圖
    justifyContent: "flex-end",
    alignItems: "center",
  },
  trendBarsWrapper: {
    alignItems: "center",
  },
  trendBarsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 56,  // 從48增加到56以配合柱狀高度
    marginBottom: 10,  // 稍微增加間距
  },
  trendBar: {
    borderRadius: 2,
  },
  barWrapper: {
    alignItems: "center",
  },
  timeLabelsContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    width: "100%",
  },
  timeLabelWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  timeLabel: {
    fontSize: 9,
    color: "rgba(93, 115, 137, 0.6)",
    fontWeight: "400",
    textAlign: "center",
  },
  timeLabelNow: {
    color: "#7FAE8A",
    fontWeight: "700",
    fontSize: 10,
  },
  timeLabelPrediction: {
    color: "rgba(93, 115, 137, 0.4)",
    fontStyle: "italic",
  },
  nowIndicator: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#7FAE8A",
    marginTop: 2,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
