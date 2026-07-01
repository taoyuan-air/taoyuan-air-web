'use client';

import { useEffect, useReducer, useRef } from 'react';
import { fetchProfile, type ProfileRow } from '@/lib/uavApi';
import { PARAMETER_CONFIG, computeParamDomain, type ParameterId } from './uavConfig';
import { UAVParamChart } from './UAVParamChart';

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ParamStats {
  min: number;
  max: number;
  range: number;
  hasData: boolean;
}

interface ChartState {
  status: 'idle' | 'loading' | 'error' | 'ready';
  /** Filtered rows — only rows where at least one selected param has a value */
  data: ProfileRow[];
  stats: Record<string, ParamStats>;
  error: string | null;
}

type ChartAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: ProfileRow[]; stats: Record<string, ParamStats> }
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

function parseFlightId(flightId: string): string {
  const [datePart, timePart] = flightId.split('_');
  if (!datePart || !timePart) return flightId;
  return `${datePart.slice(0, 4)}/${datePart.slice(4, 6)}/${datePart.slice(6, 8)} ${timePart.slice(0, 2)}:${timePart.slice(2, 4)}`;
}

/**
 * Compute per-parameter stats (min/max/hasData) without normalising.
 * Uses reduce to avoid Math.min/max spread stack overflow on large arrays.
 */
function computeStats(
  rows: ProfileRow[],
  params: ParameterId[],
): Record<string, ParamStats> {
  const stats: Record<string, ParamStats> = {};

  for (const p of params) {
    const vals = rows
      .map((r) => (r as unknown as Record<string, unknown>)[p] as number | null)
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));

    if (vals.length === 0) {
      stats[p] = { min: 0, max: 0, range: 1, hasData: false };
      continue;
    }

    let min = vals[0], max = vals[0];
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    stats[p] = { min, max, range: max - min || 1, hasData: true };
  }

  return stats;
}

/* ─── Main component ─────────────────────────────────────────────────── */

export function UAVProfileChart({
  flightId,
  flightDirection,
  parameters,
  onStatsReady,
}: UAVProfileChartProps) {
  const [state, dispatch] = useReducer(chartReducer, {
    status: 'idle',
    data: [],
    stats: {},
    error: null,
  });

  // Prevent state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    dispatch({ type: 'FETCH_START' });

    fetchProfile(flightId)
      .then((rows) => {
        if (!mountedRef.current) return;

        // Keep only rows where at least one selected parameter has a value
        const filtered = rows.filter((row) =>
          parameters.some((p) => {
            const v = (row as unknown as Record<string, unknown>)[p];
            return v !== null && v !== undefined;
          })
        );

        const stats = computeStats(filtered, parameters);
        dispatch({ type: 'FETCH_SUCCESS', data: filtered, stats });
        onStatsReady?.(stats);
      })
      .catch((err: Error) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'FETCH_ERROR', error: err.message });
      });
  }, [flightId, parameters]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: onStatsReady intentionally omitted — callers should wrap with useCallback.

  const { status, data: filtered, stats, error } = state;
  const readableTime = parseFlightId(flightId);
  const siteName = filtered[0]?.site_name ?? '';

  /* ── Loading / idle ── */
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
  if (filtered.length === 0) {
    return (
      <div className="uav-profile-card">
        <div className="uav-empty">無有效資料（所選參數在此飛行任務中均為 null）</div>
      </div>
    );
  }

  /* ── Compute shared Y domain using reduce (safe for large arrays) ── */
  let yMin = filtered[0].agl_m;
  let yMax = filtered[0].agl_m;
  for (const r of filtered) {
    if (r.agl_m < yMin) yMin = r.agl_m;
    if (r.agl_m > yMax) yMax = r.agl_m;
  }
  const yDomain: [number, number] = [yMin, yMax];

  /* ── Grid of small charts ── */
  return (
    <div>
      {/* Flight info header — shown once above the grid */}
      <div className="uav-flight-title">
        <div className="uav-flight-title-inner">
          <span className="uav-flight-id">✈ 飛行任務：{flightId}</span>
          <span className="uav-flight-meta">
            {readableTime}
            <span className="uav-flight-meta-sep">·</span>
            {siteName}
            <span className="uav-flight-meta-sep">·</span>
            {flightDirection}
          </span>
        </div>
      </div>

      <div className="uav-chart-grid">
        {parameters
          .filter((paramId) => {
            // Skip parameters confirmed to have no data in this flight
            const s = stats[paramId];
            return !s || s.hasData;
          })
          .map((paramId) => (
          <UAVParamChart
            key={paramId}
            paramId={paramId}
            rows={filtered}
            yDomain={yDomain}
            xDomain={computeParamDomain(paramId, stats[paramId])}
          />
        ))}
      </div>
    </div>
  );
}
