import { CurrentWeatherData, ForecastDay } from '../types';

export type { CurrentWeatherData, ForecastDay } from '../types';
declare const process: { env: Record<string, string | undefined> };

export type WeatherIconKey = 'sun' | 'cloud' | 'cloud-rain' | 'cloud-drizzle' | 'cloud-lightning';

const CWA_DISTRICT_STATION_MAP: Record<string, string> = {
  // CWA current-weather data is station-based, so each district points to one representative station.
  // 對應依 cwa_stations_schema.sql 內各測站 address 所在行政區挑一個代表測站。
  新屋區: '467050',
  楊梅區: 'C0C660',
  復興區: 'C0C460',
  觀音區: 'C0C740',
  大園區: 'C0C720',
  大溪區: 'C0C630',
  中壢區: 'C0C700',
  龜山區: 'C0C680',
  龍潭區: 'C0C670',
  平鎮區: 'C0C650',
  蘆竹區: 'C0C620',
  八德區: 'C0C490',
};

const CWA_STATION_META: Record<string, { name: string; type: string }> = {
  '467050': { name: '新屋', type: '署屬有人站' },
  C1C510: { name: '水尾', type: '署屬自動站' },
  C0C800: { name: '四稜', type: '署屬自動站' },
  C0C790: { name: '東眼山', type: '署屬自動站' },
  C0C750: { name: '新興坑尾', type: '署屬自動站' },
  C0C740: { name: '觀音工業區', type: '署屬自動站' },
  C0C730: { name: '中大臨海站', type: '署屬自動站' },
  C0C720: { name: '竹圍', type: '署屬自動站' },
  C0C710: { name: '大溪永福', type: '署屬自動站' },
  C0C700: { name: '中壢', type: '署屬自動站' },
  C0C680: { name: '龜山', type: '署屬自動站' },
  C0C670: { name: '龍潭', type: '署屬自動站' },
  C0C660: { name: '楊梅', type: '署屬自動站' },
  C0C650: { name: '平鎮', type: '署屬自動站' },
  C0C630: { name: '大溪', type: '署屬自動站' },
  C0C620: { name: '蘆竹', type: '署屬自動站' },
  C0C490: { name: '八德', type: '署屬自動站' },
  C0C460: { name: '復興', type: '署屬自動站' },
  '72C440': { name: '桃園農改場', type: '農業站' },
  '82C160': { name: '茶改場', type: '農業站' },
  A2C560: { name: '農工中心', type: '農業站' },
  C2C410: { name: '中央大學', type: '農業站' },
  C2C590: { name: '觀音', type: '農業站' },
};

const getCwaStationId = (station: any): string | undefined =>
  station?.StationId ?? station?.StationID ?? station?.Station?.StationId ?? station?.Station?.StationID;

const getCwaTownName = (station: any): string | undefined =>
  station?.GeoInfo?.TownName ?? station?.StationPosition?.TownName;

const pickCwaStation = (stations: any[], district: string): any | undefined => {
  const stationId = CWA_DISTRICT_STATION_MAP[district];
  if (stationId) {
    const exact = stations.find(station => getCwaStationId(station) === stationId);
    if (exact) return exact;
  }

  const keyword = district.replace('區', '');
  return stations.find(station => getCwaTownName(station)?.includes(keyword)) ?? stations[0];
};

export const getWeatherIconKey = (w: string): WeatherIconKey => {
  if (w.includes('雷')) return 'cloud-lightning';
  if (w.includes('大雨') || w.includes('豪雨')) return 'cloud-rain';
  if (w.includes('雨') || w.includes('陣雨')) return 'cloud-drizzle';
  if (w.includes('陰') || w.includes('多雲')) return 'cloud';
  if (w.includes('晴')) return 'sun';
  return 'cloud';
};

// ─── 假資料（API 失敗或未設定金鑰時的 fallback 之後可以改成目前無資料之類的或是錯誤） ───────────────────────────
export const MOCK_CURRENT_WEATHER: CurrentWeatherData = {
  temperature: '24',
  weather: '晴時多雲',
  humidity: '68',
  windSpeed: '2.5',
  dailyHigh: '28',
  dailyLow: '19',
};

export const generateMockForecast = (): ForecastDay[] => {
  const DAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
  const now = new Date();
  return [1, 2, 3].map(i => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return {
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      dateLabel: `週${DAY_CHARS[d.getDay()]}`,
      maxTemp: String(28 - i),
      minTemp: String(19 + i),
      weather: i === 2 ? '短暫陣雨' : '晴',
      precipProb: i === 2 ? '60' : '10',
    };
  });
};

const resolveApiKey = (apiKey?: string): string | undefined => {
  if (apiKey) return apiKey;
  return undefined;
};

// ─── 現在天氣觀測 (O-A0001-001) ─────────────────────────────────────────────

async function _fetchCurrentWeather(
  district: string,
  key: string | undefined,
): Promise<{ data: CurrentWeatherData; isFallback: boolean }> {
  if (!key) {
    console.warn('[CWA] API key 未設定，使用假資料');
    return { data: MOCK_CURRENT_WEATHER, isFallback: true };
  }

  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001` +
    `?Authorization=${key}&CountyName=桃園市&format=JSON`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[CWA] 現況 API 錯誤 HTTP ${res.status}`);
      return { data: MOCK_CURRENT_WEATHER, isFallback: true };
    }
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    if (stations.length === 0) return { data: MOCK_CURRENT_WEATHER, isFallback: true };

    const st = pickCwaStation(stations, district);
    if (!st) return { data: MOCK_CURRENT_WEATHER, isFallback: true };
    const obs = st.WeatherElement ?? {};

    const parseNum = (val: any, fallback: string, round = false) => {
      const n = parseFloat(val);
      if (isNaN(n) || n <= -90) {
        console.log(`[CWA] 該測站此欄位無有效資料(-99)，改用假資料`);
        return fallback;
      }
      if (!obs.Weather || obs.Weather === '-99') {
        console.log(`[CWA] 天氣描述無有效資料(-99)，改用假資料`);
      }
      return round ? String(Math.round(n)) : String(n);
    };
    const stationId = getCwaStationId(st);
    const stationMeta = stationId ? CWA_STATION_META[stationId] : undefined;
    const stationName = stationMeta?.name ?? st.StationName;
    const stationType = stationMeta?.type;

    console.log(`[CWA] 現況 ${stationName ?? district} → ${obs.AirTemperature}°C ${obs.Weather}`);
    return {
      data: {
        stationId,
        stationName,
        stationType,
        district,
        temperature: parseNum(obs.AirTemperature, MOCK_CURRENT_WEATHER.temperature, true),
        weather: (obs.Weather && obs.Weather !== '-99') ? obs.Weather : MOCK_CURRENT_WEATHER.weather,
        humidity: parseNum(obs.RelativeHumidity, MOCK_CURRENT_WEATHER.humidity),
        windSpeed: parseNum(obs.WindSpeed, MOCK_CURRENT_WEATHER.windSpeed),
        dailyHigh: parseNum(obs.DailyExtreme?.DailyHigh?.TemperatureInfo?.AirTemperature, MOCK_CURRENT_WEATHER.dailyHigh, true),
        dailyLow:  parseNum(obs.DailyExtreme?.DailyLow?.TemperatureInfo?.AirTemperature,  MOCK_CURRENT_WEATHER.dailyLow, true),
      },
      isFallback: false,
    };
  } catch (err) {
    console.error('[CWA] 現況資料請求失敗：', err);
    return { data: MOCK_CURRENT_WEATHER, isFallback: true };
  }
}

export const fetchCurrentWeather = async (
  district: string,
  apiKey?: string,
): Promise<CurrentWeatherData> => {
  const { data } = await _fetchCurrentWeather(district, resolveApiKey(apiKey));
  return data;
};

// ─── 天氣代表性選取輔助（多時段取最嚴重天氣描述） ──────────────────────────
const WEATHER_SEVERITY: [string, number][] = [
  ['雷雨', 6], ['豪雨', 5], ['大雨', 4],
  ['短暫陣雨或雷雨', 4], ['短暫陣雨', 3], ['陣雨', 3], ['有雨', 3],
  ['陰', 2], ['多雲', 1], ['晴', 0],
];

const pickDayWeather = (wxTimes: any[]): string => {
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

// ─── 未來 3 天預報 (F-D0047-005) ────────────────────────────────────────────
export const fetchWeatherForecast = async (
  district: string,
  apiKey?: string,
): Promise<{ days: ForecastDay[]; todayPrecipProb: string }> => {
  const mock = { days: generateMockForecast(), todayPrecipProb: '10' };
  const key = resolveApiKey(apiKey);
  if (!key) {
    console.warn('[CWA] API key 未設定，使用假資料');
    return mock;
  }

  const DAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005` +
    `?Authorization=${key}&LocationsName=桃園市&LocationName=${district}&format=JSON`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[CWA] 預報 API 錯誤 HTTP ${res.status}`);
      return mock;
    }
    const json = await res.json();
    const allLocations: any[] = json?.records?.Locations?.[0]?.Location ?? [];
    const loc = allLocations.find(l => l.LocationName === district) ?? allLocations[0];
    if (!loc) return mock;

    const elemMap: Record<string, any[]> = {};
    (loc.WeatherElement ?? []).forEach((el: any) => {
      elemMap[el.ElementName] = el.Time ?? [];
    });

    const tempTimes = elemMap['溫度'] ?? [];
    const wxTimes = elemMap['天氣現象'] ?? [];
    const popTimes = elemMap['3小時降雨機率'] ?? [];

    const dayMaxPop = (dateStr: string) => {
      const vals = popTimes
        .filter((t: any) => (t.StartTime ?? '').startsWith(dateStr))
        .map((t: any) => parseInt(t.ElementValue?.[0]?.ProbabilityOfPrecipitation ?? '0', 10))
        .filter((v: number) => !isNaN(v));
      return vals.length ? Math.max(...vals) : null;
    };

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayPrecipProb = String(dayMaxPop(todayStr) ?? 10);

    const days: ForecastDay[] = [1, 2, 3].map(i => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const temps = tempTimes
        .filter((t: any) => (t.DataTime ?? '').startsWith(dateStr))
        .map((t: any) => parseFloat(t.ElementValue?.[0]?.Temperature ?? 'NaN'))
        .filter((v: number) => !isNaN(v));
      const maxTemp = temps.length ? String(Math.max(...temps)) : String(28 - i);
      const minTemp = temps.length ? String(Math.min(...temps)) : String(19 + i);

      const precipProb = String(dayMaxPop(dateStr) ?? (i === 2 ? 60 : 10));

      const dayWx = wxTimes.filter((t: any) => (t.StartTime ?? '').startsWith(dateStr));
      const weather = pickDayWeather(dayWx);

      return {
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        dateLabel: `週${DAY_CHARS[d.getDay()]}`,
        maxTemp, minTemp, weather, precipProb,
      };
    });

    return { days, todayPrecipProb };
  } catch (err) {
    console.error('[CWA] 預報資料請求失敗：', err);
    return mock;
  }
};

// ─── 過去 1 小時雨量 (O-A0002-001) ──────────────────────────────────────────
export const fetchPast1hrRainfall = async (
  district: string,
  apiKey?: string,
): Promise<string> => {
  const key = resolveApiKey(apiKey);
  if (!key) return '0.0';

  const url =
    `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001` +
    `?Authorization=${key}&format=JSON&RainfallElement=Past1hr`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[CWA] 雨量 API 錯誤 HTTP ${res.status}`);
      return '0.0';
    }
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    const st = pickCwaStation(stations, district) ?? null;
    return st?.RainfallElement?.Past1hr?.Precipitation ?? '0.0';
  } catch (err) {
    console.error('[CWA] 雨量資料請求失敗：', err);
    return '0.0';
  }
};

// ─── 整合便利函式：一次拿齊現況／預報／雨量 ─────────────────────────────────
export interface CwaWeatherBundle {
  current: CurrentWeatherData;
  forecast: ForecastDay[];
  todayPrecipProb: string;
  past1hrRain: string;
  /** true 代表 current 是 mock 資料（API key 未設定或請求失敗） */
  usedFallback?: boolean;
}

export const fetchCwaWeather = async (
  district: string,
  apiKey?: string,
): Promise<CwaWeatherBundle> => {
  const key = resolveApiKey(apiKey);
  const [currentResult, forecastResult, past1hrRain] = await Promise.all([
    _fetchCurrentWeather(district, key),
    fetchWeatherForecast(district, apiKey),
    fetchPast1hrRainfall(district, apiKey),
  ]);

  return {
    current: currentResult.data,
    forecast: forecastResult.days,
    todayPrecipProb: forecastResult.todayPrecipProb,
    past1hrRain,
    usedFallback: currentResult.isFallback,
  };
};
