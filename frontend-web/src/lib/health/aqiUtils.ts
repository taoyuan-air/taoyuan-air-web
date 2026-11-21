import { AQI_LEVELS, POLLUTANT_BREAKPOINTS, type AqiLevel, type Pollutant } from '@shared/constants/airHealth';

/**
 * 依 AQI 數值回傳所屬級別。AQI 為整數;>500 一律歸「危害」(最後一級)。
 * 無效值或負值回傳 null。
 */
export function getAqiLevel(aqi: number): AqiLevel | null {
  if (!Number.isFinite(aqi) || aqi < 0) return null;
  const v = Math.round(aqi);
  return AQI_LEVELS.find((l) => v >= l.min && v <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1];
}

/**
 * 回傳濃度落在第幾級(0..5,對應 AQI_LEVELS 索引)。
 * 超出所有區間回傳最後一個有定義的級別;該污染物全段無定義或值無效回傳 -1。
 * 區間間隙(如 12.4 與 12.5 之間)以上限判斷:落在兩段之間的值歸下一級。
 */
export function bandIndexForConcentration(p: Pollutant, value: number): number {
  const bps = POLLUTANT_BREAKPOINTS[p];
  if (!Number.isFinite(value) || value < 0) return -1;
  let last = -1;
  for (let i = 0; i < bps.length; i++) {
    const r = bps[i];
    if (!r) continue;
    last = i;
    if (value <= r[1]) return i;
  }
  return last;
}

/** 依濃度區間索引取得對應 AqiLevel(用於取色/標籤)。 */
export function aqiLevelByIndex(index: number): AqiLevel | null {
  return index >= 0 && index < AQI_LEVELS.length ? AQI_LEVELS[index] : null;
}

/* ── 單位換算(集中於此)────────────────────────────── */
export const ppmToPpb = (ppm: number) => ppm * 1000;
export const ppbToPpm = (ppb: number) => ppb / 1000;

export interface HourPoint {
  /** epoch ms */
  t: number;
  v: number;
}

export interface AverageResult {
  avg: number;
  from: number;
  to: number;
  count: number;
}

/**
 * 取最新 n 筆逐時值計算平均;有效筆數需 ≥ minValid,否則回傳 null。
 * 無效(Number.isFinite 為 false)的值會被過濾。
 */
export function latestAverage(points: HourPoint[], n: number, minValid: number): AverageResult | null {
  const sorted = [...points].filter((p) => Number.isFinite(p.v)).sort((a, b) => a.t - b.t);
  const win = sorted.slice(-n);
  if (win.length < minValid) return null;
  const avg = win.reduce((s, p) => s + p.v, 0) / win.length;
  return { avg, from: win[0].t, to: win[win.length - 1].t, count: win.length };
}

/** 24 小時平均:n=24, minValid=18(≥75% 有效,本專案設計假設)。 */
export const avg24h = (points: HourPoint[]) => latestAverage(points, 24, 18);
/** 8 小時移動平均:n=8, minValid=6。 */
export const avg8h = (points: HourPoint[]) => latestAverage(points, 8, 6);

/** 將 epoch ms 格式化為 MM/DD HH:00。 */
export function formatHour(t: number): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:00`;
}

/** 將 epoch ms 格式化為 YYYY-MM-DD HH:00。 */
export function formatHourFull(t: number): string {
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:00`;
}
