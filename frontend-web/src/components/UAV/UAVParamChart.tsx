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

            {/* X axis = real values for this parameter */}
            <XAxis
              dataKey={paramId}
              type="number"
              domain={xDomain}
              tickFormatter={(v: number) => v.toFixed(1)}
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
