import {
  GridCell, Station, VerticalProfile, ForecastSeries,
  EventItem, Alert, Meta, HealthAdvisory, Pollutant,
  TargetType, Scenario, TEDSPoint, ExamPoint, HealthLevel
} from '../types';
import { AQI_LEVELS } from '../constants/airHealth';
import { OFFICIAL_LEVEL_TEXT } from '../constants/officialText';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const ENABLE_PM25_DEMO_DATA = process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA !== 'false';

// PM2.5 → AQI 標準線性插值（環境部空氣品質指標官方公式）
const PM25_BREAKPOINTS: Array<{ cLow: number; cHigh: number; aqiLow: number; aqiHigh: number }> = [
  { cLow: 0,     cHigh: 12.4,  aqiLow: 0,   aqiHigh: 50  },
  { cLow: 12.5,  cHigh: 30.4,  aqiLow: 51,  aqiHigh: 100 },
  { cLow: 30.5,  cHigh: 50.4,  aqiLow: 101, aqiHigh: 150 },
  { cLow: 50.5,  cHigh: 125.4, aqiLow: 151, aqiHigh: 200 },
  { cLow: 125.5, cHigh: 225.4, aqiLow: 201, aqiHigh: 300 },
  { cLow: 225.5, cHigh: 500.4, aqiLow: 301, aqiHigh: 500 },
];

const pm25ToAqi = (pm25: number): number => {
  const c = Math.min(Math.max(pm25, 0), 500.4);
  const bp = PM25_BREAKPOINTS.find((b) => c >= b.cLow && c <= b.cHigh)
    ?? PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
  return Math.round(
    ((bp.aqiHigh - bp.aqiLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.aqiLow,
  );
};

const PM25_DEMO_BOUNDS = {
  north: 25.2,
  south: 24.8,
  east: 121.5,
  west: 121.0,
};

const buildHealthAdvisory = (aqi: number): HealthAdvisory => {
  const levelIdx = AQI_LEVELS.findIndex((l) => aqi >= l.min && aqi <= l.max);
  const level = AQI_LEVELS[levelIdx >= 0 ? levelIdx : AQI_LEVELS.length - 1];
  const text  = OFFICIAL_LEVEL_TEXT[level.id - 1];

  let outdoorActivity: HealthAdvisory['outdoorActivity'] = '建議';
  if (level.id === 3) outdoorActivity = '謹慎';
  if (level.id >= 4)  outdoorActivity = '避免';

  const maskRequired = level.id >= 3;

  const sensitiveGroups = level.id >= 3
    ? ['兒童', '老人', '孕婦', '心肺疾病患者', '氣喘患者']
    : level.id === 2 ? ['氣喘患者'] : [];

  return {
    aqi,
    level: level.label as HealthAdvisory['level'],
    outdoorActivity,
    maskRequired,
    sensitiveGroups,
    summary: text.healthImpact,
  };
}; 

const generateDemoGrid = (scenario: Scenario): GridCell[] => {
  const grids: GridCell[] = [];
  const latStep = 0.027;
  const lngStep = 0.027;
  let gridId = 1;

  for (let latitude = PM25_DEMO_BOUNDS.south; latitude < PM25_DEMO_BOUNDS.north; latitude += latStep) {
    for (let longitude = PM25_DEMO_BOUNDS.west; longitude < PM25_DEMO_BOUNDS.east; longitude += lngStep) {
      const centerLat = latitude + latStep / 2;
      const centerLng = longitude + lngStep / 2;
      let pm25Value = 30 + Math.random() * 90;

      if (scenario === 'industrial' && centerLat > 25.0 && centerLng < 121.3) {
        pm25Value = 80 + Math.random() * 40;
      } else if (scenario === 'event') {
        pm25Value = 100 + Math.random() * 60;
      }

      const pm25Rounded = Math.round(pm25Value);
      const aqi = pm25ToAqi(pm25Rounded);

      grids.push({
        gridId: `G${gridId.toString().padStart(3, '0')}`,
        polygonCoords: [
          { latitude, longitude },
          { latitude: latitude + latStep, longitude },
          { latitude: latitude + latStep, longitude: longitude + lngStep },
          { latitude, longitude: longitude + lngStep },
        ],
        centerLatLng: { latitude: centerLat, longitude: centerLng },
        values: { pollutant: 'PM25', value: pm25Rounded, unit: 'µg/m³' },
        meteo: {
          temp: 22 + Math.random() * 8,
          humidity: 60 + Math.random() * 30,
          windSpeed: 2 + Math.random() * 5,
          windDir: Math.random() * 360,
        },
        updatedAt: new Date().toISOString(),
        health: buildHealthAdvisory(aqi),
      });
      gridId += 1;
    }
  }

  return grids;
};

const mockStations: Station[] = [
  { id: 'TY01', name: '桃園站', type: 'MOENV', latLng: { latitude: 24.9937, longitude: 121.3010 }, values: { pollutant: 'PM25', value: 52, unit: 'µg/m³' }, updatedAt: new Date().toISOString() },
  { id: 'TY02', name: '大園站', type: 'LOCAL', latLng: { latitude: 25.0608, longitude: 121.2006 }, values: { pollutant: 'PM25', value: 48, unit: 'µg/m³' }, updatedAt: new Date().toISOString() },
  { id: 'TY03', name: '觀音站', type: 'MOENV', latLng: { latitude: 25.0355, longitude: 121.0842 }, values: { pollutant: 'PM25', value: 65, unit: 'µg/m³' }, updatedAt: new Date().toISOString() },
  { id: 'TY04', name: '中壢站', type: 'LOCAL', latLng: { latitude: 24.9536, longitude: 121.2252 }, values: { pollutant: 'PM25', value: 45, unit: 'µg/m³' }, updatedAt: new Date().toISOString() },
  { id: 'TY05', name: '平鎮站', type: 'NCU', latLng: { latitude: 24.9068, longitude: 121.2041 }, values: { pollutant: 'PM25', value: 42, unit: 'µg/m³' }, updatedAt: new Date().toISOString() }
];

let currentScenario: Scenario = 'normal';

export const setScenario = (scenario: Scenario) => {
  currentScenario = scenario;
};

export const getMeta = async (): Promise<Meta> => {
  await delay(300);
  return {
    mode: 'NOW',
    forecastHorizonHours: 24,
    gridSizeKm: 3,
    lastUpdate: new Date().toISOString(),
    role: 'moe'
  };
};

export const getStations = async ({ pollutant, timestamp }: { pollutant: Pollutant; timestamp?: string }): Promise<Station[]> => {
  await delay(500);
  return mockStations;
};

export const getTEDSPoints = async (baseUrl = '/api'): Promise<TEDSPoint[]> => {
  try {
    const response = await fetch(`${baseUrl}/teds-points`);
    if (!response.ok) {
      throw new Error(`後端回應錯誤 (HTTP ${response.status})`);
    }
    const points = await response.json();
    if (!Array.isArray(points)) {
      throw new Error('TEDS Points API 回傳格式錯誤');
    }
    return points;
  } catch (error) {
    console.error('TEDS Points API 連線失敗:', error);
    return [];
  }
};

export const getGrid = async ({ pollutant, timestamp }: { pollutant: Pollutant; timestamp?: string }): Promise<GridCell[]> => {
  try {
    const response = await fetch('/api/grid');
    if (!response.ok) {
      throw new Error(`後端回應錯誤 (HTTP ${response.status})`);
    }
    const grid = await response.json();
    if (!Array.isArray(grid)) {
      throw new Error('Grid API 回傳格式錯誤');
    }
    if (grid.length === 0 && pollutant === 'PM25' && ENABLE_PM25_DEMO_DATA) {
      return generateDemoGrid(currentScenario);
    }
    return grid;
  } catch (error) {
    console.warn('Grid API 連線失敗，PM2.5 使用展示資料:', error);
    if (pollutant === 'PM25' && ENABLE_PM25_DEMO_DATA) {
      return generateDemoGrid(currentScenario);
    }
    return [];
  }
};

export const getVerticalProfile = async ({ gridId, timestamp }: { gridId: string; timestamp: string }): Promise<VerticalProfile> => {
  await delay(400);
  const layers = [];
  for (let alt = 0; alt <= 1000; alt += 100) {
    const baseValue = 50;
    const altitudeFactor = Math.exp(-alt / 500);
    const value = baseValue * altitudeFactor + Math.random() * 10;
    layers.push({ altitudeM: alt, value: Math.round(value) });
  }
  return { gridId, timestamp, layers };
};

export const getForecastSeries = async ({ targetType, targetId, pollutant }: { targetType: TargetType; targetId: string; pollutant: Pollutant }): Promise<ForecastSeries> => {
  await delay(600);
  const points = [];
  const baseValue = 50;
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(Date.now() + i * 3600000).toISOString();
    const value = baseValue + Math.sin(i / 4) * 15 + Math.random() * 10;
    points.push({ timestamp, value: Math.round(value) });
  }
  return { targetType, targetId, pollutant, points };
};

export const getEvents = async (): Promise<EventItem[]> => {
  await delay(400);
  const events: EventItem[] = [
    {
      id: 'E001',
      date: new Date().toISOString(),
      type: '工業排放異常',
      severity: '中',
      area: '觀音工業區',
      note: '檢測到PM2.5濃度異常升高',
      healthImpact: '中'
    }
  ];
  if (currentScenario === 'event') {
    events.push({
      id: 'E002',
      date: new Date().toISOString(),
      type: '區域性污染事件',
      severity: '高',
      area: '全市',
      note: '大範圍空氣品質惡化',
      healthImpact: '高'
    });
  }
  return events;
};

export const getAlerts = async (): Promise<Alert[]> => {
  await delay(300);
  const alerts: Alert[] = [
    {
      id: 'A001',
      kind: 'GOV',
      targetType: 'GRID',
      targetId: 'G015',
      pollutant: 'PM25',
      threshold: 54,
      enabled: true,
      createdAt: new Date().toISOString(),
      message: 'PM2.5濃度超過預警值'
    }
  ];
  if (currentScenario !== 'normal') {
    alerts.push({
      id: 'A002',
      kind: 'HEALTH',
      targetType: 'GRID',
      targetId: 'G020',
      pollutant: 'PM25',
      threshold: 70,
      enabled: true,
      createdAt: new Date().toISOString(),
      message: '健康風險警報：建議敏感族群減少戶外活動'
    });
  }
  return alerts;
};

export const getHealthAdvisory = async ({ pollutant, value }: { pollutant: Pollutant; value: number; trend?: string }): Promise<HealthAdvisory> => {
  await delay(200);
  const aqi = pm25ToAqi(value);
  return buildHealthAdvisory(aqi);
};

export const getExamPoints = async (baseUrl = '/api'): Promise<ExamPoint[]> => {
  try {
    const response = await fetch(`${baseUrl}/exam-points`);
    if (!response.ok) {
      throw new Error(`後端回應錯誤 (HTTP ${response.status})`);
    }
    const points = await response.json();
    if (!Array.isArray(points)) {
      throw new Error('Exam Points API 回傳格式錯誤');
    }
    return points;
  } catch (error) {
    console.error('Exam Points API 連線失敗:', error);
    return [];
  }
};