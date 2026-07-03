export type Pollutant = 'PM25' | 'O3' | 'NOX' | 'VOCs';
export type Mode = 'NOW' | 'FORECAST';
export type Role = 'moe' | 'team';
export type Scenario = 'normal' | 'industrial' | 'event';
export type StationType = 'MOENV' | 'LOCAL' | 'NCU';
export type Severity = '低' | '中' | '高';
export type HealthLevel = '良好' | '普通' | '對敏感族群不健康' | '對所有族群不健康';
export type OutdoorActivity = '建議' | '謹慎' | '避免';
export type AlertKind = 'GOV' | 'HEALTH';
export type TargetType = 'GRID' | 'STATION';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface HealthAdvisory {
  aqi: number;
  level: HealthLevel;
  outdoorActivity: OutdoorActivity;
  maskRequired: boolean;
  sensitiveGroups: string[];
  summary: string;
}

export interface PollutantValue {
  pollutant: Pollutant;
  value: number;
  unit: string;
}

export interface MeteoData {
  temp: number;
  humidity: number;
  windSpeed: number;
  windDir: number;
}

export interface GridCell {
  gridId: string;
  polygonCoords: LatLng[];
  centerLatLng: LatLng;
  values: PollutantValue;
  meteo: MeteoData;
  updatedAt: string;
  health: HealthAdvisory;
}

export interface Station {
  id: string;
  name: string;
  type: StationType;
  latLng: LatLng;
  values: PollutantValue;
  updatedAt: string;
}

export interface MoeStationData {
  sitename: string;
  aqi: number;
  pm25: number;
  pm10: number;
  o3: number;
  nox: number;
  so2: number;
  co: number;
  no2: number;
  datacreationdate?: string;
}

export interface VerticalProfile {
  gridId: string;
  timestamp: string;
  layers: Array<{
    altitudeM: number;
    value: number;
  }>;
}

export interface ForecastSeries {
  targetType: TargetType;
  targetId: string;
  pollutant: Pollutant;
  points: Array<{
    timestamp: string;
    value: number;
  }>;
}

export interface EventItem {
  id: string;
  date: string;
  type: string;
  severity: Severity;
  area: string;
  note: string;
  healthImpact: Severity;
}

export interface Alert {
  id: string;
  kind: AlertKind;
  targetType: TargetType;
  targetId: string;
  pollutant: Pollutant;
  threshold: number;
  enabled: boolean;
  createdAt: string;
  message: string;
}

export interface Meta {
  mode: Mode;
  forecastHorizonHours: number;
  gridSizeKm: number;
  lastUpdate: string;
  role: Role;
}

export interface CurrentWeatherData {
  temperature: string;
  weather: string;
  humidity: string;
  windSpeed: string;
  dailyHigh: string;
  dailyLow: string;
}

export interface ForecastDay {
  label: string;      // e.g. 4/7
  dateLabel: string;  // e.g. 週一
  maxTemp: string;
  minTemp: string;
  weather: string;
  precipProb: string;
}

export interface TEDSPoint {
  id: string;
  name?: string;
  latLng: LatLng;
  heightM?: number;
  source?: string;
}

export interface ExamPoint {
  id: string;
  name: string;
  latLng: LatLng;
  source: '汞';
  note?: string;
}
