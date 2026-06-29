// Parameter display configuration for UAV vertical profile chart
// Keys match the column names returned by PostgreSQL from uav_profile view.
// Most columns are lowercased (unquoted identifiers), but "PM2.5" is quoted
// in the view definition so it retains the dot in the JSON response.

export type ParameterId =
  | 't' | 'rh' | 'p' | 'ws' | 'wd' | 'theta'
  | 'pm1' | 'PM2.5' | 'pm10'
  | 'o3' | 'no2' | 'so2' | 'co' | 'co2';

export type CategoryId = 'meteorology' | 'aerosol' | 'gas';

export interface ParameterConfig {
  label: string;
  unit: string;
  color: string;
  category: CategoryId;
}

export const PARAMETER_CONFIG: Record<ParameterId, ParameterConfig> = {
  // 氣象
  t:       { label: '氣溫',      unit: '°C',    color: '#e74c3c', category: 'meteorology' },
  rh:      { label: '相對濕度',  unit: '%',     color: '#3498db', category: 'meteorology' },
  p:       { label: '氣壓',      unit: 'hPa',   color: '#9b59b6', category: 'meteorology' },
  ws:      { label: '風速',      unit: 'm/s',   color: '#2ecc71', category: 'meteorology' },
  wd:      { label: '風向',      unit: '°',     color: '#1abc9c', category: 'meteorology' },
  theta:   { label: '位溫',      unit: 'K',     color: '#e67e22', category: 'meteorology' },
  // 氣膠
  pm1:     { label: 'PM1',       unit: 'μg/m³', color: '#f39c12', category: 'aerosol' },
  'PM2.5': { label: 'PM2.5',     unit: 'μg/m³', color: '#e67e22', category: 'aerosol' },
  pm10:    { label: 'PM10',      unit: 'μg/m³', color: '#d35400', category: 'aerosol' },
  // 氣體
  o3:      { label: '臭氧',      unit: 'ppb',   color: '#27ae60', category: 'gas' },
  no2:     { label: '二氧化氮',  unit: 'ppb',   color: '#c0392b', category: 'gas' },
  so2:     { label: '二氧化硫',  unit: 'ppb',   color: '#8e44ad', category: 'gas' },
  co:      { label: '一氧化碳',  unit: 'ppm',   color: '#795548', category: 'gas' },
  co2:     { label: '二氧化碳',  unit: 'ppm',   color: '#607d8b', category: 'gas' },
};

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  meteorology: '氣象',
  aerosol:     '氣膠',
  gas:         '氣體',
};

export const ALL_PARAMETER_IDS = Object.keys(PARAMETER_CONFIG) as ParameterId[];

export const DEFAULT_PARAMETERS: ParameterId[] = ['t', 'rh'];
