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
import { TopNavigation } from "../navigation/TopNavigation";
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
const DISTRICT_STATIC_AQ: Record<
  string,
  { pm25: number; o3: number; aqi: number }
> = {
  桃園區: { pm25: 20, o3: 48, aqi: 75 },
  中壢區: { pm25: 18, o3: 42, aqi: 72 },
  八德區: { pm25: 16, o3: 40, aqi: 68 },
  龜山區: { pm25: 19, o3: 44, aqi: 73 },
  蘆竹區: { pm25: 14, o3: 36, aqi: 62 },
  大園區: { pm25: 12, o3: 35, aqi: 58 },
  大溪區: { pm25: 13, o3: 37, aqi: 60 },
  平鎮區: { pm25: 16, o3: 40, aqi: 68 },
  楊梅區: { pm25: 17, o3: 41, aqi: 70 },
  龍潭區: { pm25: 15, o3: 38, aqi: 65 },
  觀音區: { pm25: 22, o3: 45, aqi: 78 },
  新屋區: { pm25: 21, o3: 43, aqi: 76 },
  復興區: { pm25: 10, o3: 32, aqi: 52 },
};

// ─── AQI Gauge ────────────────────────────────────────
const GAUGE_SIZE = 200;
const STROKE_WIDTH = 14;
const GAUGE_RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "#E76595";
  if (aqi <= 100) return "#f5c518";
  if (aqi <= 150) return "#ff8c00";
  if (aqi <= 200) return "#e53935";
  return "#9c27b0";
};

const getAQIStatus = (aqi: number) => {
  if (aqi <= 50)  return "良好";
  if (aqi <= 100) return "普通";
  if (aqi <= 150) return "敏感族群";
  if (aqi <= 200) return "不健康";
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
const getPM25Color = (v: number) => {
  if (v <= 12) return "#E76595";
  if (v <= 35) return "#f5c518";
  if (v <= 55) return "#ff8c00";
  return "#e53935";
};

const getPM25StatusLabel = (v: number) => {
  if (v <= 12) return "良好";
  if (v <= 35) return "普通";
  if (v <= 55) return "對敏感族群不健康";
  return "不健康";
};

const getO3Color = (v: number) => {
  if (v <= 54) return "#E76595";
  if (v <= 70) return "#f5c518";
  return "#ff8c00";
};

const getNO2Color = (v: number) => {
  if (v <= 53) return "#E76595";
  if (v <= 100) return "#f5c518";
  return "#ff8c00";
};

// 根據 PM2.5 決定活動建議 icon & 文字
const getActivityInfo = (
  pm25: number,
): {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor: string;
  advice: string;
} => {
  if (pm25 <= 12)
    return {
      icon: "activity",
      iconColor: "#E76595",
      advice: "空氣清新，非常適合戶外運動，盡情享受戶外活動！",
    };
  if (pm25 <= 35)
    return {
      icon: "user",
      iconColor: "#FBA7BC",
      advice: "當前 PM2.5 濃度適合戶外運動，敏感族群無需特殊防護。",
    };
  if (pm25 <= 55)
    return {
      icon: "shield",
      iconColor: "#ff8c00",
      advice: "空氣品質普通，敏感族群建議減少長時間戶外活動。",
    };
  return {
    icon: "alert-triangle",
    iconColor: "#e53935",
    advice: "空氣品質不佳，建議外出配戴口罩，敏感族群避免戶外活動。",
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
    gridCells,
    setGridCells,
    alerts,
    setAlerts,
    events,
    setEvents,
    isLoading,
    setIsLoading,
  } = useStore();

  const [locatedAqi,      setLocatedAqi]      = useState<number>(65);
  const [locatedPm25,     setLocatedPm25]     = useState<number>(12);
  const [locatedO3,       setLocatedO3]       = useState<number>(48);
  const [currentDistrict, setCurrentDistrict] = useState<string>('中壢區');
  const [currentWeather,  setCurrentWeather]  = useState<CurrentWeatherData>(MOCK_CURRENT);
  const [forecast,        setForecast]        = useState<ForecastDay[]>(generateMockForecast());
  const [past1hrRain,     setPast1hrRain]     = useState<string>('0.0');
  const [todayPrecipProb, setTodayPrecipProb] = useState<string>('--');

  useEffect(() => {
    loadData();
  }, [selectedScenario]);

  // 天氣 & 雨量：隨定位區域更新
 useEffect(() => {
  fetchCurrentWeather(currentDistrict).then(setCurrentWeather);
  fetchWeatherForecast(currentDistrict).then(({ days, todayPrecipProb }) => {
    setForecast(days);
    setTodayPrecipProb(todayPrecipProb);
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

  // 空氣品質數值：優先使用 EPA 測站即時資料
  const pm25 = locatedPm25;
  const o3 = locatedO3;
  const no2 = Math.round(pm25 * 0.3);

  const pm25Color = getPM25Color(pm25);
  const activityInfo = getActivityInfo(pm25);
  const pm25Progress = Math.min((pm25 / 75) * 100, 100);

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
        <TopNavigation 
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
                    {pm25}
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
                      {getPM25StatusLabel(pm25)}
                    </Text>
                  </View>
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
              {["0", "12", "35", "55", "75+"].map((v, i) => (
                <Text key={i} style={styles.hScaleText}>
                  {v}
                </Text>
              ))}
            </View>

            {/* Activity advice */}
            <View
              style={[
                styles.adviceRow,
                {
                  backgroundColor: `${activityInfo.iconColor}0D`,
                  borderColor: `${activityInfo.iconColor}28`,
                },
              ]}
            >
              <View
                style={[
                  styles.adviceIconBg,
                  { backgroundColor: `${activityInfo.iconColor}20` },
                ]}
              >
                <Feather
                  name={activityInfo.icon}
                  size={18}
                  color={activityInfo.iconColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>活動建議</Text>
                <Text style={[styles.adviceText]}>{activityInfo.advice}</Text>
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
                <View style={styles.miniBarTrack}>
                  <View
                    style={[
                      styles.miniBarFill,
                      {
                        width: `${Math.min((o3 / 100) * 100, 100)}%`,
                        backgroundColor: getO3Color(o3),
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.miniPollutRight}>
                <Text style={[styles.miniPollutVal, { color: getO3Color(o3) }]}>
                  {o3}
                </Text>
                <Text style={styles.miniPollutUnit}>ppb</Text>
              </View>
            </View>

            {/* NO2 row */}
            <View style={[styles.miniPollutRow, { marginBottom: 0 }]}>
              <View style={styles.miniPollutLeft}>
                <Text style={styles.miniPollutName}>NO₂</Text>
                <Text style={styles.miniPollutSub}>二氧化氮</Text>
              </View>
              <View style={styles.miniPollutBar}>
                <View style={styles.miniBarTrack}>
                  <View
                    style={[
                      styles.miniBarFill,
                      {
                        width: `${Math.min((no2 / 100) * 100, 100)}%`,
                        backgroundColor: getNO2Color(no2),
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.miniPollutRight}>
                <Text
                  style={[styles.miniPollutVal, { color: getNO2Color(no2) }]}
                >
                  {no2}
                </Text>
                <Text style={styles.miniPollutUnit}>ppb</Text>
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

            {/* Stats row — UV 移除，降水改為過去一小時雨量 */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF6F9",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF6F9",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#E76595",
  },
  scrollView: { flex: 1 },

  // ── Gauge ──
  gaugeSection: {
    alignItems: "center",
    paddingTop: 35,
    paddingVertical: 20,
    paddingBottom: 8,
  },
  gaugeInnerCircle: {
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  gaugeLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "500",
    letterSpacing: 2,
    marginBottom: 6,
  },
  gaugeValue: {
    fontSize: 48,
    fontWeight: "bold",
    lineHeight: 48,
    marginTop: 4,
    marginBottom: 4,
  },
  gaugePill: { 
    marginTop: 5, 
    paddingHorizontal: 10, 
    paddingVertical: 3, 
    borderRadius: 999, 
    borderWidth: 1, 
  },
  gaugeBadgeText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // ── Insight ──
  insightSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  insightIconContainer: { marginTop: 2 },
  insightIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(231, 101, 149, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  insightContent: { flex: 1 },
  insightTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#666",
    letterSpacing: 1,
    marginBottom: 8,
  },
  insightText: { fontSize: 15, color: "#374151", lineHeight: 22 },
  highlightText: { color: "#E76595", fontWeight: "bold" },

  // ── Shared card container ──
  sectionPad: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  cardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#666",
    letterSpacing: 1.2,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginVertical: 16,
  },

  // ── AQI badge ──
  aqiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  aqiBadgeLabelText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  aqiBadgeValueText: { fontSize: 14, fontWeight: "bold" },

  // ── PM2.5 prominent ──
  pm25Row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  pm25Tag: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  pm25ValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  pm25BigNum: {
    fontSize: 52,
    fontWeight: "bold",
    lineHeight: 54,
  },
  pm25UnitText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 4,
    marginRight: 6,
  },
  pm25StatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  pm25StatusLabel: { fontSize: 12, fontWeight: "600" },

  // ── Horizontal progress bar ──
  hProgressTrack: {
    height: 6,
    backgroundColor: "rgba(0,0,0,0.07)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  hProgressFill: { height: "100%", borderRadius: 3 },
  hProgressScale: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  hScaleText: { fontSize: 10, color: "#bbb" },

  // ── Advice row ──
  adviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  adviceIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  adviceText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },

  // ── Mini pollutant rows (O3, NO2) ──
  miniPollutRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  miniPollutLeft: { width: 44 },
  miniPollutName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#444",
  },
  miniPollutSub: {
    fontSize: 10,
    color: "#aaa",
    marginTop: 1,
  },
  miniPollutBar: { flex: 1 },
  miniBarTrack: {
    height: 6,
    backgroundColor: "rgba(0,0,0,0.07)",
    borderRadius: 3,
    overflow: "hidden",
  },
  miniBarFill: { height: "100%", borderRadius: 3 },
  miniPollutRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    width: 52,
    justifyContent: "flex-end",
  },
  miniPollutVal: { fontSize: 15, fontWeight: "700" },
  miniPollutUnit: { fontSize: 10, color: "#aaa" },

  // ── Weather card ──
  districtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(251, 167, 188, 0.12)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(251, 167, 188, 0.25)",
  },
  districtBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FBA7BC",
  },
  weatherCurrentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  weatherTempBig: {
    fontSize: 54,
    fontWeight: "bold",
    color: "#222",
    lineHeight: 58,
  },
  weatherDesc: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  weatherIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(231, 101, 149, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  weatherStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.025)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  weatherStatItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  weatherStatVal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
    marginTop: 2,
  },
  weatherStatLabel: {
    fontSize: 10,
    color: "#aaa",
  },
  weatherStatSep: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(0,0,0,0.07)",
  },

  // ── 3-day forecast ──
  forecastTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  forecastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  forecastDayCol: {
    flex: 1,
    alignItems: "center",
  },
  forecastDayColBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.07)",
    marginRight: 0,
  },
  forecastLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#444",
  },
  forecastDate: {
    fontSize: 10,
    color: "#bbb",
    marginTop: 2,
  },
  forecastTempRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  forecastTempHigh: {
    fontSize: 13,
    fontWeight: "700",
    color: "#e05c2a",
  },
  forecastTempLow: {
    fontSize: 13,
    color: "#FBA7BC",
    fontWeight: "600",
  },
  forecastPopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  forecastPopText: {
    fontSize: 11,
    color: "#bbb",
    fontWeight: "600",
  },
  weatherHighLow: {
    fontSize: 12, color: '#999', marginTop: 2,
  },

  bottomSpacing: { height: 100 },
});
