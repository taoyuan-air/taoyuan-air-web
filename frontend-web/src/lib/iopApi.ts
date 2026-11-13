// IOP（密集觀測）API client
import { API_BASE } from './apiBase';

const BASE = `${API_BASE}/iop`;

export interface IOPSummary {
  iop_id: string;
  iop_name: string;
  start_date: string;   // 'YYYY-MM-DD'
  end_date: string;     // 'YYYY-MM-DD'
  description: string | null;
  trigger_samples: number;
  uav_samples: number;
  aerosol_samples: number;
}

export interface VOCsVariable {
  variables_id: number;
  variables_name: string;
  unit: string;
}

export interface VOCsSample {
  sample_id: number;
  site: string;
  sampling_type: 'trigger' | 'uav';
  sample_time: string;       // 'YYYY-MM-DD HH:MM'
  batch: number | null;
  height_m: number | null;
  canister_no: string;
  values: Record<string, number | string | null>;
}

export interface VOCsTable {
  iop_id: string;
  variables: VOCsVariable[];
  samples: VOCsSample[];
}

export async function fetchIOPs(): Promise<IOPSummary[]> {
  const res = await fetch(`${BASE}`);
  if (!res.ok) throw new Error(`無法取得 IOP 清單（HTTP ${res.status}）`);
  return res.json();
}

export async function fetchVOCs(
  iopId: string,
  samplingType?: 'trigger' | 'uav',
  site?: string,
): Promise<VOCsTable> {
  const params = new URLSearchParams();
  if (samplingType) params.set('sampling_type', samplingType);
  if (site) params.set('site', site);
  const qs = params.toString();
  const res = await fetch(`${BASE}/${encodeURIComponent(iopId)}/vocs${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`無法取得 VOCs 資料（HTTP ${res.status}）`);
  return res.json();
}

export function getVocsCSVUrl(
  iopId: string,
  samplingType?: 'trigger' | 'uav',
  site?: string,
): string {
  const params = new URLSearchParams();
  if (samplingType) params.set('sampling_type', samplingType);
  if (site) params.set('site', site);
  const qs = params.toString();
  return `${BASE}/${encodeURIComponent(iopId)}/vocs.csv${qs ? `?${qs}` : ''}`;
}

// ── 氣膠化學 ──────────────────────────────────────────────────────────────────

export interface AerosolVariable {
  variables_id: number;
  variables_name: string;
  unit: string;
}

export interface AerosolSample {
  sample_id: number;
  site: string;
  pm_size: string;           // 'PM2.5' | 'PM1'
  sample_date: string;       // 'YYYY-MM-DD'
  values: Record<string, number | string | null>;
}

export interface AerosolTable {
  iop_id: string;
  variables: AerosolVariable[];
  samples: AerosolSample[];
}

export async function fetchAerosol(
  iopId: string,
  pmSize?: 'PM2.5' | 'PM1',
  site?: string,
): Promise<AerosolTable> {
  const params = new URLSearchParams();
  if (pmSize) params.set('pm_size', pmSize);
  if (site) params.set('site', site);
  const qs = params.toString();
  const res = await fetch(`${BASE}/${encodeURIComponent(iopId)}/aerosol${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`無法取得氣膠化學資料（HTTP ${res.status}）`);
  return res.json();
}

export function getAerosolCSVUrl(
  iopId: string,
  pmSize?: 'PM2.5' | 'PM1',
  site?: string,
): string {
  const params = new URLSearchParams();
  if (pmSize) params.set('pm_size', pmSize);
  if (site) params.set('site', site);
  const qs = params.toString();
  return `${BASE}/${encodeURIComponent(iopId)}/aerosol.csv${qs ? `?${qs}` : ''}`;
}

// ── 空間推估圖 ────────────────────────────────────────────────────────────────

export interface SpatialImageList {
  iop_id: string;
  hourly: string[];        // e.g. ["PM25_XGB_2026-03-27_00.jpg", ...]
  daily_rf: string[];      // e.g. ["RF_2026-03-27.jpg", ...]
  daily_xgboost: string[]; // e.g. ["XGBoost_2026-03-27.jpg", ...]
}

export async function fetchSpatialImages(iopId: string): Promise<SpatialImageList> {
  const res = await fetch(`${BASE}/${encodeURIComponent(iopId)}/spatial-images`);
  if (!res.ok) throw new Error(`無法取得空間推估圖清單（HTTP ${res.status}）`);
  return res.json();
}

export function getSpatialImageUrl(
  iopId: string,
  imgType: 'hourly' | 'daily_rf' | 'daily_xgboost',
  filename: string,
): string {
  return `${BASE}/${encodeURIComponent(iopId)}/spatial-images/${imgType}/${encodeURIComponent(filename)}`;
}
