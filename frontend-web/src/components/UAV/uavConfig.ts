// Parameter display configuration for UAV vertical profile chart
// Keys match the column names returned by PostgreSQL from uav_profile view.
// Most columns are lowercased (unquoted identifiers), but "PM2.5" is quoted
// in the view definition so it retains the dot in the JSON response.

export type ParameterId =
  | 't' | 'rh' | 'p' | 'ws' | 'wd' | 'theta'
  | 'pm1' | 'PM2.5' | 'pm10'
  | 'o3' | 'no2' | 'so2' | 'co' | 'co2';

export type CategoryId = 'meteorology' | 'aerosol' | 'gas';

/** Controls how the X-axis domain (min/max) is computed for each parameter */
export type DomainType = 'zero-based' | 'data-range' | 'fixed';

export interface ParameterConfig {
  label: string;
  unit: string;
  color: string;
  category: CategoryId;
  /** Strategy for calculating the X-axis domain */
  domainType: DomainType;
  /** Only used when domainType === 'fixed', e.g. wind direction [0, 360] */
  domainFixed?: [number, number];
  /** Padding applied to each end of the computed domain, in the parameter's own units */
  domainPadding: number;
}

export const PARAMETER_CONFIG: Record<ParameterId, ParameterConfig> = {
  // 氣象
  t:       { label: '氣溫',      unit: '°C',    color: '#e74c3c', category: 'meteorology', domainType: 'data-range', domainPadding: 1.5 },
  rh:      { label: '相對濕度',  unit: '%',     color: '#3498db', category: 'meteorology', domainType: 'data-range', domainPadding: 2   },
  p:       { label: '氣壓',      unit: 'hPa',   color: '#9b59b6', category: 'meteorology', domainType: 'data-range', domainPadding: 1   },
  ws:      { label: '風速',      unit: 'm/s',   color: '#2ecc71', category: 'meteorology', domainType: 'zero-based', domainPadding: 1   },
  wd:      { label: '風向',      unit: '°',     color: '#1abc9c', category: 'meteorology', domainType: 'fixed',      domainFixed: [0, 360], domainPadding: 0 },
  theta:   { label: '位溫',      unit: 'K',     color: '#e67e22', category: 'meteorology', domainType: 'data-range', domainPadding: 1.5 },
  // 氣膠
  pm1:     { label: 'PM1',       unit: 'μg/m³', color: '#f39c12', category: 'aerosol',     domainType: 'zero-based', domainPadding: 2   },
  'PM2.5': { label: 'PM2.5',     unit: 'μg/m³', color: '#e67e22', category: 'aerosol',     domainType: 'zero-based', domainPadding: 2   },
  pm10:    { label: 'PM10',      unit: 'μg/m³', color: '#d35400', category: 'aerosol',     domainType: 'zero-based', domainPadding: 2   },
  // 氣體
  o3:      { label: '臭氧',      unit: 'ppb',   color: '#27ae60', category: 'gas',         domainType: 'zero-based', domainPadding: 2   },
  no2:     { label: '二氧化氮',  unit: 'ppb',   color: '#c0392b', category: 'gas',         domainType: 'zero-based', domainPadding: 2   },
  so2:     { label: '二氧化硫',  unit: 'ppb',   color: '#8e44ad', category: 'gas',         domainType: 'zero-based', domainPadding: 2   },
  co:      { label: '一氧化碳',  unit: 'ppm',   color: '#795548', category: 'gas',         domainType: 'zero-based', domainPadding: 0.5 },
  co2:     { label: '二氧化碳',  unit: 'ppm',   color: '#607d8b', category: 'gas',         domainType: 'zero-based', domainPadding: 5   },
};

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  meteorology: '氣象',
  aerosol:     '氣膠',
  gas:         '氣體',
};

export const ALL_PARAMETER_IDS = Object.keys(PARAMETER_CONFIG) as ParameterId[];

/** Default parameters shown on page load */
export const DEFAULT_PARAMETERS: ParameterId[] = ['PM2.5', 'ws', 'wd', 't'];

/* ─── Domain helper ──────────────────────────────────────────────────── */

import type { ParamStats } from './UAVProfileChart';

/**
 * Computes the X-axis [min, max] domain for a single parameter based on the
 * domainType rule in PARAMETER_CONFIG.
 *
 * Returns null when stats indicate the parameter has no data at all —
 * the caller is responsible for rendering an empty-state placeholder.
 */
export function computeParamDomain(
  id: ParameterId,
  stats: ParamStats | undefined,
): [number, number] | null {
  const cfg = PARAMETER_CONFIG[id];

  if (cfg.domainType === 'fixed') {
    return cfg.domainFixed ?? [0, 1];
  }

  if (!stats || !stats.hasData) return null;

  if (cfg.domainType === 'zero-based') {
    return [0, Math.ceil(stats.max) + cfg.domainPadding];
  }

  // data-range
  return [
    Math.floor(stats.min) - cfg.domainPadding,
    Math.ceil(stats.max) + cfg.domainPadding,
  ];
}
