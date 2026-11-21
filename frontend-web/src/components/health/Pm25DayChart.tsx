'use client';

import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { AQI_LEVELS, POLLUTANT_BREAKPOINTS } from '@shared/constants/airHealth';
import { aqiLevelByIndex, avg24h, bandIndexForConcentration, formatHour } from '@/lib/health/aqiUtils';
import type { HistoryRecord } from '@/lib/health/useStationHistory';
import { seriesFor } from '@/lib/health/useStationHistory';
import { C, card } from './tokens';

interface Pm25DayChartProps {
  historyRecords: HistoryRecord[];
}

const PM25_BREAKS = POLLUTANT_BREAKPOINTS['PM2.5'];

function bandRangeLabel(idx: number): string {
  const r = PM25_BREAKS[idx];
  if (!r) return '—';
  return `${r[0]}–${r[1]} μg/m³`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullTime: string; v: number; idx: number } }> }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const lvl = aqiLevelByIndex(p.idx);
  return (
    <div
      style={{
        backgroundColor: 'rgba(255,255,255,0.96)', border: `1px solid ${C.glassBorder}`,
        borderRadius: 10, padding: '8px 10px', boxShadow: C.glassShadow,
      }}
    >
      <p style={{ fontSize: 11, color: C.hint, margin: '0 0 2px' }}>{p.fullTime}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>{p.v} μg/m³</p>
      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
        濃度區間:{bandRangeLabel(p.idx)}({lvl?.label ?? ''})
      </p>
    </div>
  );
}

export function Pm25DayChart({ historyRecords }: Pm25DayChartProps) {
  const { data, avgText, enough } = useMemo(() => {
    const series = seriesFor(historyRecords, 'PM2.5').slice(-24);
    const points = series.map((r) => ({ t: new Date(r.observedAt).getTime(), v: r.value }));
    const res = avg24h(points);
    const bars = series.map((r) => {
      const idx = bandIndexForConcentration('PM2.5', r.value);
      const color = aqiLevelByIndex(idx)?.hex ?? C.primary;
      return {
        t: formatHour(new Date(r.observedAt).getTime()),
        v: r.value,
        idx,
        color,
        fullTime: new Date(r.observedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      };
    });
    const avgText = res
      ? `24 小時平均:${res.avg.toFixed(2)} μg/m³(統計區間 ${formatHour(res.from)}–${formatHour(res.to)},${res.count} 筆有效)`
      : '近 24 小時資料不足,暫無法呈現';
    return { data: bars, avgText, enough: !!res };
  }, [historyRecords]);

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>近 24 小時 PM2.5</p>
        <span style={{ fontSize: 11, color: C.hint }}>{avgText}</span>
      </div>

      {enough ? (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: C.hint }}
                interval="preserveStartEnd"
                minTickGap={20}
                tickFormatter={(v: string) => v.split(' ')[1] ?? v}
              />
              <YAxis tick={{ fontSize: 10, fill: C.hint }} width={36} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30,58,95,0.06)' }} />
              <ReferenceLine
                y={30}
                stroke={C.primary}
                strokeDasharray="4 4"
                label={{ value: '30 μg/m³(24 小時值標準)', position: 'insideTopRight', fontSize: 10, fill: C.primary }}
              />
              <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          style={{
            height: 160, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(30,58,95,0.04)', border: `1px solid ${C.glassBorder}`,
          }}
        >
          <span style={{ fontSize: 13, color: C.muted }}>近 24 小時資料不足,暫無法呈現</span>
        </div>
      )}

      {/* 圖例:六色與 PM2.5 濃度區間 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PM25_BREAKS.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: AQI_LEVELS[i].hex }} />
            <span style={{ fontSize: 10, color: C.hint }}>{r ? `${r[0]}–${r[1]}` : '—'}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: C.hint, margin: 0 }}>
        逐時值依 PM2.5 濃度區間著色,僅供對照,與官方 AQI 之計算方式不同
      </p>
    </div>
  );
}
