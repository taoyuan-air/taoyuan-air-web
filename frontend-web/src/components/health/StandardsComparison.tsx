'use client';

import { useState } from 'react';
import {
  AIR_STANDARDS,
  AIR_STANDARDS_META,
  AIR_STANDARDS_NOTE,
} from '@shared/constants/airHealth';
import type { MoeStationData } from '@shared/api/moe';
import {
  avg24h,
  avg8h,
  formatHour,
  type HourPoint,
} from '@/lib/health/aqiUtils';
import type { HistoryRecord } from '@/lib/health/useStationHistory';
import { seriesFor } from '@/lib/health/useStationHistory';
import { C, card } from './tokens';

type UnitKind = 'ppb' | 'ppm' | 'mass' | 'other';

function unitKind(u: string): UnitKind {
  const s = (u || '').toLowerCase();
  if (s.includes('ppb')) return 'ppb';
  if (s.includes('ppm')) return 'ppm';
  if (s.includes('μg') || s.includes('ug') || s.includes('µg')) return 'mass';
  return 'other';
}

/** 將 value(fromUnit)換算為 toUnit;同類直接回傳。 */
function convertUnit(value: number, fromUnit: string, toUnit: string): number {
  const f = unitKind(fromUnit);
  const t = unitKind(toUnit);
  if (f === t) return value;
  if (f === 'ppb' && t === 'ppm') return value / 1000;
  if (f === 'ppm' && t === 'ppb') return value * 1000;
  return value;
}

// /moe 欄位沒有 unit,依 §5.2 假設單位(pm25/pm10 μg/m³;o3/so2/no2 ppb;co ppm)。
const MOE_UNIT: Record<string, string> = {
  pm25: 'μg/m³', pm10: 'μg/m³', o3: 'ppb', no2: 'ppb', so2: 'ppb', co: 'ppm',
};

interface RowResult {
  label: string;
  stdValue: number;
  stdUnit: string;
  /** 換算為標準單位後的目前值 */
  value: number | null;
  display: string;
  interval: string;
  pct: number | null;
}

interface StandardsComparisonProps {
  historyRecords: HistoryRecord[];
  station?: MoeStationData;
}

function buildHistRow(
  label: string,
  stdKey: string,
  param: string,
  agg: '24h' | '8h',
  records: HistoryRecord[],
): RowResult {
  const std = AIR_STANDARDS[stdKey];
  const series = seriesFor(records, param);
  const points: HourPoint[] = series.map((r) => ({ t: new Date(r.observedAt).getTime(), v: r.value }));
  const srcUnit = series[0]?.unit ?? '';
  const res = agg === '24h' ? avg24h(points) : avg8h(points);

  if (!res) {
    return {
      label, stdValue: std.value, stdUnit: std.unit, value: null,
      display: '資料不足', interval: '近 24 小時資料不足,暫無法呈現', pct: null,
    };
  }

  const avgInSrc = res.avg;
  const avgInStd = srcUnit ? convertUnit(avgInSrc, srcUnit, std.unit) : avgInSrc;
  const pct = std.value > 0 ? (avgInStd / std.value) * 100 : null;
  return {
    label, stdValue: std.value, stdUnit: std.unit, value: avgInStd,
    display: `${avgInStd.toFixed(avgInStd < 1 ? 3 : 2)}`,
    interval: `統計區間 ${formatHour(res.from)}–${formatHour(res.to)}(${res.count} 筆有效)`,
    pct,
  };
}

function buildMoeRow(
  label: string,
  stdKey: string,
  field: keyof MoeStationData,
  station: MoeStationData | undefined,
): RowResult {
  const std = AIR_STANDARDS[stdKey];
  if (!station) {
    return { label, stdValue: std.value, stdUnit: std.unit, value: null, display: '—', interval: '即時資料暫時無法取得', pct: null };
  }
  const raw = station[field] as number;
  const srcUnit = MOE_UNIT[field as string] ?? '';
  const v = convertUnit(Number(raw) || 0, srcUnit, std.unit);
  const pct = std.value > 0 ? (v / std.value) * 100 : null;
  return {
    label, stdValue: std.value, stdUnit: std.unit, value: v,
    display: v < 1 ? v.toFixed(3) : v.toFixed(2),
    interval: `即時值(資料時間:${station.datacreationdate ?? '—'})`,
    pct,
  };
}

export function StandardsComparison({ historyRecords, station }: StandardsComparisonProps) {
  const rows: RowResult[] = [
    buildHistRow('PM2.5 24 小時平均', 'pm25_24h', 'PM2.5', '24h', historyRecords),
    buildHistRow('PM10 24 小時平均', 'pm10_24h', 'PM10', '24h', historyRecords),
    buildHistRow('O₃ 8 小時平均', 'o3_8h', 'O3', '8h', historyRecords),
    buildMoeRow('O₃ 小時值', 'o3_1h', 'o3', station),
    buildMoeRow('NO₂ 小時值', 'no2_1h', 'no2', station),
    buildMoeRow('SO₂ 小時值', 'so2_1h', 'so2', station),
    buildHistRow('CO 8 小時平均', 'co_8h', 'CO', '8h', historyRecords),
    buildMoeRow('CO 小時值', 'co_1h', 'co', station),
  ];

  // 過時提示:該站歷史最新一筆距現在 > 6 小時
  const [now] = useState(Date.now);
  const maxT = historyRecords.reduce<number>((m, r) => {
    const t = new Date(r.observedAt).getTime();
    return Number.isFinite(t) && t > m ? t : m;
  }, 0);
  const stale = maxT > 0 && now - maxT > 6 * 3600 * 1000;

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>標準比對</p>
        <span style={{ fontSize: 11, color: C.hint }}>
          依「空氣品質標準」{AIR_STANDARDS_META.version}
        </span>
      </div>

      <p style={{ fontSize: 11, color: C.hint, margin: 0, lineHeight: 1.6 }}>{AIR_STANDARDS_NOTE}</p>

      {stale && (
        <div
          style={{
            padding: '8px 12px', borderRadius: 10, fontSize: 11, color: C.muted, lineHeight: 1.5,
            backgroundColor: 'rgba(237,187,5,0.10)', border: '1px solid rgba(237,187,5,0.30)',
          }}
        >
          資料庫歷史資料更新較慢,以下為 {formatHour(maxT)} 以前資料
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => {
          const pct = r.pct ?? 0;
          const capped = Math.min(pct, 150);
          const overCap = r.pct != null && r.pct > 150;
          return (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {r.display}
                  <span style={{ fontSize: 10, color: C.hint, marginLeft: 3 }}>{r.value != null ? r.stdUnit : ''}</span>
                  {' / '}
                  標準 {r.stdValue}
                  <span style={{ fontSize: 10, color: C.hint, marginLeft: 3 }}>{r.stdUnit}</span>
                </span>
              </div>
              {/* 佔標準值百分比橫條:單色(主色),不用紅/綠(R5) */}
              {r.pct != null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(30,58,95,0.10)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(capped / 150) * 100}%`, height: '100%', borderRadius: 4,
                        backgroundColor: C.primary, transition: 'width 0.2s',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, minWidth: 48, textAlign: 'right' }}>
                    {overCap ? '>150%' : `${Math.round(pct)}%`}
                  </span>
                </div>
              ) : (
                <div style={{ height: 8 }} />
              )}
              <span style={{ fontSize: 10, color: C.hint }}>{r.interval}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
