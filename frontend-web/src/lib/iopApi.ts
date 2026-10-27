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
