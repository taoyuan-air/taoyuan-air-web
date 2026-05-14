import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useStore } from "../store";
import { getMeta, getGrid, getAlerts, getEvents, setScenario } from "../api";
import { fetchMoeStations } from "../api/moe";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path, 
  Line, 
  Text as SvgText
} from "react-native-svg";
import { DashboardScreenMobile } from "./DashboardScreenMobile";
import { Layout } from '../styles/responsive';
import { TaoyuanMapView } from './TaoyuanMapView.web';
import { palette } from "../styles/theme";

// ─── pm2.5 trend bars ──────────────────────────────────────────────
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
    labels.push(`${currentHour.toString().padStart(2, '0')}:00`);
    
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
    // 1. 如果是預測數據，使用不同深度的灰色
    if (isPrediction) {
      if (value <= 0.3) return 'rgba(224, 224, 224, 0.6)'; // 淺灰 (對應 綠色等級)
      if (value <= 0.5) return 'rgba(189, 189, 189, 0.6)'; // 次淺灰 (對應 黃色等級)
      if (value <= 0.7) return 'rgba(117, 117, 117, 0.6)'; // 中深灰 (對應 紅色等級)
      return 'rgba(66, 66, 66, 0.6)';                   // 深灰 (對應 紫色等級)
    }

    // 2. 如果是真實數據，使用原本的彩色系統
    let baseColor;
    if (value <= 0.3) baseColor = COLORS.GOOD; // 主色系 - 低
    else if (value <= 0.5) baseColor = COLORS.MODERATE; // 黃色 - 一般
    else if (value <= 0.7) baseColor = COLORS.UNHEALTHY; // 紅色 - 高
    else baseColor = COLORS.VERY_UNHEALTHY; // 紫色 - 很高

    return baseColor + 'CC';
  };

  const maxHeight = 56;  
  const barWidth = 12;   
  const barSpacing = 6;  
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
                    borderColor: isNow ? '#FBA7BC' : 'transparent',
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
              >
                {label.replace(':00', '')}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const CWA_API_KEY = process.env.EXPO_PUBLIC_CWA_API_KEY;

// ─── MOE / district maps ──────────────────────────────────────────────
const MOE_STATION_TO_DISTRICT: Record<string, string> = {
  中壢: "中壢區", 桃園: "桃園區", 大園: "大園區",
  觀音: "觀音區", 平鎮: "平鎮區", 龍潭: "龍潭區",
};

const DISTRICT_STATIC_AQ: Record<string, { pm25: number; o3: number; no2: number; so2: number; co: number; pm10: number; aqi: number }> = {
  桃園區: { pm25: 20, o3: 48, no2: 15, so2: 2.5, co: 0.45, pm10: 45, aqi: 75 },
  中壢區: { pm25: 18, o3: 42, no2: 14, so2: 2.3, co: 0.42, pm10: 40, aqi: 72 },
  八德區: { pm25: 16, o3: 40, no2: 12, so2: 2.1, co: 0.38, pm10: 38, aqi: 30 },
  龜山區: { pm25: 19, o3: 44, no2: 18, so2: 3.2, co: 0.55, pm10: 52, aqi: 350 },
  蘆竹區: { pm25: 14, o3: 36, no2: 11, so2: 2.0, co: 0.35, pm10: 32, aqi: 132 },
  大園區: { pm25: 12, o3: 35, no2: 10, so2: 2.8, co: 0.30, pm10: 30, aqi: 58 },
  大溪區: { pm25: 13, o3: 37, no2: 9, so2: 1.8, co: 0.28, pm10: 28, aqi: 189 },
  平鎮區: { pm25: 16, o3: 40, no2: 13, so2: 2.2, co: 0.40, pm10: 36, aqi: 68 },
  楊梅區: { pm25: 17, o3: 65, no2: 200, so2: 200, co: 16, pm10: 150, aqi: 70 },
  龍潭區: { pm25: 15, o3: 38, no2: 10, so2: 1.9, co: 0.36, pm10: 33, aqi: 65 },
  觀音區: { pm25: 22, o3: 45, no2: 16, so2: 3.5, co: 0.48, pm10: 50, aqi: 78 },
  新屋區: { pm25: 21, o3: 43, no2: 14, so2: 3.0, co: 0.46, pm10: 48, aqi: 76 },
  復興區: { pm25: 10, o3: 32, no2: 5, so2: 1.2, co: 0.20, pm10: 20, aqi: 220 },
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

const COLORS = {
  GOOD: "#76c476",          // 良好 (綠)
  MODERATE: "#edbb05",      // 普通 (黃)
  UNHEALTHY_SENSITIVE: "#ff9800", // 對敏感族群不健康 (橘)
  UNHEALTHY: "#f44336",     // 不健康 (紅)
  VERY_UNHEALTHY: "#9c27b0",// 非常不健康 (紫)
  HAZARDOUS: "#7b241c"      // 有害 (褐紫)
};

// ─── Gauge dimensions (desktop baseline) ──────────────────────────────
const GAUGE_SIZE   = 200;
const STROKE_W     = 11;
const GAUGE_R      = (GAUGE_SIZE - STROKE_W) / 2;
const GAUGE_CIRC   = 2 * Math.PI * GAUGE_R;

// ─── Helper: AQI color ───────────────────────────────────────
const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "#E76595";
  if (aqi <= 100) return COLORS.MODERATE;
  if (aqi <= 150) return COLORS.UNHEALTHY_SENSITIVE;
  if (aqi <= 200) return COLORS.UNHEALTHY;
  if (aqi <= 300) return COLORS.VERY_UNHEALTHY;
  return COLORS.HAZARDOUS;
};

// ─── Helper: AQI → status label ───────────────────────────────────────
const getAQIStatus = (aqi: number) => {
  if (aqi <= 50)  return "良好";
  if (aqi <= 100) return "普通";
  if (aqi <= 150) return "敏感族群";
  if (aqi <= 200) return "不健康";
  if (aqi <= 300) return "非常不健康";
  return "危害";
};

// ─── Air Quality Helpers ──────────────────────────────────────────────────────

const getPM25Color = (v: number) => {
  if (v <= 15.4)  return "#E76595";
  if (v <= 35.4)  return COLORS.MODERATE;
  if (v <= 54.4)  return COLORS.UNHEALTHY_SENSITIVE; 
  if (v <= 150.4) return COLORS.UNHEALTHY;
  if (v <= 250.4) return COLORS.VERY_UNHEALTHY;
  return COLORS.HAZARDOUS;                          
};

const getO3Color = (v: number) => {
  if (v <= 54)  return "#E76595";                  
  if (v <= 70)  return COLORS.MODERATE;             
  if (v <= 85)  return COLORS.UNHEALTHY_SENSITIVE;  
  if (v <= 105) return COLORS.UNHEALTHY;            
  if (v <= 200) return COLORS.VERY_UNHEALTHY;       
  return COLORS.HAZARDOUS;                          
};

// 根據 AQI 決定活動建議 icon & 文字
const getActivityInfo = (
  aqi: number,
): {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  generalAdvice: string;
  sensitiveAdvice: string;
} => {
  if (aqi <= 50)
    return {
      icon: "smile",
      color: "#E76595",
      generalAdvice: "正常戶外活動，無須特別注意。",
      sensitiveAdvice: "正常戶外活動，無須特別注意。",
    };
  if (aqi <= 100)
    return {
      icon: "meh",
      color: COLORS.MODERATE,
      generalAdvice: "正常戶外活動。",
      sensitiveAdvice: "注意可能出現咳嗽或呼吸急促症狀，但仍可正常戶外活動。",
    };
  if (aqi <= 150)
    return {
      icon: "frown", 
      color: COLORS.UNHEALTHY_SENSITIVE,
      generalAdvice: "若感不適（眼痛、咳嗽、喉嚨痛），考慮減少戶外活動；學生可進行戶外活動，但建議減少長時間劇烈運動。",
      sensitiveAdvice: "有心臟、呼吸道及心血管疾病者、孩童及老年人，減少體力消耗及戶外活動，外出配戴口罩；氣喘者注意增加使用吸入劑頻率。",
    };
  if (aqi <= 200)
    return {
      icon: "frown",
      color: COLORS.UNHEALTHY,
      generalAdvice: "正常戶外活動。若感不適，減少體力消耗，特別是戶外活動；學生避免長時間劇烈運動，戶外活動時增加休息。",
      sensitiveAdvice: "留在室內並減少體力消耗活動，外出必須配戴口罩；氣喘者注意增加使用吸入劑頻率。",
    };
  if (aqi <= 300)
    return {
      icon: "frown",
      color: COLORS.VERY_UNHEALTHY,
      generalAdvice: "減少戶外活動；學生應立即停止戶外活動，課程調整至室內進行。",
      sensitiveAdvice: "留在室內並避免體力消耗，外出必須配戴口罩；氣喘者增加使用吸入劑頻率。",
    };
  
  return {
    icon: "frown", 
    color: COLORS.HAZARDOUS,
    generalAdvice: "避免所有戶外活動，緊閉門窗，外出必須配戴口罩等防護用具；學生立即停止戶外活動，課程移至室內。",
    sensitiveAdvice: "留在室內並避免所有體力消耗活動，外出必須配戴口罩；氣喘者增加使用吸入劑頻率。",
  };
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
const fetchCurrentWeather = async (
  district: string,
): Promise<CurrentWeatherData> => {
  if (!CWA_API_KEY || CWA_API_KEY === "YOUR_CWA_API_KEY") return MOCK_CURRENT;
  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001` +
    `?Authorization=${CWA_API_KEY}&CountyName=桃園市&format=JSON`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Weather] 現況 API 錯誤 HTTP ${res.status}`);
      return MOCK_CURRENT;
    }
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    if (stations.length === 0) return MOCK_CURRENT;

    const keyword = district.replace('區', '');
    const st = stations.find(s => s.GeoInfo?.TownName?.includes(keyword)) ?? stations[0];
    const obs = st.WeatherElement ?? {};
    return {
      temperature:   String(Math.round(parseFloat(obs.AirTemperature ?? MOCK_CURRENT.temperature))),
      weather:       obs.Weather          ?? MOCK_CURRENT.weather,
      humidity:      obs.RelativeHumidity ?? MOCK_CURRENT.humidity,
      windSpeed:     obs.WindSpeed        ?? MOCK_CURRENT.windSpeed,
      dailyHigh: String(Math.round(parseFloat(obs.DailyExtreme?.DailyHigh?.TemperatureInfo?.AirTemperature ?? MOCK_CURRENT.dailyHigh))),
      dailyLow:  String(Math.round(parseFloat(obs.DailyExtreme?.DailyLow?.TemperatureInfo?.AirTemperature  ?? MOCK_CURRENT.dailyLow))),
    };
  } catch (err) {
    console.error("[Weather] 現況資料請求失敗：", err);
    return MOCK_CURRENT;
  }
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
  const pct    = Math.min(Math.max(aqi / 200, 0), 1);
  const offset = GAUGE_CIRC * (1 - pct);
  const cx = GAUGE_SIZE / 2;
  const cy = GAUGE_SIZE / 2;

  const color     = getAQIColor(aqi);
  const gradId    = `rg-${aqi}`;          // 避免多個 gauge 共用同一個 id

  // 漸層起始色：把主色調淡（透明度低一點的同色）
  const colorLight = color + "99";        // 60% opacity hex

  return (
    <View style={{ width: GAUGE_SIZE, height: GAUGE_SIZE, justifyContent: "center", alignItems: "center", marginTop: 10 }}>
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} style={{ position: "absolute" }}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colorLight} stopOpacity="1" />
            <Stop offset="100%" stopColor={color}     stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>

        {/* track */}
        <Circle cx={cx} cy={cy} r={GAUGE_R} stroke={color} strokeOpacity={0.25} strokeWidth={STROKE_W} fill="none" />

        {/* main arc */}
        <Circle
          cx={cx} cy={cy} r={GAUGE_R}
          stroke={`url(#${gradId})`}
          strokeWidth={STROKE_W}
          fill="none"
          strokeDasharray={GAUGE_CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>

      {/* inner frosted circle */}
      <View style={S.gaugeInner}>
        <Text style={S.gaugeLabel}>AQI</Text>
        <Text style={[S.gaugeValue, { color: getAQIColor(aqi) }]}>{aqi}</Text>
        <View style={[S.gaugePill, { backgroundColor: getAQIColor(aqi)+"33", borderColor: getAQIColor(aqi)+"55" }]}>
          <Text style={[S.gaugePillText, { color: getAQIColor(aqi) }]}>{getAQIStatus(aqi)}</Text>
        </View>
      </View>
    </View>
  );
};

/* pm2.5 and o3 GaugeArc */
const R = 45;
const CX = 55;
const CY = 58;
const ARC_LEN = Math.PI * R; // 半圓周長 ≈ 141.37

function polarToXY(angleDeg: number) {
  // 0° = 左端(180°數學角), 100% = 右端(0°數學角)
  const rad = (Math.PI * (180 - angleDeg)) / 180;
  return {
    x: CX + R * Math.cos(rad),
    y: CY - R * Math.sin(rad),
  };
}

function GaugeArc({
  value, max, markerVal, color, unit,
}: { value: number; max: number; markerVal: number; color: string; unit: string; }) {
  const ratio = Math.min(value / max, 1);
  const dashOffset = ARC_LEN * (1 - ratio);

  const markerRatio = Math.min(markerVal / max, 1);
  const markerAngleDeg = markerRatio * 180;
  const mp = polarToXY(markerAngleDeg); 
  // 標籤往外延伸
  const labelDist = 14;
  const rad = (Math.PI * (180 - markerAngleDeg)) / 180;
  const lx = CX + (R + labelDist) * Math.cos(rad);
  const ly = CY - (R + labelDist) * Math.sin(rad);

  return (
    <Svg width={110} height={68} viewBox="-10 0 120 68">
      {/* 背景弧 */}
      <Path
        d={`M 10 58 A ${R} ${R} 0 0 1 100 58`}
        fill="none"
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      {/* 填色弧 */}
      <Path
        d={`M 10 58 A ${R} ${R} 0 0 1 100 58`}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={ARC_LEN}
        strokeDashoffset={dashOffset}
      />
      {/* 指標線 */}
      <Line
        x1={mp.x} y1={mp.y}
        x2={lx}   y2={ly}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* 指標數值 */}
      <SvgText
        x={lx} y={ly - 3}
        fontSize={9}
        fill="#aaa"
        textAnchor="middle"
      >
        {markerVal}
      </SvgText>
      {/* 中央數值 */}
      <SvgText x={CX} y={52} fontSize={20} fontWeight="700" fill={color} textAnchor="middle">
        {value}
      </SvgText>
      <SvgText x={CX} y={63} fontSize={9} fill="#aaa" textAnchor="middle">
        {unit}
      </SvgText>
    </Svg>
  );
}

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Only render on web viewports >= 768px; mobile uses DashboardScreenMobile.tsx
  if (windowWidth < Layout.breakpoints.mobile) return <DashboardScreenMobile/>;

  const isDesktop = windowWidth >= Layout.breakpoints.desktop;
  const isTablet = windowWidth >= Layout.breakpoints.mobile && windowWidth < Layout.breakpoints.tablet;

  const dynStyles = {
    headerWrap:  { paddingHorizontal: isDesktop ? 48 : 28, paddingTop: 28 },
    chipsContent:{ paddingHorizontal: isDesktop ? 48 : 28, gap: 8 },
    grid:        { paddingHorizontal: isDesktop ? 48 : 28 },
    leftCol:     { width: isDesktop ? 380 : 280 },
    rightCol:    { width: isDesktop ? 350 : 280 },
    headerTitle: { fontSize: isDesktop ? 26 : 20 },
  };

  const { selectedScenario, setGridCells, setAlerts, setEvents, isLoading, setIsLoading } = useStore();
  const { location, permission } = useUserLocation();

 const [locatedAqi, setLocatedAqi] = useState(65);
  const [locatedPm25, setLocatedPm25] = useState(18);
  const [locatedO3, setLocatedO3] = useState(42);
  const [locatedNo2, setLocatedNo2] = useState(12);
  const [locatedSo2, setLocatedSo2] = useState(2.1);
  const [locatedCo, setLocatedCo] = useState(0.38);
  const [locatedPm10, setLocatedPm10] = useState(35);
  const [currentDistrict, setCurrentDistrict] = useState<string>('中壢區');
  const [forecast, setForecast]       = useState<ForecastDay[]>(generateMockForecast());
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
    const s = DISTRICT_STATIC_AQ[displayDistrict];
    if (s) { setLocatedPm25(s.pm25); setLocatedO3(s.o3); setLocatedAqi(s.aqi); setLocatedNo2(s.no2); setLocatedSo2(s.so2); setLocatedCo(s.co); setLocatedPm10(s.pm10); }
    fetchMoeStations().then((stations) => {
      const sitename = Object.entries(MOE_STATION_TO_DISTRICT).find(([, d]) => d === displayDistrict)?.[0];
      if (!sitename) return;
      const st = stations.find((s) => s.sitename === sitename);
      if (st) { setLocatedPm25(st.pm25); setLocatedO3(st.o3); setLocatedAqi(st.aqi || s?.aqi || 65); setLocatedNo2(st.no2); setLocatedSo2(st.so2); setLocatedCo(st.co); setLocatedPm10(st.pm10); }
    }).catch(console.warn);
  }, [displayDistrict]);


  const pm25  = locatedPm25;
  const o3    = locatedO3;
  const no2   = locatedNo2;
  const so2   = locatedSo2;
  const co    = locatedCo;
  const pm10  = locatedPm10;
  const activ = getActivityInfo(locatedAqi);

  if (isLoading) {
    return (
        <View style={{  flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: palette.bgBase }}>
            <ActivityIndicator size="large" color={C.rose} />
            <Text style={S.loadingText}>載入中...</Text>
        </View>
    );
  }

  return (
  
      
        <View style={{ flexDirection: 'row' }}>

          {/* 左半部：地圖 */}
          <View style={{ width: '40%' }}>
            {/* ── 桃園地圖 ── */}
              <View style={[{ padding: 40, paddingTop: 70 }]}>
                <View style={{ height: 650}}>
                  <TaoyuanMapView
                    selectedDistrict={selectedDistrict}
                    onSelectDistrict={(d) => setSelectedDistrict(d)}
                  />
                </View>

                {/* 左下角詳情按鈕 */}             
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      bottom: 50,
                      left: 100,
                      backgroundColor: '#f7e9ec',
                      borderWidth: 1,
                      borderColor: '#d4567a',
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 20,
                      alignItems: 'center',
                     
                    }}>
                    <Text style={{ color: '#d4567a', fontWeight: '700', fontSize: 15 }}>
                      點選查看區域詳情　<Feather name="map-pin" size={15} color="#d4567a" /> {selectedDistrict}
                    </Text>
                  </TouchableOpacity>            
              </View>    
          </View>

          {/* 右半部：所有資訊 */}
          <View style={{
            width: '56%',
            backgroundColor: 'rgb(255, 255, 255)',  
            //backdropFilter: 'blur(16px)',   // web 毛玻璃效果
            borderWidth: 1,
            borderColor: 'rgb(228, 140, 181)',
            borderRadius: 20,
            paddingVertical: 14,
            paddingHorizontal: 28,
            margin: 20,
          }}>
            <ScrollView>
              <View style={[S.grid]}>

                  {/* Choosen District Name */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="map-pin" size={30} color="#d4567a" style={{marginRight: 10 ,marginTop: 5}} />
                    <Text style={S.districtName}>{selectedDistrict}</Text>
                  </View>
                  
                  <View style={S.divider}/>

                  {/* FIRST ROW */}
                  <View style={S.firstRow}>
                    
                    {/* AQI */}
                    <View style={{ flex: 1.2 }}>
                      <SecLabel title="AQI 空氣品質指標" />
                      <View style={{ alignItems: "center", marginTop: 12 }}>
                        <AQIGauge aqi={locatedAqi} />
                        <Text style={S.aqiHint}>數值範圍 0–200，越低越好</Text>
                      </View>
                    </View>
                    
                    {/* 活動建議 + AI 趨勢分析 */}
                    <View style={{ flex: 1.5, gap: 10 }}>
                      
                      {/* 活動建議卡片 */}
                      <View>
                        <SecLabel title="活動建議" />

                        {/* 一般民眾 */}
                        <View style={[S.adviceRow, { marginBottom: 8, backgroundColor: activ.color + "20", borderColor: activ.color }]}>
                          <View style={[S.adviceIcon, { backgroundColor: activ.color + "30", borderColor: activ.color }]}>
                            <Feather name={activ.icon} size={18} color={activ.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[S.adviceLabel, { color: activ.color }]}>一般民眾</Text>
                            <Text style={S.adviceText}>{activ.generalAdvice}</Text>
                          </View>
                        </View>

                        {/* 敏感族群 */}
                        <View style={[S.adviceRow, { marginBottom: 8, backgroundColor: activ.color + "20", borderColor: activ.color }]}>
                          <View style={[S.adviceIcon, { backgroundColor: activ.color + "30", borderColor: activ.color }]}>
                            <Feather name={activ.icon} size={18} color={activ.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[S.adviceLabel, { color: activ.color }]}>敏感族群</Text>
                            <Text style={S.adviceText}>{activ.sensitiveAdvice}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={S.divider} />
                      {/* AI 趨勢分析區塊 */}
                      <View>
                        <SecLabel title="AI 趨勢分析" />
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

                  </View>

                  {/* SECOND ROW */}
                  <View style={{ flexDirection: "row" }}>
                    <SecLabel title="污染物詳情"/>
                    <Text style={{ fontSize: 12, color: "#aaa", marginTop: 2, marginLeft: 10 }}>（每小時）</Text>
                    <SecLabel title="PM2.5 趨勢"/>
                  </View>
                    <View style={S.secondRow}>
                        
                      {/* Pollutants */}
                      <View style={{ flex: 1.2 }}>

                        {/* PM2.5 + O₃ 弧形儀表並排 */}
                        <View style={S.miniGaugeRow}>

                          {/* PM2.5 */}
                          <View style={S.miniGaugeCard}>
                            <Text style={S.miniPollutName}>PM2.5</Text>
                            <Text style={S.miniPollutSub}>細懸浮微粒</Text>
                            <Text style={{ fontSize: 9, color: "#aaa" }}>標準日均值為 15.4 μg/m³</Text>
                            <GaugeArc value={pm25} max={150} markerVal={15.4} color={getPM25Color(pm25)} unit="μg/m³"/>
                          </View>

                          <View style={S.miniGaugeDivider} />

                          {/* O₃ */}
                          <View style={S.miniGaugeCard}>
                            <Text style={S.miniPollutName}>O₃</Text>
                            <Text style={S.miniPollutSub}>臭氧</Text>
                            <Text style={{ fontSize: 9, color: "#aaa" }}>標準8小時均值為 54 ppb</Text>
                            <GaugeArc value={o3} max={200}  markerVal={54} color={getO3Color(o3)} unit="ppb"/>
                          </View>

                        </View>

                        {/* 其他四項汙染物 — 單行橫排 */}
                        <View style={S.miniPollutStrip}>
                          <View style={S.miniPillCard}>
                            <Text style={S.miniPillName}>NO₂</Text>
                            <Text style={S.miniPillSub}>二氧化氮</Text>
                            <View style={S.miniPillValRow}>
                              <Text style={S.miniPillVal}>{no2}</Text>
                              <Text style={S.miniPillUnit}>ppb</Text>
                            </View>   
                          </View>
                          <View style={S.miniPillDivider} />
                          <View style={S.miniPillCard}>
                            <Text style={S.miniPillName}>SO₂</Text>
                            <Text style={S.miniPillSub}>二氧化硫</Text>
                            <View style={S.miniPillValRow}>
                              <Text style={S.miniPillVal}>{so2}</Text>
                              <Text style={S.miniPillUnit}>ppb</Text>
                            </View> 
                          </View>
                          <View style={S.miniPillDivider} />
                          <View style={S.miniPillCard}>
                            <Text style={S.miniPillName}>CO</Text>
                            <Text style={S.miniPillSub}>一氧化碳</Text>
                            <View style={S.miniPillValRow} >
                              <Text style={S.miniPillVal}>{co}</Text>
                              <Text style={S.miniPillUnit}>ppm</Text>
                            </View>
                          </View>
                          <View style={S.miniPillDivider} />
                          <View style={S.miniPillCard}>
                            <Text style={S.miniPillName}>PM10</Text>
                            <Text style={S.miniPillSub}>懸浮微粒</Text>
                            <View style={S.miniPillValRow}>
                              <Text style={S.miniPillVal}>{pm10}</Text>
                              <Text style={S.miniPillUnit}>μg/m³</Text>
                            </View>
                          </View>
                        </View>

                      </View>
                      {/* PM2.5 趨勢圖 */}           
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <Text style={{ fontSize: 10, color: C.hint }}>過去 5h ／ NOW ／ 預測 5h</Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text>今天</Text>
                          <TrendBars trend={[0.3, 0.2, 0.3, 0.5, 0.58, 0.47, 0.48, 0.52, 0.65, 0.42, 0.38]} />
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text>明天</Text>
                          <TrendBars trend={[0.3, 0.2, 0.3, 0.5, 0.58, 0.47, 0.48, 0.52, 0.65, 0.42, 0.38]} />
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text>後天</Text>
                          <TrendBars trend={[0.3, 0.2, 0.3, 0.5, 0.58, 0.47, 0.48, 0.52, 0.65, 0.42, 0.38]} />
                        </View>
                      </View>
                  </View>
                  
                     
                
                  

              </View>
            </ScrollView>
          </View>

        </View>
      
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

  // District name
  districtName: { fontSize: 30, fontWeight: "800", color: "#d4567a", letterSpacing: -0.5 },

  // Grid
  grid: {
    flexDirection: "column",
    paddingHorizontal: 12,  // 28 → 12
    paddingTop: 10,         // 14 → 10
    gap: 10,                // GAP(14) → 10
    alignItems: "stretch",  // "flex-start" → "stretch"（讓卡片撐滿寬度）
  },

  // Rows 
  firstRow: { flexDirection: "row", alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: "100%", paddingBottom: 10 },
  secondRow: { flexDirection: "row", alignItems: 'flex-start', justifyContent: 'space-between',gap: 40, width: "100%" },
  thirdRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 40 },

  // Divider
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.05)", marginVertical: 4 },

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
    shadowColor: C.glassShadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 2, shadowRadius: 12,
  },
  gaugeLabel:    { fontSize: 9, color: C.hint, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "monospace" },
  gaugeValue:    { fontSize: 40, fontWeight: "800", color: C.rose, lineHeight: 44 },
  gaugePill:     { marginTop: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: C.roseLt, borderWidth: 1.2 },
  gaugePillText: { fontSize: 11, fontWeight: "700" },
  aqiHint:       { textAlign: "center", fontSize: 10, color: C.hint, marginTop: 15 },

  // Activity advice
  adviceRow:    { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13, borderRadius: 12, borderWidth: 1,},
  adviceIcon:   { width: 36, height: 36, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 2, marginRight: 3 },
  adviceLabel:  { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  adviceText:   { fontSize: 12, color: C.muted, lineHeight: 20 },

  // Metric tiles 2×2
  metrics2:  { flexDirection: "row", gap: 7 },
  metricTile: { ...glass2Base, flex: 1, padding: 13, alignItems: "center" } as any,
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
  insightRow:     { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 12, backgroundColor: C.roseLt, borderWidth: 1, borderColor: C.roseBorder, marginBottom: 10, },
  insightIcon:    { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(212,86,122,0.16)", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  insightMain:    { fontSize: 12, fontWeight: "700", color: C.rose },
  insightSub:     { fontSize: 10, color: C.muted, marginTop: 2 },
  insightChip:    { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(212,86,122,0.14)", borderWidth: 1, borderColor: C.roseBorder, flexShrink: 0 },
  insightChipText:{ fontSize: 12, fontWeight: "700", color: C.rose },

  // Forecast
  fcRow:      { flexDirection: "row", gap: 8 },
  fcCard:     { ...glass2Base, flex: 1, padding: 12, alignItems: "center", gap: 3 } as any,
  fcCardHi:   { backgroundColor: C.roseLt, borderColor: C.roseBorder },
  fcWeekday:  { fontSize: 11, fontWeight: "700", color: C.text },
  fcDate:     { fontSize: 10, color: C.hint, marginBottom: 4 },
  fcWeather:  { fontSize: 10, color: C.muted, textAlign: "center" },
  fcTemps:    { fontSize: 9, fontWeight: "600", color: C.text, marginTop: 3 },
  fcPop:      { fontSize: 10, color: C.hint, marginTop: 2 },

  // ── Mini pollutant rows (PM2.5, O₃ 長條) ──
  miniGaugeRow:      { flexDirection: "row", overflow: "hidden", marginBottom: 20 },
  miniGaugeCard:     { flex: 1, paddingTop: 12, paddingBottom: 8, alignItems: "center" },
  miniGaugeDivider:  { width: 0.5, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 12 },
  miniPollutName:    { fontSize: 20, fontWeight: "700", color: "#444" },
  miniPollutSub:     { fontSize: 10, color: C.muted, marginTop: 1, marginBottom: 4 },
  miniPollutStrip:   { flexDirection: "row", overflow: "hidden" },
  miniPillCard:      { flex: 1, paddingVertical: 8, alignItems: "center", gap: 2 },
  miniPillDivider:   { width: 0.5, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 8 },
  miniPillName:      { fontSize: 15, fontWeight: "700", color: "#555" },
  miniPillSub:       { fontSize: 10, color: C.muted, marginBottom: 4 },
  miniPillVal:       { color: "#E76595",fontSize: 14, fontWeight: "700" },
  miniPillValRow:    { flexDirection: "row", justifyContent: "center", alignItems: "center" , gap: 8 },
  miniPillUnit:      { fontSize: 9, color: "#aaa" },
});

const styles = StyleSheet.create({
  trendBarsWrapper:    { alignItems: "center" },
  trendBarsContainer:  { flexDirection: "row", alignItems: "flex-end", height: 56, marginBottom: 10 },
  trendBar:            { borderRadius: 2 },
  barWrapper:          { alignItems: "center" },
  timeLabelsContainer: { flexDirection: "row", alignItems: "center", height: 20, width: "100%" },
  timeLabelWrapper:    { alignItems: "center", justifyContent: "center" },
  timeLabel:           { fontSize: 9, color: "rgba(93,115,137,0.6)", fontWeight: "400", textAlign: "center" },
  timeLabelNow:        { color: C.rose, fontWeight: "700", fontSize: 10 },
  timeLabelPrediction: { color: "rgba(93,115,137,0.4)", fontStyle: "italic" },
  nowIndicator:        { width: 2, height: 2, borderRadius: 1, backgroundColor: C.rose, marginTop: 2 },
});
