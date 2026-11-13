import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store";
import { MobileTopAppbar } from "../navigation/MobileTopAppbar";
import { getMeta, getGrid, getAlerts, getEvents, setScenario } from "../api";
import { fetchMoeStations } from "../api/moe";
import { StationCarousel } from "../components";
import Svg, { Circle } from "react-native-svg";

const CWA_API_KEY = process.env.EXPO_PUBLIC_CWA_API_KEY;

// ─── MOE 測站 → 行政區對照 ────────────────────────────────────────────────────
const MOE_STATION_TO_DISTRICT: Record<string, string> = {
  中壢: "中壢區",
  桃園: "桃園區",
  大園: "大園區",
  觀音: "觀音區",
  平鎮: "平鎮區",
  龍潭: "龍潭區",
};

// ─── 與 StationCarousel DISTRICTS 完全一致的靜態備援資料 ────────────────────
// 用途：當某區域無對應 EPA 測站時，確保 Dashboard 與 Carousel 顯示相同數值
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

// ─── Color constants ──────────────────────────────────────────────────────────
const COLORS = {
  GOOD:                "#76c476", // 良好 (綠)
  MODERATE:            "#edbb05", // 普通 (黃)
  UNHEALTHY_SENSITIVE: "#ff9800", // 對敏感族群不健康 (橘)
  UNHEALTHY:           "#f44336", // 不健康 (紅)
  VERY_UNHEALTHY:      "#9c27b0", // 非常不健康 (紫)
  HAZARDOUS:           "#7b241c", // 有害 (褐紫)
};

// ─── AQI Gauge ────────────────────────────────────────────────────────────────
const GAUGE_SIZE = 200;
const STROKE_WIDTH = 14;
const GAUGE_RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "#E76595";
  if (aqi <= 100) return COLORS.MODERATE;
  if (aqi <= 150) return COLORS.UNHEALTHY_SENSITIVE;
  if (aqi <= 200) return COLORS.UNHEALTHY;
  if (aqi <= 300) return COLORS.VERY_UNHEALTHY;
  return COLORS.HAZARDOUS;
};

const getAQIStatus = (aqi: number) => {
  if (aqi <= 50)  return "良好";
  if (aqi <= 100) return "普通";
  if (aqi <= 150) return "敏感族群";
  if (aqi <= 200) return "不健康";
  if (aqi <= 300) return "非常不健康";
  return "危害";
};

const AQIGauge: React.FC<{ aqi: number }> = ({ aqi }) => {
  const percentage = Math.min(Math.max(aqi / 200, 0), 1);
  const color = getAQIColor(aqi);
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - percentage);
  return (
    <View
      style={{
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Svg
        width={GAUGE_SIZE}
        height={GAUGE_SIZE}
        style={{ position: "absolute" }}
      >
        <Circle
          cx={100}
          cy={100}
          r={GAUGE_RADIUS}
          stroke={`${color}33`}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        <Circle
          cx={100}
          cy={100}
          r={GAUGE_RADIUS}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90, 100, 100)"
        />
      </Svg>
      <View style={styles.gaugeInnerCircle}>
        <Text style={styles.gaugeLabel}>AQI</Text>
        <Text style={[styles.gaugeValue, { color }]}>{aqi}</Text>
        <View style={[styles.gaugePill, { backgroundColor: `${color}1A`, borderColor: `${color}4D` }]}>
          <Text style={[styles.gaugeBadgeText, { color }]}>
            {getAQIStatus(aqi)}
          </Text>
        </View>
      </View>
    </View>
  );
};

// ─── Air Quality Helpers ──────────────────────────────────────────────────────
const getPM25StatusLabel = (v: number) => {
  if (v <= 15.4)  return "良好";
  if (v <= 35.4)  return "普通";
  if (v <= 54.4)  return "敏感族群";
  if (v <= 150.4) return "不健康";
  if (v <= 250.4) return "非常不健康";
  return "危害";
};

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

// 根據 AQI 決定活動建議
const getActivityInfo = (
  aqi: number,
): {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  generalAdvice: string;
} => {
  if (aqi <= 50)
    return {
      icon: "smile",
      color: "#E76595",
      generalAdvice: "正常戶外活動，無須特別注意。",
    };
  if (aqi <= 100)
    return {
      icon: "meh",
      color: COLORS.MODERATE,
      generalAdvice: "正常戶外活動。",
    };
  if (aqi <= 150)
    return {
      icon: "frown", 
      color: COLORS.UNHEALTHY_SENSITIVE,
      generalAdvice: "若感不適（眼痛、咳嗽、喉嚨痛），考慮減少戶外活動；學生可進行戶外活動，但建議減少長時間劇烈運動。",
    };
  if (aqi <= 200)
    return {
      icon: "frown",
      color: COLORS.UNHEALTHY,
      generalAdvice: "正常戶外活動。若感不適，減少體力消耗，特別是戶外活動；學生避免長時間劇烈運動，戶外活動時增加休息。",
    };
  if (aqi <= 300)
    return {
      icon: "frown",
      color: COLORS.VERY_UNHEALTHY,
      generalAdvice: "減少戶外活動；學生應立即停止戶外活動，課程調整至室內進行。",
    };
  
  return {
    icon: "frown", 
    color: COLORS.HAZARDOUS,
    generalAdvice: "避免所有戶外活動，緊閉門窗，外出必須配戴口罩等防護用具；學生立即停止戶外活動，課程移至室內。",
  };
};

// ─── Weather Types & Helpers ──────────────────────────────────────────────────
interface CurrentWeatherData {
  temperature: string;
  weather: string;
  humidity: string;
  windSpeed: string;
  dailyHigh: string;
  dailyLow: string;
}

interface ForecastDay {
  label: string; // 今天 / 明天 / 後天
  dateLabel: string; // e.g. 4/7 週一
  maxTemp: string;
  minTemp: string;
  weather: string;
  precipProb: string;
}
const MOCK_CURRENT: CurrentWeatherData = {
  temperature: '24', 
  weather: '晴時多雲',
  humidity: '68', 
  windSpeed: '2.5',
  dailyHigh: '28', 
  dailyLow: '19',
};

const generateMockForecast = (): ForecastDay[] => {
  const DAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
  const now = new Date();
  return [1, 2, 3].map(i => {
    const d = new Date(now); d.setDate(d.getDate() + i);
    return {
      label:      `${d.getMonth() + 1}/${d.getDate()}`,
      dateLabel:  `週${DAY_CHARS[d.getDay()]}`,
      maxTemp:    String(28 - i),
      minTemp:    String(19 + i),
      weather:    i === 2 ? '短暫陣雨' : '晴',
      precipProb: i === 2 ? '60' : '10',
    };
  });
};

const getWeatherIcon = (
  w: string,
): React.ComponentProps<typeof Feather>["name"] => {
  if (w.includes("雷")) return "cloud-lightning";
  if (w.includes("大雨") || w.includes("豪雨")) return "cloud-rain";
  if (w.includes("雨") || w.includes("陣雨")) return "cloud-drizzle";
  if (w.includes("陰") || w.includes("多雲")) return "cloud";
  if (w.includes("晴")) return "sun";
  return "cloud";
};

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

// ─── 天氣代表性選取輔助 ───────────────────────────────────────────────────────
const WEATHER_SEVERITY: [string, number][] = [
  ['雷雨', 6], ['豪雨', 5], ['大雨', 4],
  ['短暫陣雨或雷雨', 4], ['短暫陣雨', 3], ['陣雨', 3], ['有雨', 3],
  ['陰', 2], ['多雲', 1], ['晴', 0],
];
const pickDayWeather = (wxTimes: any[]): string => {
  // 白天時段優先（06:00–21:00），取最高嚴重度的天氣描述
  const daytime = wxTimes.filter(t => {
    const h = parseInt((t.StartTime ?? '').slice(11, 13), 10);
    return h >= 6 && h < 21;
  });
  const pool = daytime.length ? daytime : wxTimes;
  let best = pool[0]?.ElementValue?.[0]?.Weather ?? '晴';
  let bestScore = -1;
  pool.forEach(t => {
    const w = t.ElementValue?.[0]?.Weather ?? '';
    for (const [key, score] of WEATHER_SEVERITY) {
      if (w.includes(key) && score > bestScore) { bestScore = score; best = w; }
    }
  });
  return best;
};

const fetchWeatherForecast = async (
  district: string
): Promise<{ days: ForecastDay[]; todayPrecipProb: string }> => {
  const mock = { days: generateMockForecast(), todayPrecipProb: '10' };
  if (!CWA_API_KEY || CWA_API_KEY === 'YOUR_CWA_API_KEY') return mock;

  const DAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005` +
    `?Authorization=${CWA_API_KEY}&LocationsName=桃園市&LocationName=${district}&format=JSON`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn(`[Forecast] API 錯誤 HTTP ${res.status}`); return mock; }
    const json = await res.json();
    const allLocations: any[] = json?.records?.Locations?.[0]?.Location ?? [];
    const loc = allLocations.find(l => l.LocationName === district) ?? allLocations[0];
    if (!loc) return mock;

    const elemMap: Record<string, any[]> = {};
    (loc.WeatherElement ?? []).forEach((el: any) => {
      elemMap[el.ElementName] = el.Time ?? [];
    });

    const tempTimes = elemMap['溫度']         ?? [];
    const wxTimes   = elemMap['天氣現象']      ?? [];
    const popTimes  = elemMap['3小時降雨機率'] ?? [];

    // 輔助：取某日所有 PoP 的最大值（Apple Weather 風格）
    const dayMaxPop = (dateStr: string) => {
      const vals = popTimes
        .filter(t => (t.StartTime ?? '').startsWith(dateStr))
        .map(t => parseInt(t.ElementValue?.[0]?.ProbabilityOfPrecipitation ?? '0', 10))
        .filter(v => !isNaN(v));
      return vals.length ? Math.max(...vals) : null;
    };

    // 今天的降雨機率
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const todayPrecipProb = String(dayMaxPop(todayStr) ?? 10);

    // 明天起 3 天
    const days: ForecastDay[] = [1, 2, 3].map(i => {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      // 最高/最低溫：取該日全部逐小時溫度
      const temps = tempTimes
        .filter(t => (t.DataTime ?? '').startsWith(dateStr))
        .map(t => parseFloat(t.ElementValue?.[0]?.Temperature ?? 'NaN'))
        .filter(v => !isNaN(v));
      const maxTemp = temps.length ? String(Math.max(...temps)) : String(28 - i);
      const minTemp = temps.length ? String(Math.min(...temps)) : String(19 + i);

      // 降雨機率：當日最大值
      const precipProb = String(dayMaxPop(dateStr) ?? (i === 2 ? 60 : 10));

      // 天氣：白天時段最嚴重的天氣描述
      const dayWx = wxTimes.filter(t => (t.StartTime ?? '').startsWith(dateStr));
      const weather = pickDayWeather(dayWx);

      return {
        label:      `${d.getMonth()+1}/${d.getDate()}`,
        dateLabel:  `週${DAY_CHARS[d.getDay()]}`,
        maxTemp, minTemp, weather, precipProb,
      };
    });

    return { days, todayPrecipProb };
  } catch (err) {
    console.error('[Forecast] 預報資料請求失敗：', err);
    return mock;
  }
};

// ─── 過去一小時雨量 API ───────────────────────────────────────────────────────
const fetchPast1hrRainfall = async (district: string): Promise<string> => {
  if (!CWA_API_KEY || CWA_API_KEY === "YOUR_CWA_API_KEY") return "0.0";
  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001` +
    `?Authorization=${CWA_API_KEY}&format=JSON&RainfallElement=Past1hr`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[Rainfall] API 錯誤 HTTP ${res.status}`);
      return "0.0";
    }
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    const keyword = district.replace("區", "");
    const st =
      stations.find((s) => s.GeoInfo?.TownName?.includes(keyword)) ?? null;
    return st?.RainfallElement?.Past1hr?.Precipitation ?? "0.0";
  } catch (err) {
    console.error("[Rainfall] 雨量資料請求失敗：", err);
    return "0.0";
  }
};

// ─── Main Screen ────
interface DashboardScreenProps {
  scrollRef?: (ref: any) => void;
}

export const DashboardScreenMobile: React.FC<DashboardScreenProps> = ({
  scrollRef,
}) => {
  const {
    selectedScenario,
    setGridCells,
    setAlerts,
    setEvents,
    isLoading,
    setIsLoading,
  } = useStore();

  const [locatedAqi,      setLocatedAqi]      = useState<number>(65);
  const [locatedPm25,     setLocatedPm25]     = useState<number>(12);
  const [locatedO3,       setLocatedO3]       = useState<number>(48);
  const [locatedNo2,      setLocatedNo2]      = useState(12);
  const [locatedSo2,      setLocatedSo2]      = useState(2.1);
  const [locatedCo,       setLocatedCo]       = useState(0.38);
  const [locatedPm10,     setLocatedPm10]     = useState(35);
  const [currentDistrict, setCurrentDistrict] = useState<string>('中壢區');
  const [currentWeather,  setCurrentWeather]  = useState<CurrentWeatherData>(MOCK_CURRENT);
  const [forecast,        setForecast]        = useState<ForecastDay[]>(generateMockForecast());
  const [past1hrRain,     setPast1hrRain]     = useState<string>('0.0');


  useEffect(() => {
    loadData();
  }, [selectedScenario]);

  // 天氣 & 雨量：隨定位區域更新
  useEffect(() => {
    fetchCurrentWeather(currentDistrict).then(setCurrentWeather);
    fetchWeatherForecast(currentDistrict).then(({ days, todayPrecipProb }) => {
      setForecast(days);
    });
    fetchPast1hrRainfall(currentDistrict).then(setPast1hrRain);
  }, [currentDistrict]);

  // 空氣品質：先以靜態資料同步 Carousel，有 MOE 測站時再以即時值覆蓋
  useEffect(() => {
    // Step 1：靜態資料 fallback，確保與 Carousel 永遠一致
    const staticData = DISTRICT_STATIC_AQ[currentDistrict];
    if (staticData) {
      setLocatedPm25(staticData.pm25);
      setLocatedO3(staticData.o3);
      setLocatedAqi(staticData.aqi);
      setLocatedNo2(staticData.no2);
      setLocatedSo2(staticData.so2);
      setLocatedCo(staticData.co);
      setLocatedPm10(staticData.pm10);
    }
    // Step 2：若該區有 MOE 測站，以即時值覆蓋
    fetchMoeStations()
      .then((stations) => {
        const sitename = Object.entries(MOE_STATION_TO_DISTRICT).find(
          ([, dist]) => dist === currentDistrict,
        )?.[0];
        if (!sitename) return; // 無測站 → 保留 Step 1 的靜態值
        const station = stations.find((s) => s.sitename === sitename);
        if (station) {
          setLocatedPm25(station.pm25);
          setLocatedO3(station.o3);
          setLocatedNo2(station.no2);
          setLocatedSo2(station.so2);
          setLocatedCo(station.co);
          setLocatedPm10(station.pm10);
          // AQI 已由 StationCarousel 的 onAqiResolved 負責更新
        }
      })
      .catch((err) => console.warn("[MOE] 資料載入失敗:", err));
  }, [currentDistrict]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      setScenario(selectedScenario);
      const [, grid, alertsData, eventsData] = await Promise.all([
        getMeta(),
        getGrid({ pollutant: "PM25" }),
        getAlerts(),
        getEvents(),
      ]);
      setGridCells(grid);
      setAlerts(alertsData);
      setEvents(eventsData);
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const pm25Color = getPM25Color(locatedPm25);
  const activ = getActivityInfo(locatedAqi);
  const pm25Progress = Math.min((locatedPm25 / 250) * 100, 100);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E76595" />
        <Text style={styles.loadingText}>載入中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <MobileTopAppbar 
          title="空氣總覽" 
          subtitle="TAOYUAN AIR"
        />  

        {/* AQI Gauge */}
        <View style={styles.gaugeSection}>
          <AQIGauge aqi={locatedAqi} />
        </View>

        {/* Station Carousel */}
        <StationCarousel
          onAqiResolved={setLocatedAqi}
          onDistrictResolved={setCurrentDistrict}
        />

        {/* AI Trend Analysis */}
        <View style={styles.insightSection}>
          <View style={styles.insightCard}>
            <View style={styles.insightIconContainer}>
              <View style={styles.insightIconBg}>
                <Feather name="trending-up" size={20} color="#E76595" />
              </View>
            </View>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>AI 趨勢分析</Text>
              <Text style={styles.insightText}>
                PM2.5 濃度預計在未來3小時內因海風輻合影響下降{" "}
                <Text style={styles.highlightText}>12%</Text>。
              </Text>
            </View>
          </View>
        </View>

        {/* ── Integrated Air Quality Card ── */}
        <View style={styles.sectionPad}>
          <View style={styles.card}>
            {/* Card header */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <Feather name="wind" size={15} color="#E76595" />
                <Text style={styles.cardSectionTitle}>空氣品質</Text>
              </View>
              {/* AQI mini badge */}
              <View
                style={[
                  styles.aqiBadge,
                  {
                    backgroundColor: `${getAQIColor(locatedAqi)}18`,
                    borderColor: `${getAQIColor(locatedAqi)}40`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.aqiBadgeLabelText,
                    { color: getAQIColor(locatedAqi) },
                  ]}
                >
                  AQI
                </Text>
                <Text
                  style={[
                    styles.aqiBadgeValueText,
                    { color: getAQIColor(locatedAqi) },
                  ]}
                >
                  {locatedAqi}
                </Text>
              </View>
            </View>

            {/* PM2.5 prominent block */}
            <View style={styles.pm25Row}>
              <View>
                <Text style={styles.pm25Tag}>PM2.5</Text>
                <View style={styles.pm25ValueRow}>
                  <Text style={[styles.pm25BigNum, { color: pm25Color }]}>
                    {locatedPm25}
                  </Text>
                  <Text style={styles.pm25UnitText}>μg/m³</Text>
                  <View
                    style={[
                      styles.pm25StatusPill,
                      { backgroundColor: `${pm25Color}18` },
                    ]}
                  >
                    <Text
                      style={[styles.pm25StatusLabel, { color: pm25Color }]}
                    >
                      {getPM25StatusLabel(locatedPm25)}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 10, color: "#bbb", marginBottom: 14, marginTop: -10, marginLeft: 10 }}>
                    標準日均值為 15.4 μg/m³
                  </Text>

                </View>
              </View>
            </View>

            {/* Horizontal progress bar */}
            <View style={styles.hProgressTrack}>
              <View
                style={[
                  styles.hProgressFill,
                  {
                    width: `${pm25Progress}%`,
                    backgroundColor: pm25Color,
                  },
                ]}
              />
            </View>
            <View style={styles.hProgressScale}>
              {["0", "15", "35", "54", "150", "250+"].map((v, i) => (
                <Text key={i} style={styles.hScaleText}>
                  {v}
                </Text>
              ))}
            </View>

            {/* Activity advice */}
            <View style={{ marginBottom: 4 }}>
              <View style={[styles.cardTitleGroup, { marginTop: 20 }]}>
                <Feather name="alert-circle" size={15} color="#E76595" />
                <Text style={styles.cardSectionTitle}>活動建議</Text>
              </View>

              {/* 一般民眾 */}
              <View style={[styles.adviceRow, { marginBottom: 8, marginTop: 15, backgroundColor: activ.color + "20", borderColor: activ.color }]}>
                <View style={[styles.adviceIcon, { backgroundColor: activ.color + "30", borderColor: activ.color }]}>
                  <Feather name={activ.icon} size={18} color={activ.color} />
                </View>
                <Text style={styles.adviceText}>{activ.generalAdvice}</Text>
              </View>

            </View>

            {/* Divider */}
            <View style={styles.dividerLine} />

            {/* O3 row */}
            <View style={styles.miniPollutRow}>
              <View style={styles.miniPollutLeft}>
                <Text style={styles.miniPollutName}>O₃</Text>
                <Text style={styles.miniPollutSub}>臭氧</Text>
              </View>
              <View style={styles.miniPollutBar}>
  {/* 包一層 relative wrapper */}
  <View style={{ position: "relative", marginTop: 14 }}>
    {/* 標準說明文字，對齊 54% 位置 */}
    <Text style={{
      position: "absolute",
      left: "54%",
      bottom: 10,
      fontSize: 9,
      color: "#888",
      transform: [{ translateX: -28 }], // 微調讓文字置中對齊線
    }}>
      標準 8 小時均為 54 ppb
    </Text>
    <View style={[styles.miniBarTrack, { position: "relative", overflow: "hidden" }]}>
      <View style={[styles.miniBarFill, {
        width: `${Math.min((locatedO3 / 100) * 100, 100)}%`,
        backgroundColor: getO3Color(locatedO3),
      }]} />
      <View style={{
        position: "absolute",
        left: "54%",
        top: -3,
        bottom: -3,
        width: 1.5,
        backgroundColor: "#888",
        borderRadius: 1,
      }} />
    </View>
  </View>
</View>
              <View style={styles.miniPollutRight}>
                <Text style={[styles.miniPollutVal, { color: getO3Color(locatedO3) }]}>
                  {locatedO3}
                </Text>
                <Text style={styles.miniPollutUnit}>ppb</Text>
              </View>
            </View>

            <View style={styles.miniPollutStrip}>
              <View style={styles.miniPillCard}>
                <Text style={styles.miniPillName}>NO₂</Text>
                <Text style={styles.miniPillSub}>二氧化氮</Text>
                <View style={styles.miniPillValRow}>
                  <Text style={styles.miniPillVal}>{locatedNo2}</Text>
                  <Text style={styles.miniPillUnit}>ppb</Text>
                </View>   
              </View>
              <View style={styles.miniPillDivider} />
              <View style={styles.miniPillCard}>
                <Text style={styles.miniPillName}>SO₂</Text>
                <Text style={styles.miniPillSub}>二氧化硫</Text>
                <View style={styles.miniPillValRow}>
                  <Text style={styles.miniPillVal}>{locatedSo2}</Text>
                  <Text style={styles.miniPillUnit}>ppb</Text>
                </View> 
              </View>
              <View style={styles.miniPillDivider} />
              <View style={styles.miniPillCard}>
                <Text style={styles.miniPillName}>CO</Text>
                <Text style={styles.miniPillSub}>一氧化碳</Text>
                <View style={styles.miniPillValRow} >
                  <Text style={styles.miniPillVal}>{locatedCo}</Text>
                  <Text style={styles.miniPillUnit}>ppm</Text>
                </View>
              </View>
              <View style={styles.miniPillDivider} />
              <View style={styles.miniPillCard}>
                <Text style={styles.miniPillName}>PM10</Text>
                <Text style={styles.miniPillSub}>懸浮微粒</Text>
                <View style={styles.miniPillValRow}>
                  <Text style={styles.miniPillVal}>{locatedPm10}</Text>
                  <Text style={styles.miniPillUnit}>μg/m³</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Weather Card ── */}
        <View style={styles.sectionPad}>
          <View style={styles.card}>
            {/* Card header */}
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <Feather
                  name={getWeatherIcon(currentWeather.weather)}
                  size={15}
                  color="#E76595"
                />
                <Text style={styles.cardSectionTitle}>天氣</Text>
              </View>
              <View style={styles.districtBadge}>
                <Feather name="map-pin" size={10} color="#FBA7BC" />
                <Text style={styles.districtBadgeText}>{currentDistrict}</Text>
              </View>
            </View>

            {/* Current conditions */}
            <View style={styles.weatherCurrentRow}>
              <View>
                <Text style={styles.weatherTempBig}>
                  {currentWeather.temperature}°
                </Text>
                <Text style={styles.weatherDesc}>{currentWeather.weather}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <Text style={styles.forecastTempHigh}>{currentWeather.dailyHigh}°</Text>
                  <Text style={{ fontSize: 12, color: '#bbb' }}>/</Text>
                  <Text style={styles.forecastTempLow}>{currentWeather.dailyLow}°</Text>
                </View>
              </View>
              <View style={styles.weatherIconCircle}>
                <Feather
                  name={getWeatherIcon(currentWeather.weather)}
                  size={34}
                  color="#E76595"
                />
              </View>
            </View>

            {/* Stats row */}
            <View style={styles.weatherStatsRow}>
              {[
                { icon: 'droplet',    val: `${currentWeather.humidity}%`,    label: '濕度' },
                { icon: 'wind',       val: `${currentWeather.windSpeed}m/s`,  label: '風速' },
                { icon: 'cloud-rain', val: `${past1hrRain}mm`,                label: '近1時雨量' },
              ].map((item, i, arr) => (
                <React.Fragment key={i}>
                  <View style={styles.weatherStatItem}>
                    <Feather
                      name={item.icon as any}
                      size={13}
                      color="#E76595"
                    />
                    <Text style={styles.weatherStatVal}>{item.val}</Text>
                    <Text style={styles.weatherStatLabel}>{item.label}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.weatherStatSep} />}
                </React.Fragment>
              ))}
            </View>

            {/* Divider */}
            <View style={styles.dividerLine} />

            {/* 3-day forecast */}
            <Text style={styles.forecastTitle}>未來 3 天預報</Text>
            <View style={styles.forecastRow}>
              {forecast.map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.forecastDayCol,
                    i < forecast.length - 1 && styles.forecastDayColBorder,
                  ]}
                >
                  <Text style={styles.forecastLabel}>{day.label}</Text>
                  <Text style={styles.forecastDate}>{day.dateLabel}</Text>
                  <Feather
                    name={getWeatherIcon(day.weather)}
                    size={22}
                    color="#FBA7BC"
                    style={{ marginVertical: 8 }}
                  />
                  <View style={styles.forecastTempRow}>
                    <Text style={styles.forecastTempHigh}>{day.maxTemp}°</Text>
                    <Text style={styles.forecastTempLow}>
                      {" "}
                      / {day.minTemp}°
                    </Text>
                  </View>
                  <View style={styles.forecastPopRow}>
                    <Feather
                      name="cloud-rain"
                      size={10}
                      color={Number(day.precipProb) >= 50 ? "#5b9bd5" : "#bbb"}
                    />
                    <Text
                      style={[
                        styles.forecastPopText,
                        Number(day.precipProb) >= 50 && { color: "#5b9bd5" },
                      ]}
                    >
                      {day.precipProb}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: "#FFF6F9" },
  loadingContainer:       { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFF6F9" },
  loadingText:            { marginTop: 16, fontSize: 16, color: "#E76595" },
  scrollView:             { flex: 1 },

  // ── Gauge ──
  gaugeSection:           { alignItems: "center", paddingTop: 35, paddingVertical: 20, paddingBottom: 8 },
  gaugeInnerCircle:       { width: 158, height: 158, borderRadius: 79, backgroundColor: "white", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  gaugeLabel:             { fontSize: 10, color: "#9ca3af", fontWeight: "500", letterSpacing: 2, marginBottom: 6 },
  gaugeValue:             { fontSize: 48, fontWeight: "bold", lineHeight: 48, marginTop: 4, marginBottom: 4 },
  gaugePill:              { marginTop: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  gaugeBadgeText:         { fontSize: 14, fontWeight: "500" },

  // ── Insight ──
  insightSection:         { paddingHorizontal: 24, marginBottom: 24 },
  insightCard:            { backgroundColor: "rgba(255, 255, 255, 0.8)", borderRadius: 20, padding: 20, flexDirection: "row", gap: 16, alignItems: "flex-start", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.3)" },
  insightIconContainer:   { marginTop: 2 },
  insightIconBg:          { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(231, 101, 149, 0.15)", justifyContent: "center", alignItems: "center" },
  insightContent:         { flex: 1 },
  insightTitle:           { fontSize: 14, fontWeight: "bold", color: "#666", letterSpacing: 1, marginBottom: 8 },
  insightText:            { fontSize: 15, color: "#374151", lineHeight: 22 },
  highlightText:          { color: "#E76595", fontWeight: "bold" },

  // ── Shared card container ──
  sectionPad:             { paddingHorizontal: 24, marginBottom: 20 },
  card:                   { backgroundColor: "rgba(255, 255, 255, 0.82)", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.35)", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  cardHeaderRow:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  cardTitleGroup:         { flexDirection: "row", alignItems: "center", gap: 7 },
  cardSectionTitle:       { fontSize: 13, fontWeight: "bold", color: "#666", letterSpacing: 1.2 },
  dividerLine:            { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: 16 },

  // ── AQI badge ──
  aqiBadge:               { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  aqiBadgeLabelText:      { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  aqiBadgeValueText:      { fontSize: 14, fontWeight: "bold" },

  // ── PM2.5 prominent ──
  pm25Row:                { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  pm25Tag:                { fontSize: 12, fontWeight: "700", color: "#888", letterSpacing: 0.8, marginBottom: 4 },
  pm25ValueRow:           { flexDirection: "row", alignItems: "baseline", gap: 4 },
  pm25BigNum:             { fontSize: 52, fontWeight: "bold", lineHeight: 54 },
  pm25UnitText:           { fontSize: 12, fontWeight: "600", color: "#9ca3af", marginBottom: 4, marginRight: 6 },
  pm25StatusPill:         { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  pm25StatusLabel:        { fontSize: 12, fontWeight: "600" },

  // ── Horizontal progress bar ──
  hProgressTrack:         { height: 6, backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  hProgressFill:          { height: "100%", borderRadius: 3 },
  hProgressScale:         { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  hScaleText:             { fontSize: 10, color: "#bbb" },

  // ── Advice row ──
  adviceRow:              { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 12, borderWidth: 0.5 },
  adviceIcon:             { width: 36, height: 36, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 2, marginRight: 3 },
  // adviceLabel:         { fontSize: 13, fontWeight: "600", marginBottom: 4 }, // 未使用
  adviceText:             { fontSize: 13, color: "#7a6880", lineHeight: 20 },

  // ── Mini pollutant rows ──
  miniPollutRow:          { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 },
  miniPollutLeft:         { width: 44 },
  miniPollutName:         { fontSize: 13, fontWeight: "700", color: "#444" },
  miniPollutSub:          { fontSize: 10, color: "#aaa", marginTop: 1 },
  miniPollutBar:          { flex: 1 },
  miniBarTrack:           { height: 6, backgroundColor: "rgba(0,0,0,0.07)", borderRadius: 3, overflow: "hidden" },
  miniBarFill:            { backgroundColor: "#E76595", height: "100%", borderRadius: 3 },
  miniPollutRight:        { flexDirection: "row", alignItems: "baseline", gap: 3, width: 52, justifyContent: "flex-end" },
  miniPollutVal:          { color: "#E76595", fontSize: 15, fontWeight: "700" },
  miniPollutUnit:         { fontSize: 10, color: "#aaa" },

  miniPollutStrip:   { flexDirection: "row", overflow: "hidden" },
  miniPillCard:      { flex: 1, paddingVertical: 8, alignItems: "center", gap: 2 },
  miniPillDivider:   { width: 0.5, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 8 },
  miniPillName:      { fontSize: 15, fontWeight: "700", color: "#555" },
  miniPillSub:       { fontSize: 10, color: "#7a6880", marginBottom: 4 },
  miniPillVal:       { color: "#E76595",fontSize: 14, fontWeight: "700" },
  miniPillValRow:    { flexDirection: "row", justifyContent: "center", alignItems: "center" , gap: 8 },
  miniPillUnit:      { fontSize: 9, color: "#aaa" },

  // ── Weather card ──
  districtBadge:          { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(251, 167, 188, 0.12)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(251, 167, 188, 0.25)" },
  districtBadgeText:      { fontSize: 12, fontWeight: "600", color: "#FBA7BC" },
  weatherCurrentRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  weatherTempBig:         { fontSize: 54, fontWeight: "bold", color: "#222", lineHeight: 58 },
  weatherDesc:            { fontSize: 14, color: "#666", marginTop: 2 },
  weatherIconCircle:      { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(231, 101, 149, 0.1)", justifyContent: "center", alignItems: "center" },
  weatherStatsRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.025)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8 },
  weatherStatItem:        { flex: 1, alignItems: "center", gap: 3 },
  weatherStatVal:         { fontSize: 12, fontWeight: "700", color: "#333", marginTop: 2 },
  weatherStatLabel:       { fontSize: 10, color: "#aaa" },
  weatherStatSep:         { width: 1, height: 28, backgroundColor: "rgba(0,0,0,0.07)" },

  // ── 3-day forecast ──
  forecastTitle:          { fontSize: 11, fontWeight: "700", color: "#999", letterSpacing: 0.6, marginBottom: 12 },
  forecastRow:            { flexDirection: "row", justifyContent: "space-between" },
  forecastDayCol:         { flex: 1, alignItems: "center" },
  forecastDayColBorder:   { borderRightWidth: 1, borderRightColor: "rgba(0,0,0,0.07)", marginRight: 0 },
  forecastLabel:          { fontSize: 12, fontWeight: "700", color: "#444" },
  forecastDate:           { fontSize: 10, color: "#bbb", marginTop: 2 },
  forecastTempRow:        { flexDirection: "row", alignItems: "baseline" },
  forecastTempHigh:       { fontSize: 13, fontWeight: "700", color: "#e05c2a" },
  forecastTempLow:        { fontSize: 13, color: "#FBA7BC", fontWeight: "600" },
  forecastPopRow:         { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  forecastPopText:        { fontSize: 11, color: "#bbb", fontWeight: "600" },
  // weatherHighLow:      { fontSize: 12, color: "#999", marginTop: 2 }, // 未使用

  bottomSpacing:          { height: 100 },
});