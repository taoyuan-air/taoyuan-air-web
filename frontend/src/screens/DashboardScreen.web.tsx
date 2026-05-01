import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useStore } from "../store";
import { getMeta, getGrid, getAlerts, getEvents, setScenario } from "../api";
import { fetchEpaStations } from "../api/epa";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { DashboardScreenMobile } from "./DashboardScreenMobile";
import { Layout, screenWidth } from '../styles/responsive';

const CWA_API_KEY = process.env.EXPO_PUBLIC_CWA_API_KEY;

// ─── EPA / district maps ──────────────────────────────────────────────
const EPA_STATION_TO_DISTRICT: Record<string, string> = {
  中壢: "中壢區", 桃園: "桃園區", 大園: "大園區",
  觀音: "觀音區", 平鎮: "平鎮區", 龍潭: "龍潭區",
};

const DISTRICT_STATIC_AQ: Record<string, { pm25: number; o3: number; aqi: number }> = {
  桃園區: { pm25: 20, o3: 48, aqi: 75 }, 中壢區: { pm25: 18, o3: 42, aqi: 72 },
  八德區: { pm25: 16, o3: 40, aqi: 68 }, 龜山區: { pm25: 19, o3: 44, aqi: 73 },
  蘆竹區: { pm25: 14, o3: 36, aqi: 62 }, 大園區: { pm25: 12, o3: 35, aqi: 58 },
  大溪區: { pm25: 13, o3: 37, aqi: 60 }, 平鎮區: { pm25: 16, o3: 40, aqi: 68 },
  楊梅區: { pm25: 17, o3: 41, aqi: 70 }, 龍潭區: { pm25: 15, o3: 38, aqi: 65 },
  觀音區: { pm25: 22, o3: 45, aqi: 78 }, 新屋區: { pm25: 21, o3: 43, aqi: 76 },
  復興區: { pm25: 10, o3: 32, aqi: 52 },
};

// ─── District coordinates for geolocation ────────────────────────────
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

// ─── Calculate distance using Haversine formula ────────────────────
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─── Find nearest district based on coordinates ────────────────────
const findNearestDistrict = (userLat: number, userLon: number): string => {
  let nearestDistrict = "中壢區";
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

// ─── User location hook ────────────────────────────────────────────
const useUserLocation = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [permission, setPermission] = useState<Location.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = async () => {
    setIsLoading(true);
    try {
      // Request location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status);
      
      if (status !== "granted") {
        console.warn("位置權限被拒絕");
        setIsLoading(false);
        return;
      }

      // Get current position
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(location);
    } catch (error) {
      console.error("獲取定位失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  return { location, permission, isLoading, requestLocation };
};

// ─── Design tokens ────────────────────────────────────────────────────
const C = {
  // Primary accent — one rose ramp only
  rose:     "#D4567A",
  roseMid:  "#C2446A",
  roseLt:   "rgba(212,86,122,0.12)",
  roseGlow: "rgba(212,86,122,0.22)",
  roseBorder: "rgba(212,86,122,0.30)",

  // Functional data colors (minimal)
  sky:   "#5BA0C8",
  mint:  "#37A085",
  amber: "#B87820",

  // Glass layers
  glass:       "rgba(255,255,255,0.52)",
  glass2:      "rgba(255,255,255,0.32)",
  glassBorder: "rgba(255,255,255,0.72)",
  glassBorder2:"rgba(255,255,255,0.50)",
  glassShadow: "rgba(180,140,160,0.14)",
  glassInner:  "rgba(255,255,255,0.80)",

  // Text
  text:    "#1a1220",
  muted:   "#7a6880",
  hint:    "#b0a0b8",
};

// Page background gradient stops
const BG_COLORS: [string, string, string, string] = [
  "#fce8f0", "#f0eafc", "#e8f0fc", "#e8f5ef",
];

// ─── Gauge dimensions (desktop baseline) ──────────────────────────────
const GAUGE_SIZE   = 200;
const STROKE_W     = 11;
const GAUGE_R      = (GAUGE_SIZE - STROKE_W) / 2;
const GAUGE_CIRC   = 2 * Math.PI * GAUGE_R;

// ─── Helper: AQI → status label ───────────────────────────────────────
const getAQIStatus = (aqi: number) => {
  if (aqi <= 50)  return "良好";
  if (aqi <= 100) return "普通";
  if (aqi <= 150) return "敏感族群";
  if (aqi <= 200) return "不健康";
  return "危害";
};

const getPM25Color  = (v: number) => v <= 12 ? C.rose  : v <= 35 ? C.amber : C.roseMid;
const getO3Color    = (v: number) => v <= 54 ? C.mint  : C.amber;
const getNO2Color   = (v: number) => v <= 53 ? C.sky   : C.amber;

const getActivityInfo = (pm25: number) => {
  if (pm25 <= 12) return { icon: "activity" as const, advice: "空氣清新，非常適合戶外運動，盡情享受戶外活動！" };
  if (pm25 <= 35) return { icon: "user"     as const, advice: "當前 PM2.5 濃度適合戶外活動，敏感族群無需特殊防護。" };
  if (pm25 <= 55) return { icon: "shield"   as const, advice: "空氣品質普通，敏感族群建議減少長時間戶外活動。" };
  return              { icon: "alert-triangle" as const, advice: "空氣品質不佳，建議外出配戴口罩，敏感族群避免戶外活動。" };
};

const getWeatherIcon = (w: string): keyof typeof Feather.glyphMap => {
  if (w.includes("雷"))                        return "cloud-lightning";
  if (w.includes("大雨") || w.includes("豪雨")) return "cloud-rain";
  if (w.includes("雨") || w.includes("陣雨"))  return "cloud-drizzle";
  if (w.includes("陰") || w.includes("多雲"))  return "cloud";
  if (w.includes("晴"))                        return "sun";
  return "cloud";
};

// ─── Interfaces ───────────────────────────────────────────────────────
interface CurrentWeatherData {
  temperature: string; weather: string; humidity: string;
  windSpeed: string; dailyHigh: string; dailyLow: string;
}

interface ForecastDay {
  label: string; dateLabel: string; maxTemp: string;
  minTemp: string; weather: string; precipProb: string;
}

const MOCK_CURRENT: CurrentWeatherData = {
  temperature: "24", weather: "晴時多雲", humidity: "68",
  windSpeed: "2.5", dailyHigh: "28", dailyLow: "19",
};

const generateMockForecast = (): ForecastDay[] => {
  const DAY = ["日", "一", "二", "三", "四", "五", "六"];
  const now = new Date();
  return [1, 2, 3].map((i) => {
    const d = new Date(now); d.setDate(d.getDate() + i);
    return {
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      dateLabel: `週${DAY[d.getDay()]}`,
      maxTemp: String(28 - i), minTemp: String(19 + i),
      weather: i === 2 ? "短暫陣雨" : "晴",
      precipProb: i === 2 ? "60" : "10",
    };
  });
};

// ─── API functions (unchanged from original) ──────────────────────────
const fetchCurrentWeather = async (district: string): Promise<CurrentWeatherData> => {
  if (!CWA_API_KEY || CWA_API_KEY === "YOUR_CWA_API_KEY") return MOCK_CURRENT;
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${CWA_API_KEY}&CountyName=桃園市&format=JSON`;
  try {
    const res = await fetch(url); if (!res.ok) return MOCK_CURRENT;
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    if (!stations.length) return MOCK_CURRENT;
    const keyword = district.replace("區", "");
    const st = stations.find((s) => s.GeoInfo?.TownName?.includes(keyword)) ?? stations[0];
    const obs = st.WeatherElement ?? {};
    return {
      temperature: String(Math.round(parseFloat(obs.AirTemperature ?? MOCK_CURRENT.temperature))),
      weather:     obs.Weather ?? MOCK_CURRENT.weather,
      humidity:    obs.RelativeHumidity ?? MOCK_CURRENT.humidity,
      windSpeed:   obs.WindSpeed ?? MOCK_CURRENT.windSpeed,
      dailyHigh:   String(Math.round(parseFloat(obs.DailyExtreme?.DailyHigh?.TemperatureInfo?.AirTemperature ?? MOCK_CURRENT.dailyHigh))),
      dailyLow:    String(Math.round(parseFloat(obs.DailyExtreme?.DailyLow?.TemperatureInfo?.AirTemperature ?? MOCK_CURRENT.dailyLow))),
    };
  } catch { return MOCK_CURRENT; }
};

const WEATHER_SEVERITY: [string, number][] = [
  ["雷雨", 6], ["豪雨", 5], ["大雨", 4], ["短暫陣雨或雷雨", 4],
  ["短暫陣雨", 3], ["陣雨", 3], ["有雨", 3], ["陰", 2], ["多雲", 1], ["晴", 0],
];
const pickDayWeather = (wxTimes: any[]): string => {
  const pool = wxTimes.filter((t) => { const h = parseInt((t.StartTime ?? "").slice(11, 13), 10); return h >= 6 && h < 21; });
  const src   = pool.length ? pool : wxTimes;
  let best = src[0]?.ElementValue?.[0]?.Weather ?? "晴", bestScore = -1;
  src.forEach((t) => { const w = t.ElementValue?.[0]?.Weather ?? ""; for (const [k, s] of WEATHER_SEVERITY) { if (w.includes(k) && s > bestScore) { bestScore = s; best = w; } } });
  return best;
};

const fetchWeatherForecast = async (district: string): Promise<{ days: ForecastDay[]; todayPrecipProb: string }> => {
  const mock = { days: generateMockForecast(), todayPrecipProb: "10" };
  if (!CWA_API_KEY || CWA_API_KEY === "YOUR_CWA_API_KEY") return mock;
  const DAY = ["日", "一", "二", "三", "四", "五", "六"];
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005?Authorization=${CWA_API_KEY}&LocationsName=桃園市&LocationName=${district}&format=JSON`;
  try {
    const res = await fetch(url); if (!res.ok) return mock;
    const json = await res.json();
    const loc = (json?.records?.Locations?.[0]?.Location ?? []).find((l: any) => l.LocationName === district) ?? (json?.records?.Locations?.[0]?.Location ?? [])[0];
    if (!loc) return mock;
    const em: Record<string, any[]> = {};
    (loc.WeatherElement ?? []).forEach((el: any) => { em[el.ElementName] = el.Time ?? []; });
    const tempTimes = em["溫度"] ?? [], wxTimes = em["天氣現象"] ?? [], popTimes = em["3小時降雨機率"] ?? [];
    const dayMaxPop = (ds: string) => { const v = popTimes.filter((t) => (t.StartTime ?? "").startsWith(ds)).map((t) => parseInt(t.ElementValue?.[0]?.ProbabilityOfPrecipitation ?? "0", 10)).filter((v) => !isNaN(v)); return v.length ? Math.max(...v) : null; };
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const days: ForecastDay[] = [1, 2, 3].map((i) => {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const temps = tempTimes.filter((t) => (t.DataTime ?? "").startsWith(ds)).map((t) => parseFloat(t.ElementValue?.[0]?.Temperature ?? "NaN")).filter((v) => !isNaN(v));
      return {
        label: `${d.getMonth() + 1}/${d.getDate()}`, dateLabel: `週${DAY[d.getDay()]}`,
        maxTemp: temps.length ? String(Math.max(...temps)) : String(28 - i),
        minTemp: temps.length ? String(Math.min(...temps)) : String(19 + i),
        precipProb: String(dayMaxPop(ds) ?? (i === 2 ? 60 : 10)),
        weather: pickDayWeather(wxTimes.filter((t) => (t.StartTime ?? "").startsWith(ds))),
      };
    });
    return { days, todayPrecipProb: String(dayMaxPop(todayStr) ?? 10) };
  } catch { return mock; }
};

const fetchPast1hrRainfall = async (district: string): Promise<string> => {
  if (!CWA_API_KEY || CWA_API_KEY === "YOUR_CWA_API_KEY") return "0.0";
  try {
    const res = await fetch(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=${CWA_API_KEY}&format=JSON&RainfallElement=Past1hr`);
    if (!res.ok) return "0.0";
    const json = await res.json();
    const keyword = district.replace("區", "");
    const st = (json?.records?.Station ?? []).find((s: any) => s.GeoInfo?.TownName?.includes(keyword));
    return st?.RainfallElement?.Past1hr?.Precipitation ?? "0.0";
  } catch { return "0.0"; }
};

// ─── Sub-components ───────────────────────────────────────────────────

/** Frosted glass AQI ring */
const AQIGauge: React.FC<{ aqi: number }> = ({ aqi }) => {
  const pct     = Math.min(Math.max(aqi / 200, 0), 1);
  const offset  = GAUGE_CIRC * (1 - pct);
  const cx = GAUGE_SIZE / 2;
  const cy = GAUGE_SIZE / 2;
  return (
    <View style={{ width: GAUGE_SIZE, height: GAUGE_SIZE, justifyContent: "center", alignItems: "center" }}>
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} style={{ position: "absolute" }}>
        <Defs>
          <SvgLinearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#F48FB1" stopOpacity="1" />
            <Stop offset="100%" stopColor={C.rose}  stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        {/* track */}
        <Circle cx={cx} cy={cy} r={GAUGE_R} stroke={C.roseLt} strokeWidth={STROKE_W} fill="none" />
        {/* glow halo */}
        <Circle cx={cx} cy={cy} r={GAUGE_R} stroke={C.roseGlow} strokeWidth={STROKE_W + 6} fill="none"
          strokeDasharray={GAUGE_CIRC} strokeDashoffset={offset}
          transform={`rotate(-90, ${cx}, ${cy})`} />
        {/* main arc */}
        <Circle cx={cx} cy={cy} r={GAUGE_R} stroke="url(#rg)" strokeWidth={STROKE_W} fill="none"
          strokeDasharray={GAUGE_CIRC} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`} />
      </Svg>
      {/* inner frosted circle */}
      <View style={S.gaugeInner}>
        <Text style={S.gaugeLabel}>AQI</Text>
        <Text style={S.gaugeValue}>{aqi}</Text>
        <View style={S.gaugePill}>
          <Text style={S.gaugePillText}>{getAQIStatus(aqi)}</Text>
        </View>
      </View>
    </View>
  );
};

/** Section label with rose accent bar */
const SecLabel: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <View style={S.secLabel}>
    <View style={S.secDot} />
    <View>
      <Text style={S.secTitle}>{title}</Text>
      {sub && <Text style={S.secSub}>{sub}</Text>}
    </View>
  </View>
);

/** Glass metric tile (2×2 grid) */
const MetricTile: React.FC<{ label: string; value: string; unit: string; color: string }> = ({ label, value, unit, color }) => (
  <View style={S.metricTile}>
    <Text style={S.mtLabel}>{label}</Text>
    <Text style={[S.mtValue, { color }]}>{value}</Text>
    <Text style={S.mtUnit}>{unit}</Text>
  </View>
);

/** Horizontal pollutant bar */
const PollBar: React.FC<{ name: string; nameEn: string; value: number; max: number; color: string }> = ({ name, nameEn, value, max, color }) => (
  <View style={S.pollRow}>
    <View style={S.pollNameCol}>
      <Text style={S.pollName}>{nameEn}</Text>
      <Text style={S.pollNameSub}>{name}</Text>
    </View>
    <View style={S.pollTrack}>
      <LinearGradient
        colors={[`${color}aa`, color]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[S.pollFill, { width: `${Math.min((value / max) * 100, 100)}%` }]}
      />
    </View>
    <Text style={[S.pollVal, { color }]}>{value}</Text>
  </View>
);

/** Frosted weather stat tile */
const WxStat: React.FC<{ icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <View style={S.wxStat}>
    <Feather name={icon} size={16} color={color} />
    <Text style={S.wxStatLabel}>{label}</Text>
    <Text style={[S.wxStatValue, { color }]}>{value}</Text>
  </View>
);

/** Forecast day card */
const FcCard: React.FC<{ day: ForecastDay; highlight?: boolean }> = ({ day, highlight }) => {
  const isRain = Number(day.precipProb) >= 50;
  return (
    <View style={[S.fcCard, highlight && S.fcCardHi]}>
      <Text style={S.fcWeekday}>{day.dateLabel}</Text>
      <Text style={S.fcDate}>{day.label}</Text>
      <Feather name={getWeatherIcon(day.weather)} size={22} color={isRain ? C.sky : C.rose} style={{ marginVertical: 8 }} />
      <Text style={S.fcWeather}>{day.weather}</Text>
      <Text style={S.fcTemps}>{day.maxTemp}° / {day.minTemp}°</Text>
      <Text style={S.fcPop}>{day.precipProb}%</Text>
    </View>
  );
};

// ─── Main component ───────────────────────────────────────────────────
interface DashboardScreenProps { scrollRef?: (ref: any) => void; }

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ scrollRef }) => {
  const { width: windowWidth } = useWindowDimensions();

  // Only render on web viewports >= 768px; mobile uses DashboardScreenMobile.tsx
  if (windowWidth < Layout.breakpoints.mobile) return <DashboardScreenMobile/>;

  const isDesktop = screenWidth >= Layout.breakpoints.desktop;

  const dynStyles = {
    headerWrap:  { paddingHorizontal: isDesktop ? 48 : 28, paddingTop: 28 },
    chipsContent:{ paddingHorizontal: isDesktop ? 48 : 28, gap: 8 },
    grid:        { paddingHorizontal: isDesktop ? 48 : 28 },
    leftCol:     { width: isDesktop ? 260 : 230 },
    rightCol:    { width: isDesktop ? 260 : 230 },
    headerTitle: { fontSize: isDesktop ? 26 : 20 },
  };

  const { selectedScenario, setGridCells, setAlerts, setEvents, isLoading, setIsLoading } = useStore();
  const { location, permission } = useUserLocation();

  const [locatedAqi,   setLocatedAqi]   = useState(65);
  const [locatedPm25,  setLocatedPm25]  = useState(18);
  const [locatedO3,    setLocatedO3]    = useState(42);
  const [currentDistrict, setCurrentDistrict] = useState<string>('中壢區');
  const [currentWeather, setCurrentWeather] = useState<CurrentWeatherData>(MOCK_CURRENT);
  const [forecast,       setForecast]       = useState<ForecastDay[]>(generateMockForecast());
  const [past1hrRain,    setPast1hrRain]    = useState("0.0");
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(currentDistrict);

  const displayDistrict = selectedDistrict ?? currentDistrict;

  const districts = [
    "桃園區","中壢區","八德區","龜山區","蘆竹區","大園區",
    "大溪區","平鎮區","楊梅區","龍潭區","觀音區","新屋區","復興區",
  ];

  // Initialize currentDistrict based on user location
  useEffect(() => {
    if (location && permission === "granted") {
      const nearest = findNearestDistrict(
        location.coords.latitude,
        location.coords.longitude
      );
      setCurrentDistrict(nearest);
    }
  }, [location, permission]);

  useEffect(() => {
    if (currentDistrict && districts.includes(currentDistrict)) {
      setSelectedDistrict(currentDistrict);
    }
  }, [currentDistrict]);

  useEffect(() => {
    fetchCurrentWeather(displayDistrict).then(setCurrentWeather);
    fetchWeatherForecast(displayDistrict).then(({ days }) => setForecast(days));
    fetchPast1hrRainfall(displayDistrict).then(setPast1hrRain);
  }, [displayDistrict]);

  useEffect(() => {
    const s = DISTRICT_STATIC_AQ[displayDistrict];
    if (s) { setLocatedPm25(s.pm25); setLocatedO3(s.o3); setLocatedAqi(s.aqi); }
    fetchEpaStations().then((stations) => {
      const sitename = Object.entries(EPA_STATION_TO_DISTRICT).find(([, d]) => d === displayDistrict)?.[0];
      if (!sitename) return;
      const st = stations.find((s) => s.sitename === sitename);
      if (st) { setLocatedPm25(st.pm25); setLocatedO3(st.o3); setLocatedAqi(st.aqi || s?.aqi || 65); }
    }).catch(console.warn);
  }, [displayDistrict]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      setScenario(selectedScenario);
      const [, grid, alertsData, eventsData] = await Promise.all([getMeta(), getGrid({ pollutant: "PM25" }), getAlerts(), getEvents()]);
      setGridCells(grid); setAlerts(alertsData); setEvents(eventsData);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const pm25  = locatedPm25;
  const o3    = locatedO3;
  const no2   = Math.round(pm25 * 0.3);
  const activ = getActivityInfo(pm25);

  if (isLoading) {
    return (
        <View style={{  flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: '#FFF6F9' }}>
            <ActivityIndicator size="large" color={C.rose} />
            <Text style={S.loadingText}>載入中...</Text>
        </View>
    );
  }

  return (
  
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={[S.headerWrap, dynStyles.headerWrap]}>
          <View style={S.glassCard}>
            <View style={S.headerInner}>
              <View>
                <Text style={S.eyebrow}>桃園市環境監測系統</Text>
                <Text style={[S.headerTitle, dynStyles.headerTitle]}>空氣品質儀表板</Text>
                <Text style={S.headerSub}>Taoyuan Air Quality Dashboard</Text>
              </View>
              <View style={S.headerRight}>
                <View style={[S.badge, S.badgeRose]}>
                  <Feather name="clock" size={11} color={C.rose} />
                  <Text style={[S.badgeText, { color: C.rose }]}>
                    {new Date().toLocaleDateString("zh-TW", { weekday: "short", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={S.badge}>
                  <Feather name="map-pin" size={11} color={C.muted} />
                  <Text style={S.badgeText}>{displayDistrict}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── District chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.chipsScroll} contentContainerStyle={[S.chipsContent, dynStyles.chipsContent]}>
          {districts.map((d) => {
            const on = selectedDistrict === d;
            return (
              <TouchableOpacity key={d} onPress={() => setSelectedDistrict(on ? null : d)} activeOpacity={0.75}>
                <View style={[S.chip, on && S.chipOn]}>
                  <Text style={[S.chipText, on && S.chipTextOn]}>{d}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── 3-column grid ── */}
        <View style={[S.grid, dynStyles.grid]}>

          {/* LEFT */}
          <View style={[S.leftCol, dynStyles.leftCol]}>
            {/* AQI */}
            <View style={S.glassCard}>
              <SecLabel title="空氣品質指數" sub="Air Quality Index" />
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <AQIGauge aqi={locatedAqi} />
              </View>
              <Text style={S.aqiHint}>數值範圍 0–200，越低越好</Text>
            </View>

            {/* Activity advice */}
            <View style={S.glassCard}>
              <SecLabel title="活動建議" />
              <View style={S.adviceRow}>
                <View style={S.adviceIcon}>
                  <Feather name={activ.icon} size={18} color={C.rose} />
                </View>
                <Text style={S.adviceText}>{activ.advice}</Text>
              </View>
            </View>
          </View>

          {/* MIDDLE */}
          <View style={S.midCol}>
            {/* Key metrics */}
            <View style={S.glassCard}>
              <SecLabel title="關鍵指標" sub={displayDistrict} />
              <View style={S.metrics2}>
                <MetricTile label="PM2.5"  value={String(pm25)} unit="μg/m³" color={getPM25Color(pm25)} />
                <MetricTile label="O₃ 臭氧" value={String(o3)}   unit="ppb"   color={getO3Color(o3)}    />
                <MetricTile label="NO₂"    value={String(no2)}  unit="ppb"   color={getNO2Color(no2)}  />
                <MetricTile label="濕度"    value={currentWeather.humidity} unit="%" color={C.amber}  />
              </View>
            </View>

            {/* Pollutant bars */}
            <View style={S.glassCard}>
              <SecLabel title="污染物詳情" sub="Pollutant Details" />
              <PollBar name="細懸浮微粒" nameEn="PM2.5" value={pm25} max={75}  color={getPM25Color(pm25)} />
              <PollBar name="臭氧"      nameEn="O₃"    value={o3}   max={100} color={getO3Color(o3)}    />
              <PollBar name="二氧化氮"  nameEn="NO₂"   value={no2}  max={100} color={getNO2Color(no2)}  />
            </View>

            {/* AI insight */}
            <View style={S.glassCard}>
              <SecLabel title="AI 趨勢分析" sub="Predictive Insights" />
              <View style={S.insightRow}>
                <View style={S.insightIcon}>
                  <Feather name="trending-down" size={15} color={C.rose} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.insightMain}>PM2.5 濃度預計下降</Text>
                  <Text style={S.insightSub}>未來 3 小時因海風輻合影響下降 12%</Text>
                </View>
                <View style={S.insightChip}>
                  <Text style={S.insightChipText}>−12%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* RIGHT */}
          <View style={[S.rightCol, dynStyles.rightCol]}>
            {/* Current weather */}
            <View style={S.glassCard}>
              <SecLabel title="當前天氣" sub="Current Weather" />
              <View style={S.wxHero}>
                <View>
                  <Text style={S.wxTemp}>{currentWeather.temperature}°</Text>
                  <Text style={S.wxDesc}>{currentWeather.weather}</Text>
                  <Text style={S.wxHL}>H {currentWeather.dailyHigh}° · L {currentWeather.dailyLow}°</Text>
                </View>
                <View style={S.wxIconCircle}>
                  <Feather name={getWeatherIcon(currentWeather.weather)} size={26} color={C.rose} />
                </View>
              </View>
              <View style={S.wxStats}>
                <WxStat icon="droplet"   label="濕度"    value={`${currentWeather.humidity}%`}    color={C.sky}  />
                <WxStat icon="wind"      label="風速"    value={`${currentWeather.windSpeed}m/s`} color={C.mint} />
                <WxStat icon="cloud-rain" label="近1hr" value={`${past1hrRain}mm`}               color={C.muted}/>
              </View>
            </View>

            {/* 3-day forecast */}
            <View style={S.glassCard}>
              <SecLabel title="三日預報" sub="3-Day Forecast" />
              <View style={S.fcRow}>
                {forecast.map((day, i) => <FcCard key={i} day={day} highlight={i === 1} />)}
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

  );
};

// ─── Styles ───────────────────────────────────────────────────────────
const GAP  = 14;
const BRAD = 18; // card border radius

// Shared glass card style
const glassCardBase: object = {
  backgroundColor:  C.glass,
  borderWidth:      1,
  borderColor:      C.glassBorder,
  borderRadius:     BRAD,
  padding:          20,
  // iOS shadow
  shadowColor:      C.glassShadow,
  shadowOffset:     { width: 0, height: 4 },
  shadowOpacity:    1,
  shadowRadius:     20,
  // Android elevation
  elevation:        4,
};

// Inner glass tile (metric tiles, wx stat, fc cards)
const glass2Base: object = {
  backgroundColor: C.glass2,
  borderWidth:     1,
  borderColor:     C.glassBorder2,
  borderRadius:    12,
  // subtle inner highlight via border
};

const S = StyleSheet.create({
  root:    { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 14, fontSize: 15, color: C.rose, fontWeight: "600" },

  // Header
  headerWrap:  { paddingHorizontal: 28, paddingTop: 28 },
  glassCard:   glassCardBase as any,
  headerInner: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  eyebrow:     { fontSize: 10, letterSpacing: 2.5, color: C.hint, textTransform: "uppercase", marginBottom: 5, fontFamily: "monospace" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: C.text, letterSpacing: -0.4 },
  headerSub:   { fontSize: 11, color: C.muted, letterSpacing: 1, marginTop: 3 },
  headerRight: { alignItems: "flex-end", gap: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: C.glass2, borderWidth: 1, borderColor: C.glassBorder2,
  },
  badgeRose:    { backgroundColor: "rgba(212,86,122,0.10)", borderColor: C.roseBorder },
  badgeText:    { fontSize: 11, color: C.muted, fontWeight: "600" },

  // District chips
  chipsScroll:   { marginTop: 14 },
  chipsContent:  { paddingHorizontal: 28, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: C.glass2, borderWidth: 1, borderColor: C.glassBorder2,
  },
  chipOn:     { backgroundColor: C.roseLt, borderColor: C.roseBorder, shadowColor: C.roseGlow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8 },
  chipText:   { fontSize: 12, color: C.muted, fontWeight: "500" },
  chipTextOn: { color: C.rose, fontWeight: "700" },

  // Grid
  grid: {
    flexDirection: "row",
    paddingHorizontal: 28,
    paddingTop: 14,
    gap: GAP,
    alignItems: "flex-start",
  },
  leftCol:  { width: 260, gap: GAP },
  midCol:   { flex: 1, gap: GAP, minWidth: 280 },
  rightCol: { width: 230, gap: GAP },

  // Section label
  secLabel: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 16 },
  secDot:   { width: 3, height: 14, backgroundColor: C.rose, borderRadius: 2, shadowColor: C.roseGlow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6 },
  secTitle: { fontSize: 13, fontWeight: "700", color: C.text, letterSpacing: 0.2 },
  secSub:   { fontSize: 10, color: C.hint, fontWeight: "500", marginTop: 1, letterSpacing: 0.4 },

  // AQI Gauge
  gaugeInner: {
    width: GAUGE_SIZE - 60, height: GAUGE_SIZE - 60,
    borderRadius: (GAUGE_SIZE - 60) / 2,
    backgroundColor: C.glass,
    borderWidth: 1, borderColor: C.glassInner,
    justifyContent: "center", alignItems: "center",
    shadowColor: C.glassShadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 12,
  },
  gaugeLabel:    { fontSize: 9, color: C.hint, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "monospace" },
  gaugeValue:    { fontSize: 40, fontWeight: "800", color: C.rose, lineHeight: 44 },
  gaugePill:     { marginTop: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: C.roseLt, borderWidth: 1, borderColor: C.roseBorder },
  gaugePillText: { fontSize: 11, fontWeight: "700", color: C.rose },
  aqiHint:       { textAlign: "center", fontSize: 10, color: C.hint, marginTop: 4 },

  // Activity advice
  adviceRow:  { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  adviceIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.roseLt, borderWidth: 1, borderColor: C.roseBorder, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  adviceText: { flex: 1, fontSize: 12, color: C.muted, lineHeight: 20 },

  // Metric tiles 2×2
  metrics2:  { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricTile: { ...glass2Base, width: "23%", padding: 13 } as any,
  mtLabel:   { fontSize: 10, color: C.hint, letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 4 },
  mtValue:   { fontSize: 24, fontWeight: "700", lineHeight: 26 },
  mtUnit:    { fontSize: 10, color: C.hint, marginTop: 3 },

  // Pollutant bars
  pollRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  pollNameCol:{ width: 54 },
  pollName:   { fontSize: 11, fontWeight: "700", color: C.text },
  pollNameSub:{ fontSize: 9, color: C.hint, marginTop: 1 },
  pollTrack:  { flex: 1, height: 5, backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 3, overflow: "hidden" },
  pollFill:   { height: "100%", borderRadius: 3 },
  pollVal:    { width: 28, textAlign: "right", fontSize: 12, fontWeight: "700" },

  // AI insight
  insightRow:     { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 12, backgroundColor: C.roseLt, borderWidth: 1, borderColor: C.roseBorder },
  insightIcon:    { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(212,86,122,0.16)", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  insightMain:    { fontSize: 12, fontWeight: "700", color: C.rose },
  insightSub:     { fontSize: 10, color: C.muted, marginTop: 2 },
  insightChip:    { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(212,86,122,0.14)", borderWidth: 1, borderColor: C.roseBorder, flexShrink: 0 },
  insightChipText:{ fontSize: 12, fontWeight: "700", color: C.rose },

  // Weather hero
  wxHero: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, borderRadius: 12, backgroundColor: C.glass2,
    borderWidth: 1, borderColor: C.glassBorder2, marginBottom: 12,
  },
  wxTemp:      { fontSize: 44, fontWeight: "700", color: C.text, lineHeight: 46 },
  wxDesc:      { fontSize: 12, color: C.muted, marginTop: 4 },
  wxHL:        { fontSize: 10, color: C.hint, marginTop: 3 },
  wxIconCircle:{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassInner, justifyContent: "center", alignItems: "center", shadowColor: C.glassShadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10 },

  wxStats:     { flexDirection: "row", gap: 8 },
  wxStat:      { ...glass2Base, flex: 1, padding: 10, alignItems: "center", gap: 5 } as any,
  wxStatLabel: { fontSize: 9, color: C.hint, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: "monospace" },
  wxStatValue: { fontSize: 12, fontWeight: "700" },

  // Forecast
  fcRow:      { flexDirection: "row", gap: 8 },
  fcCard:     { ...glass2Base, flex: 1, padding: 12, alignItems: "center", gap: 3 } as any,
  fcCardHi:   { backgroundColor: C.roseLt, borderColor: C.roseBorder },
  fcWeekday:  { fontSize: 11, fontWeight: "700", color: C.text },
  fcDate:     { fontSize: 10, color: C.hint, marginBottom: 4 },
  fcWeather:  { fontSize: 10, color: C.muted, textAlign: "center" },
  fcTemps:    { fontSize: 12, fontWeight: "600", color: C.text, marginTop: 3 },
  fcPop:      { fontSize: 10, color: C.hint, marginTop: 2 },
});
