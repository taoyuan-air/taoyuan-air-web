import { 
  GridCell, Station, VerticalProfile, ForecastSeries, 
  EventItem, Alert, Meta, HealthAdvisory, Pollutant, 
  TargetType, Scenario 
} from '../types';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 桃園市邊界框
const TAOYUAN_BOUNDS = {
  north: 25.2,
  south: 24.8,
  east: 121.5,
  west: 121.0
};

// 生成3km網格
const generateGrid = (scenario: Scenario = 'normal'): GridCell[] => {
  const grids: GridCell[] = [];
  const latStep = 0.027; // 約3km
  const lngStep = 0.027;
  
  let gridId = 1;
  for (let lat = TAOYUAN_BOUNDS.south; lat < TAOYUAN_BOUNDS.north; lat += latStep) {
    for (let lng = TAOYUAN_BOUNDS.west; lng < TAOYUAN_BOUNDS.east; lng += lngStep) {
      const centerLat = lat + latStep / 2;
      const centerLng = lng + lngStep / 2;
      
      let pm25Value = 30 + Math.random() * 90; // 30-120 更大範圍
      
      if (scenario === 'industrial') {
        // 觀音、大園、龜山區域較高
        if (centerLat > 25.0 && centerLng < 121.3) {
          pm25Value = 80 + Math.random() * 40; // 80-120
        }
      } else if (scenario === 'event') {
        pm25Value = 100 + Math.random() * 60; // 100-160
      }
      
      const aqi = Math.round(pm25Value * 2);
      let healthLevel: any = '良好';
      if (aqi > 100) healthLevel = '對敏感族群不健康';
      if (aqi > 150) healthLevel = '對所有族群不健康';
      
      grids.push({
        gridId: `G${gridId.toString().padStart(3, '0')}`,
        polygonCoords: [
          { latitude: lat, longitude: lng },
          { latitude: lat + latStep, longitude: lng },
          { latitude: lat + latStep, longitude: lng + lngStep },
          { latitude: lat, longitude: lng + lngStep }
        ],
        centerLatLng: { latitude: centerLat, longitude: centerLng },
        values: {
          pollutant: 'PM25',
          value: Math.round(pm25Value),
          unit: 'µg/m³'
        },
        meteo: {
          temp: 22 + Math.random() * 8,
          humidity: 60 + Math.random() * 30,
          windSpeed: 2 + Math.random() * 5,
          windDir: Math.random() * 360
        },
        updatedAt: new Date().toISOString(),
        health: {
          aqi,
          level: healthLevel,
          outdoorActivity: aqi > 100 ? '謹慎' : '建議',
          maskRequired: aqi > 100,
          sensitiveGroups: aqi > 100 ? ['兒童', '老人', '心肺疾病患者'] : [],
          summary: aqi > 100 ? '空氣品質對敏感族群不健康' : '空氣品質良好'
        }
      });
      gridId++;
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
    role: 'epa'
  };
};

export const getStations = async ({ pollutant, timestamp }: { pollutant: Pollutant; timestamp?: string }): Promise<Station[]> => {
  await delay(500);
  return mockStations;
};

export const getGrid = async ({ pollutant, timestamp }: { pollutant: Pollutant; timestamp?: string }): Promise<GridCell[]> => {
  await delay(800);
  return generateGrid(currentScenario);
};

export const getVerticalProfile = async ({ gridId, timestamp }: { gridId: string; timestamp: string }): Promise<VerticalProfile> => {
  await delay(400);
  const layers = [];
  for (let alt = 0; alt <= 1000; alt += 100) {
    const baseValue = 50;
    const altitudeFactor = Math.exp(-alt / 500); // 高度衰減
    const value = baseValue * altitudeFactor + Math.random() * 10;
    layers.push({ altitudeM: alt, value: Math.round(value) });
  }
  
  return {
    gridId,
    timestamp,
    layers
  };
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
  
  return {
    aqi,
    level,
    outdoorActivity,
    maskRequired,
    sensitiveGroups,
    summary
  };
};