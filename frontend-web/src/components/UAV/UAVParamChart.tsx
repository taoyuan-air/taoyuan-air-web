'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PARAMETER_CONFIG, type ParameterId } from './uavConfig';
import type { ProfileRow } from '@/lib/uavApi';

/* ─── Props ──────────────────────────────────────────────────────────── */

export interface UAVParamChartProps {
  paramId: ParameterId;
  /** Pre-filtered rows from the parent (agl_m + all param columns retained) */
  rows: ProfileRow[];
  /** Shared Y-axis (altitude) domain across all small charts for vertical alignment */
  yDomain: [number, number];
  /**
   * X-axis domain computed by computeParamDomain().
   * null means this parameter has no data at all — renders an empty state card.
   */
  xDomain: [number, number] | null;
}

/* ─── Tooltip ────────────────────────────────────────────────────────── */

interface ParamTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number | null }>;
  label?: string | number;
  paramId: ParameterId;
}

function ParamTooltip({ active, payload, label, paramId }: ParamTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const cfg = PARAMETER_CONFIG[paramId];
  const value = payload[0]?.value;

  return (
    <div className="uav-tooltip">
      <p className="uav-tooltip-label">高度：{label} m</p>
      <p className="uav-tooltip-row" style={{ color: cfg.color }}>
        <span className="uav-tooltip-dot" style={{ background: cfg.color }} />
        {cfg.label}：
        {value !== null && value !== undefined
          ? `${(value as number).toFixed(2)} ${cfg.unit}`
          : '無資料'}
      </p>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function UAVParamChart({ paramId, rows, yDomain, xDomain }: UAVParamChartProps) {
  const cfg = PARAMETER_CONFIG[paramId];

  // Pre-compute the tick array so we know which value is the rightmost tick.
  // For 'fixed' domain params (e.g. wind direction 0–360) we skip the nice-tick
  // algorithm and use fixed ticks so the domain never gets stretched.
  const { xTicks, effectiveDomain } = (() => {
    if (!xDomain) return { xTicks: [] as number[], effectiveDomain: xDomain };
    const [lo, hi] = xDomain;
    const range = hi - lo;
    if (range === 0) return { xTicks: [lo], effectiveDomain: xDomain };

    // Fixed-domain parameters: use evenly-spaced ticks within [lo, hi] exactly
    const cfg = PARAMETER_CONFIG[paramId];
    if (cfg.domainType === 'fixed') {
      const fixedStep = range / 4;
      const fixedTicks = [0, 1, 2, 3, 4].map((i) => lo + fixedStep * i);
      return { xTicks: fixedTicks, effectiveDomain: xDomain };
    }

    // Pick a "nice" step that gives roughly 4–5 intervals
    const rawStep = range / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const niceSteps = [1, 2, 2.5, 5, 10];
    const step = magnitude * (niceSteps.find((s) => magnitude * s >= rawStep) ?? 10);

    const start = Math.ceil(lo / step) * step;
    const result: number[] = [];

    // Extend upper bound to next full step so the last tick is always >= hi
    const extendedHi = Math.ceil(hi / step) * step;
    for (let v = start; v <= extendedHi + step * 0.001; v += step) {
      result.push(Math.round(v / step) * step);
    }

    // The effective domain ceiling must match the last tick so lines don't clip
    const lastTickVal = result[result.length - 1] ?? hi;
    const newDomain: [number, number] = [lo, Math.max(hi, lastTickVal)];

    return { xTicks: result, effectiveDomain: newDomain };
  })();

  // The last computed tick gets the unit label appended
  const lastTick = xTicks.length > 0 ? xTicks[xTicks.length - 1] : null;

  return (
    <div
      className="uav-param-card"
      style={{
        // Subtle coloured glow shadow matching the parameter's colour
        boxShadow: `0 2px 12px ${cfg.color}22, 0 4px 20px rgba(180,140,160,0.10)`,
        borderColor: `${cfg.color}18`,
      }}
    >
      {/* Card title — larger font, coloured */}
      <p className="uav-param-card-title" style={{ color: cfg.color }}>
        {cfg.label}
        <span className="uav-param-card-unit" style={{ color: cfg.color, opacity: 0.7 }}>
          　{cfg.unit}
        </span>
      </p>

      {xDomain === null ? (
        /* No data state */
        <div className="uav-empty" style={{ flex: 1 }}>
          無資料
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,140,160,0.15)" />

            {/* Y axis = altitude, reversed so ground is at bottom */}
            <YAxis
              dataKey="agl_m"
              type="number"
              domain={yDomain}
              reversed={true}
              tickFormatter={(v: number) => `${v}m`}
              tick={{ fontSize: 10, fill: '#7a6880' }}
              width={52}
            />

            {/* X axis = real values; the rightmost tick shows the unit */}
            <XAxis
              dataKey={paramId}
              type="number"
              domain={effectiveDomain ?? xDomain}
              ticks={xTicks}
              tickFormatter={(v: number) => {
                if (lastTick !== null && Math.abs(v - lastTick) < 0.0001) {
                  return `${v.toFixed(1)} ${cfg.unit}`;
                }
                return v.toFixed(1);
              }}
              tick={{ fontSize: 10, fill: '#7a6880' }}
            />

            <Tooltip
              content={(props) => (
                <ParamTooltip
                  active={props.active}
                  payload={props.payload as Array<{ value?: number | null }>}
                  label={props.label}
                  paramId={paramId}
                />
              )}
            />

            <Line
              dataKey={paramId}
              type="monotone"
              stroke={cfg.color}
              dot={rows.length < 80 ? { r: 2 } : false}
              connectNulls={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
