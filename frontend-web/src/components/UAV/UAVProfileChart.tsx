'use client';

import { useEffect, useState } from 'react';
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

interface Props {
  flightId: string;
  flightDirection: string;
  parameters: ParameterId[];
}

// Per-parameter min/max stats used for 0–1 normalisation
interface ParamStats {
  min: number;
  max: number;
  range: number;
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

function normalise(rows: ProfileRow[], params: ParameterId[]): { data: NormRow[]; stats: Record<string, ParamStats> } {
  const stats: Record<string, ParamStats> = {};

  for (const p of params) {
    const vals = rows
      .map((r) => r[p as keyof ProfileRow] as number | null)
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));

    if (vals.length === 0) {
      stats[p] = { min: 0, max: 1, range: 1 };
      continue;
    }

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    stats[p] = { min, max, range: max - min || 1 };
  }

  const data: NormRow[] = rows.map((row) => {
    const normRow: NormRow = { agl_m: row.agl_m, site_name: row.site_name };

    for (const p of params) {
      const raw = row[p as keyof ProfileRow] as number | null;
      if (raw === null || raw === undefined || Number.isNaN(raw)) {
        normRow[p] = null;
        normRow[`${p}_raw`] = null;
      } else {
        normRow[p] = (raw - stats[p].min) / stats[p].range;
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

// Custom tooltip that shows real (un-normalised) values
function CustomTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="uav-tooltip">
      <p className="uav-tooltip-label">高度：{label} m</p>
      {payload.map((entry) => {
        if (entry.value === null || entry.value === undefined) return null;
        const paramId = entry.dataKey as string;
        const rawKey = `${paramId}_raw`;
        const rawVal = entry.payload[rawKey] as number | null;
        const cfg = PARAMETER_CONFIG[paramId as ParameterId];
        if (!cfg) return null;

        const display = rawVal !== null && rawVal !== undefined
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

export function UAVProfileChart({ flightId, flightDirection, parameters }: Props) {
  const [chartData, setChartData] = useState<NormRow[]>([]);
  const [stats, setStats] = useState<Record<string, ParamStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchProfile(flightId)
      .then((rows) => {
        // Filter out rows where all selected parameters are null
        const filtered = rows.filter((row) =>
          parameters.some((p) => {
            const v = row[p as keyof ProfileRow];
            return v !== null && v !== undefined;
          })
        );

        const { data, stats: s } = normalise(filtered, parameters);
        setChartData(data);
        setStats(s);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  // parameters identity changes when parent calls setParameters with a new array,
  // so listing it directly is correct — no join trick needed.
  }, [flightId, parameters]);

  const readableTime = parseFlightId(flightId);
  const siteName = chartData[0]?.site_name ?? '';

  if (loading) {
    return (
      <div className="uav-profile-card">
        <div className="uav-loading">載入 {flightId} 中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="uav-profile-card">
        <div className="uav-error">錯誤：{error}</div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="uav-profile-card">
        <div className="uav-empty">無有效資料（所選參數在此飛行任務中均為 null）</div>
      </div>
    );
  }

  return (
    <div className="uav-profile-card">
      <div className="uav-flight-title">
        <span>飛行任務：{flightId}</span>
        <span className="uav-flight-meta">
          {readableTime} · {siteName} · {flightDirection}
        </span>
      </div>

      {/* Normalisation legend: show real min/max per parameter */}
      {parameters.length > 1 && (
        <div className="uav-norm-legend">
          {parameters.map((p) => {
            const cfg = PARAMETER_CONFIG[p];
            const s = stats[p];
            if (!s) return null;
            return (
              <span key={p} style={{ color: cfg.color }} className="uav-norm-item">
                {cfg.label}: {s.min.toFixed(1)}–{s.max.toFixed(1)} {cfg.unit}
              </span>
            );
          })}
        </div>
      )}

      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,140,160,0.15)" />

          {/* Y axis = altitude */}
          <YAxis
            dataKey="agl_m"
            type="number"
            domain={['dataMin', 'dataMax']}
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

          {/* X axis = normalised 0–1 (all params share the same scale) */}
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
