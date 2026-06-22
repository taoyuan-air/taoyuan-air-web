'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { fetchProfile, type ProfileRow } from '@/lib/uavApi';
import { PARAMETER_CONFIG, type ParameterId } from './uavConfig';

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ParamStats {
  min: number;
  max: number;
  range: number;
  hasData: boolean; // false when all values are null for this param
}

// A row in the chart-ready data array
type NormRow = {
  agl_m: number;
  site_name: string | null;
} & {
  [K in ParameterId]?: number | null;
} & {
  [K in string]: number | null | string | undefined;
};

interface ChartState {
  status: 'idle' | 'loading' | 'error' | 'ready';
  data: NormRow[];
  stats: Record<string, ParamStats>;
  error: string | null;
}

type ChartAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: NormRow[]; stats: Record<string, ParamStats> }
  | { type: 'FETCH_ERROR'; error: string };

function chartReducer(state: ChartState, action: ChartAction): ChartState {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', data: [], stats: {}, error: null };
    case 'FETCH_SUCCESS':
      return { status: 'ready', data: action.data, stats: action.stats, error: null };
    case 'FETCH_ERROR':
      return { status: 'error', data: [], stats: {}, error: action.error };
  }
}

/* ─── Props ──────────────────────────────────────────────────────────── */

export interface UAVProfileChartProps {
  flightId: string;
  flightDirection: string;
  parameters: ParameterId[];
  /** Called after each successful fetch so the parent can read stats for the selector */
  onStatsReady?: (stats: Record<string, ParamStats>) => void;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function normalise(
  rows: ProfileRow[],
  params: ParameterId[],
): { data: NormRow[]; stats: Record<string, ParamStats> } {
  const stats: Record<string, ParamStats> = {};

  for (const p of params) {
    const vals = rows
      .map((r) => (r as unknown as Record<string, unknown>)[p] as number | null)
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    if (vals.length === 0) {
      // Mark as no-data — do NOT fall back to 0–1
      stats[p] = { min: 0, max: 0, range: 1, hasData: false };
      continue;
    }

    // Safe reduce instead of spread (avoids stack overflow on large arrays)
    let min = vals[0], max = vals[0];
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    stats[p] = { min, max, range: max - min || 1, hasData: true };
  }

  const data: NormRow[] = rows.map((row) => {
    const normRow: NormRow = { agl_m: row.agl_m, site_name: row.site_name };

    for (const p of params) {
      const raw = (row as unknown as Record<string, unknown>)[p] as number | null;
      if (raw === null || raw === undefined || Number.isNaN(raw)) {
        normRow[p] = null;
        normRow[`${p}_raw`] = null;
      } else {
        const s = stats[p];
        normRow[p] = s.hasData ? (raw - s.min) / s.range : null;
        normRow[`${p}_raw`] = raw;
      }
    }

    return normRow;
  });

  return { data, stats };
}

function parseFlightId(flightId: string): string {
  const [datePart, timePart] = flightId.split('_');
  if (!datePart || !timePart) return flightId;
  return `${datePart.slice(0, 4)}/${datePart.slice(4, 6)}/${datePart.slice(6, 8)} ${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
}

/* ─── Custom Tooltip ─────────────────────────────────────────────────── */

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="uav-tooltip">
      <p className="uav-tooltip-label">高度：{label} m</p>
      {payload.map((entry) => {
        if (entry.value === null || entry.value === undefined) return null;
        const paramId = entry.dataKey as string;
        const rawVal = entry.payload[`${paramId}_raw`] as number | null;
        const cfg = PARAMETER_CONFIG[paramId as ParameterId];
        if (!cfg) return null;

        const display =
          rawVal !== null && rawVal !== undefined
            ? `${rawVal.toFixed(2)} ${cfg.unit}`
            : '無資料';

        return (
          <p key={paramId} style={{ color: cfg.color }} className="uav-tooltip-row">
            <span className="uav-tooltip-dot" style={{ background: cfg.color }} />
            {cfg.label}：{display}
          </p>
        );
      })}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function UAVProfileChart({
  flightId,
  flightDirection,
  parameters,
  onStatsReady,
}: UAVProfileChartProps) {
  // useReducer batches all state transitions — avoids cascading setState in effects
  const [state, dispatch] = useReducer(chartReducer, {
    status: 'idle',
    data: [],
    stats: {},
    error: null,
  });

  // Track whether the component is still mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Mobile portrait detection
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const check = () => setIsPortrait(
      typeof window !== 'undefined' && window.innerWidth < 768 && window.innerHeight > window.innerWidth
    );
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    // Dispatch FETCH_START synchronously — useReducer batches this correctly
    // and does NOT cause the cascading-render warning that useState does
    dispatch({ type: 'FETCH_START' });

    fetchProfile(flightId)
      .then((rows) => {
        if (!mountedRef.current) return;

        const filtered = rows.filter((row) =>
          parameters.some((p) => {
            const v = (row as unknown as Record<string, unknown>)[p];
            return v !== null && v !== undefined;
          })
        );

        const { data, stats } = normalise(filtered, parameters);
        dispatch({ type: 'FETCH_SUCCESS', data, stats });
        onStatsReady?.(stats);
      })
      .catch((err: Error) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'FETCH_ERROR', error: err.message });
      });
  }, [flightId, parameters]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: onStatsReady intentionally omitted — it's a callback prop that
  // would cause infinite loops if the parent re-creates it on every render.
  // Callers should wrap it with useCallback.

  const { status, data: chartData, stats, error } = state;
  const readableTime = parseFlightId(flightId);
  const siteName = chartData[0]?.site_name ?? '';

  /* ── Loading ── */
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="uav-profile-card">
        <div className="uav-loading">載入 {flightId} 中…</div>
      </div>
    );
  }

  /* ── Error ── */
  if (status === 'error') {
    return (
      <div className="uav-profile-card">
        <div className="uav-error">錯誤：{error}</div>
      </div>
    );
  }

  /* ── No data ── */
  if (chartData.length === 0) {
    return (
      <div className="uav-profile-card">
        <div className="uav-empty">無有效資料（所選參數在此飛行任務中均為 null）</div>
      </div>
    );
  }

  /* ── Mobile portrait hint ── */
  if (isPortrait) {
    return (
      <div className="uav-profile-card">
        <div className="uav-flight-title">
          <span>飛行任務：{flightId}</span>
          <span className="uav-flight-meta">
            {readableTime} · {siteName} · {flightDirection}
          </span>
        </div>
        <div className="uav-rotate-hint">
          <span className="uav-rotate-icon" aria-hidden="true">⟳</span>
          <p>請將手機轉為橫向以獲得最佳閱讀體驗</p>
        </div>
      </div>
    );
  }

  /* ── Chart ── */
  return (
    <div className="uav-profile-card">
      <div className="uav-flight-title">
        <span>飛行任務：{flightId}</span>
        <span className="uav-flight-meta">
          {readableTime} · {siteName} · {flightDirection}
        </span>
      </div>

      {/* Norm legend — only when multiple params, only for params that have data */}
      {parameters.length > 1 && (
        <div className="uav-norm-legend">
          {parameters.map((p) => {
            const cfg = PARAMETER_CONFIG[p];
            const s = stats[p];
            if (!s) return null;
            return (
              <span key={p} style={{ color: cfg.color }} className="uav-norm-item">
                {cfg.label}:{' '}
                {s.hasData
                  ? `${s.min.toFixed(1)}–${s.max.toFixed(1)} ${cfg.unit}`
                  : '無資料'}
              </span>
            );
          })}
        </div>
      )}

      {/* Chart fills most of viewport height */}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,140,160,0.15)" />

          {/* Y axis = altitude, reversed=false → ground at bottom, sky at top */}
          <YAxis
            dataKey="agl_m"
            type="number"
            domain={['dataMin', 'dataMax']}
            reversed={true}
            tickFormatter={(v: number) => `${v}m`}
            label={{
              value: '離地高度 (m AGL)',
              angle: -90,
              position: 'insideLeft',
              offset: -5,
              style: { fontSize: 11, fill: '#7a6880' },
            }}
            tick={{ fontSize: 11, fill: '#7a6880' }}
            width={65}
          />

          {/* X axis = normalised 0–1 */}
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#7a6880' }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            formatter={(name: string) =>
              PARAMETER_CONFIG[name as ParameterId]?.label ?? name
            }
            wrapperStyle={{ fontSize: 12 }}
          />

          {parameters.map((param) => (
            <Line
              key={param}
              dataKey={param}
              type="monotone"
              stroke={PARAMETER_CONFIG[param].color}
              dot={chartData.length < 80 ? { r: 2 } : false}
              connectNulls={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
