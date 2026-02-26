import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CARD_SPACING = 16;
const SIDE_SPACING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

interface StationData {
  name: string;
  type: string;
  pm25: number;
  o3: number;
  aqi: number;
  status: "GOOD" | "MODERATE" | "UNHEALTHY";
  trend: number[];
}

const STATIONS: StationData[] = [
  {
    name: "中壢",
    type: "交通測站",
    pm25: 18,
    o3: 42,
    aqi: 72,
    status: "MODERATE",
    trend: [0.4, 0.5, 0.6, 0.55, 0.7, 0.75],
  },
  {
    name: "龍潭",
    type: "一般測站",
    pm25: 15,
    o3: 38,
    aqi: 65,
    status: "MODERATE",
    trend: [0.3, 0.35, 0.4, 0.45, 0.5, 0.48],
  },
  {
    name: "觀音",
    type: "背景測站",
    pm25: 22,
    o3: 45,
    aqi: 78,
    status: "MODERATE",
    trend: [0.5, 0.6, 0.65, 0.7, 0.68, 0.72],
  },
  {
    name: "大園",
    type: "一般測站",
    pm25: 12,
    o3: 35,
    aqi: 58,
    status: "GOOD",
    trend: [0.25, 0.3, 0.28, 0.32, 0.35, 0.33],
  },
  {
    name: "桃園",
    type: "一般測站",
    pm25: 20,
    o3: 48,
    aqi: 75,
    status: "MODERATE",
    trend: [0.45, 0.5, 0.55, 0.6, 0.58, 0.62],
  },
  {
    name: "平鎮",
    type: "一般測站",
    pm25: 16,
    o3: 40,
    aqi: 68,
    status: "MODERATE",
    trend: [0.35, 0.4, 0.42, 0.45, 0.48, 0.5],
  },
];

const TrendLine: React.FC<{ trend: number[] }> = ({ trend }) => {
  const width = 220;
  const height = 40;
  const points = trend.map((value, index) => ({
    x: (index / (trend.length - 1)) * width,
    y: height - value * height,
  }));

  const pathData = points.reduce((acc, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prevPoint = points[index - 1];
    const cpX = (prevPoint.x + point.x) / 2;
    return `${acc} Q ${cpX} ${prevPoint.y}, ${cpX} ${(prevPoint.y + point.y) / 2} Q ${cpX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  return (
    <Svg width={width} height={height} style={styles.trendSvg}>
      <Path
        d={pathData}
        stroke="#7FAE8A"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const StationCard: React.FC<{ station: StationData }> = ({ station }) => {
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
            <Text style={styles.stationName}>{station.name}</Text>
            <Text style={styles.updateTime}>Updated 10:37</Text>
          </View>

          <View style={styles.stationTypeRow}>
            <Feather name="radio" size={13} color="#7FAE8A" />
            <Text style={styles.stationType}>{station.type}</Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>PM2.5</Text>
              <Text style={[styles.metricValue, { color: "#504E4F" }]}>
                {station.pm25}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>O3</Text>
              <Text style={[styles.metricValue, { color: "#504E4F" }]}>
                {station.o3}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>AQI</Text>
              <Text style={[styles.metricValue, { color: "#7FAE8A" }]}>
                {station.aqi}
              </Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.statusBadge, { color: "#7FAE8A" }]}>
              {station.status}
            </Text>
            <Text style={styles.trendLabel}>24h Trend</Text>
          </View>

          <View style={styles.trendContainer}>
            <TrendLine trend={station.trend} />
          </View>
        </View>
      </BlurView>
    </View>
  );
};

export const StationCarousel: React.FC = () => {
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const autoPlayInterval = useRef<NodeJS.Timeout | null>(null);
  const currentIndex = useRef(1);

  const infiniteStations = [
    STATIONS[STATIONS.length - 1],
    ...STATIONS,
    STATIONS[0],
  ];

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x: CARD_WIDTH + CARD_SPACING,
        animated: false,
      });
    }, 0);
    startAutoPlay();
    return () => stopAutoPlay();
  }, []);

  const startAutoPlay = () => {
    stopAutoPlay();
    autoPlayInterval.current = setInterval(() => {
      currentIndex.current = currentIndex.current + 1;
      scrollViewRef.current?.scrollTo({
        x: currentIndex.current * (CARD_WIDTH + CARD_SPACING),
        animated: true,
      });
    }, 4000);
  };

  const stopAutoPlay = () => {
    if (autoPlayInterval.current) {
      clearInterval(autoPlayInterval.current);
    }
  };

  const handleMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    currentIndex.current = index;

    if (index === 0) {
      setTimeout(() => {
        currentIndex.current = STATIONS.length;
        scrollViewRef.current?.scrollTo({
          x: STATIONS.length * (CARD_WIDTH + CARD_SPACING),
          animated: false,
        });
      }, 50);
    } else if (index === infiniteStations.length - 1) {
      setTimeout(() => {
        currentIndex.current = 1;
        scrollViewRef.current?.scrollTo({
          x: CARD_WIDTH + CARD_SPACING,
          animated: false,
        });
      }, 50);
    }

    startAutoPlay();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="center"
        contentContainerStyle={{ paddingHorizontal: SIDE_SPACING }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onScrollBeginDrag={stopAutoPlay}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {infiniteStations.map((station, index) => {
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
              key={`${station.name}-${index}`}
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
              <StationCard station={station} />
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {STATIONS.map((_, index) => {
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
    height: 40,
    justifyContent: "center",
  },
  trendSvg: {
    marginLeft: -10,
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
