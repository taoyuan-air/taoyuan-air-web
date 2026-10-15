import {
  GridCell, Station, VerticalProfile, ForecastSeries,
  EventItem, Alert, Meta, HealthAdvisory, Pollutant,
  TargetType, Scenario, TEDSPoint, ExamPoint 
} from '../types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    return grid;
  } catch (error) {
    console.warn('Grid API 連線失敗，不顯示網格資料:', error);
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

export const getHealthAdvisory = async ({ pollutant, value, trend }: { pollutant: Pollutant; value: number; trend?: string }): Promise<HealthAdvisory> => {
  await delay(200);
  const aqi = Math.round(value * 2);

  let level: any = '良好';
  let outdoorActivity: any = '建議';
  let maskRequired = false;
  let sensitiveGroups: string[] = [];
  let summary = '空氣品質良好，適合戶外活動';

  if (aqi > 50) {
    level = '普通';
    summary = '空氣品質普通';
  }
  if (aqi > 100) {
    level = '對敏感族群不健康';
    outdoorActivity = '謹慎';
    maskRequired = true;
    sensitiveGroups = ['兒童', '老人', '心肺疾病患者'];
    summary = '敏感族群應減少戶外活動';
  }
  if (aqi > 150) {
    level = '對所有族群不健康';
    outdoorActivity = '避免';
    summary = '所有人群應避免戶外活動';
  }

  return { aqi, level, outdoorActivity, maskRequired, sensitiveGroups, summary };
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