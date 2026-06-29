'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plane } from 'lucide-react';
import { UAVProfileChart, type ParamStats } from '@/components/UAV/UAVProfileChart';
import { UAVParameterSelector } from '@/components/UAV/UAVParameterSelector';
import { fetchFlights, type FlightSummary } from '@/lib/uavApi';
import { DEFAULT_PARAMETERS, type ParameterId } from '@/components/UAV/uavConfig';

/* ──────────────────────────────────────────────────────────── */
/*  Design tokens                                               */
/* ──────────────────────────────────────────────────────────── */
const C = {
  rose:        '#D4567A',
  roseAlpha:   'rgba(212,86,122,0.10)',
  roseBorder:  'rgba(212,86,122,0.28)',
  glass:       'rgba(255,255,255,0.90)',
  glassBorder: 'rgba(255,255,255,0.72)',
  glassShadow: '0 4px 20px rgba(180,140,160,0.12)',
  text:        '#1a1220',
  muted:       '#7a6880',
  hint:        '#b0a0b8',
};

/* ──────────────────────────────────────────────────────────── */
/*  Flight selector dropdown                                     */
/* ──────────────────────────────────────────────────────────── */
function FlightDropdown({
  flights,
  selected,
  onSelect,
}: {
  flights: FlightSummary[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = flights.find((f) => f.flight_id === selected);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 999, cursor: 'pointer',
          background: C.glass,
          border: `1px solid ${C.roseBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 14, fontWeight: 700, color: C.rose,
          transition: 'all 0.15s',
        }}
      >
        <Plane size={16} strokeWidth={2} />
        {current
          ? `${current.flight_id} — ${current.site_name ?? ''}`
          : '選擇飛行任務'}
        <ChevronDown
          size={15}
          strokeWidth={2.5}
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 300,
            background: '#fff',
            border: `1px solid ${C.roseBorder}`,
            borderRadius: 14, boxShadow: '0 8px 32px rgba(180,140,160,0.18)',
            minWidth: 280, overflow: 'hidden',
          }}
        >
          {flights.map((f, i) => (
            <button
              key={f.flight_id}
              onClick={() => { onSelect(f.flight_id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '12px 18px',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: selected === f.flight_id ? 700 : 500,
                color: selected === f.flight_id ? C.rose : C.text,
                background: selected === f.flight_id ? C.roseAlpha : 'transparent',
                borderBottom: i < flights.length - 1 ? '1px solid rgba(180,140,160,0.08)' : 'none',
                transition: 'background-color 0.12s',
              }}
            >
              <div
                style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: selected === f.flight_id ? C.rose : 'rgba(180,140,160,0.4)',
                }}
              />
              <span style={{ flex: 1 }}>
                {f.flight_id}
                <span style={{ marginLeft: 8, fontSize: 12, color: C.hint, fontWeight: 500 }}>
                  {f.site_name} · {f.flight_direction}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  Page                                                         */
/* ──────────────────────────────────────────────────────────── */
export default function UAVProfilePage() {
  const [flights, setFlights]       = useState<FlightSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ParameterId[]>(DEFAULT_PARAMETERS);
  const [loadError, setLoadError]   = useState<string | null>(null);
  // Stats received from UAVProfileChart after each successful fetch
  const [paramStats, setParamStats] = useState<Record<string, ParamStats>>({});

  useEffect(() => {
    fetchFlights()
      .then((data) => {
        setFlights(data);
        if (data.length > 0) setSelectedId(data[0].flight_id);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  // Stable callback — useCallback prevents UAVProfileChart from re-fetching
  // just because the page re-renders
  const handleStatsReady = useCallback(
    (stats: Record<string, ParamStats>) => setParamStats(stats),
    [],
  );

  const selectedFlight = flights.find((f) => f.flight_id === selectedId);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 80 }}>

      {/* ── Page header ── */}
      <div style={{ padding: '28px 40px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Plane size={20} color={C.rose} strokeWidth={2} />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.rose }}>
            UAV 垂直剖面分析
          </h1>
        </div>
        <p style={{ margin: '4px 0 0 52px', fontSize: 13, color: C.hint }}>
          無人機大氣量測 · 觀音站 · 2026-03-30 共 6 次飛行
        </p>
      </div>

      {/* ── Controls ── */}
      <div
        style={{
          margin: '20px 40px 0',
          background: C.glass,
          border: `1px solid rgba(212,86,122,0.08)`,
          borderRadius: 16,
          boxShadow: C.glassShadow,
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Flight selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, whiteSpace: 'nowrap' }}>
            飛行任務
          </span>
          {loadError ? (
            <span style={{ fontSize: 13, color: '#e74c3c' }}>⚠ {loadError}</span>
          ) : flights.length === 0 ? (
            <span style={{ fontSize: 13, color: C.hint }}>載入中…</span>
          ) : (
            <FlightDropdown
              flights={flights}
              selected={selectedId ?? ''}
              onSelect={(id) => { setSelectedId(id); setParamStats({});}}
            />
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(180,140,160,0.10)' }} />

        {/* Parameter selector — receives paramStats so it can show ranges */}
        <UAVParameterSelector
          selected={parameters}
          onChange={setParameters}
          paramStats={paramStats}
        />

        {parameters.length > 1 && (
          <p style={{ margin: 0, fontSize: 11, color: C.hint }}>
            ℹ 多個參數同時顯示時，X 軸數值已標準化為 0–100%，滑鼠懸停可查看真實數值。
          </p>
        )}
      </div>

      {/* ── Chart area ── */}
      <div className="uav-chart-wrapper">
        {parameters.length === 0 ? (
          <div className="uav-placeholder">請至少選擇一個參數</div>
        ) : selectedId ? (
          <UAVProfileChart
            key={selectedId}
            flightId={selectedId}
            flightDirection={selectedFlight?.flight_direction ?? 'ascending'}
            parameters={parameters}
            onStatsReady={handleStatsReady}
          />
        ) : (
          <div className="uav-placeholder">請選擇飛行任務</div>
        )}
      </div>

      {/* ── Styles ── */}
      <style>{`
        /* ── Chart wrapper: fills most of the viewport ──────── */
        .uav-chart-wrapper {
          margin: 20px 40px 0;
          /* Reserve space for header (~160px) + controls (~180px) + gaps */
          height: calc(100vh - 340px);
          min-height: 480px;
        }

        /* Profile card fills the wrapper height */
        .uav-profile-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: ${C.glass};
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px;
          box-shadow: ${C.glassShadow};
          padding: 24px 28px;
          box-sizing: border-box;
        }

        /* ResponsiveContainer inside gets the remaining height */
        .uav-profile-card > .recharts-responsive-container {
          flex: 1 1 0;
          min-height: 0;
        }

        /* ── Placeholder cards ───────────────────────────────── */
        .uav-placeholder {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${C.glass};
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px;
          color: ${C.hint};
          font-size: 14px;
          font-weight: 600;
        }

        /* ── Parameter selector ─────────────────────────────── */
        .uav-param-selector {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 10px 12px;
        }

        .uav-param-label {
          font-size: 12px;
          font-weight: 800;
          color: ${C.muted};
          white-space: nowrap;
          padding-top: 6px;
        }

        .uav-param-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .uav-param-category {
          font-size: 10px;
          font-weight: 700;
          color: ${C.hint};
          letter-spacing: 0.5px;
          padding: 2px 4px;
          white-space: nowrap;
        }

        .uav-param-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 5px 11px;
          border-radius: 10px;
          border: 1.5px solid;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.15s;
          line-height: 1.4;
          gap: 1px;
        }

        .uav-param-btn:hover {
          filter: brightness(0.92);
        }

        .uav-param-btn-text {
          white-space: nowrap;
        }

        .uav-param-unit {
          font-size: 10px;
          opacity: 0.75;
        }

        /* Range label shown below the param name on active buttons */
        .uav-param-range {
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
          line-height: 1.2;
        }

        /* ── Flight title ────────────────────────────────────── */
        .uav-flight-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 15px;
          font-weight: 700;
          color: ${C.text};
          margin-bottom: 8px;
          flex-shrink: 0;
        }

        .uav-flight-meta {
          font-size: 12px;
          color: ${C.hint};
          font-weight: 500;
        }

        /* ── Norm legend ─────────────────────────────────────── */
        .uav-norm-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 14px;
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .uav-norm-item {
          white-space: nowrap;
        }

        /* ── Custom Tooltip ──────────────────────────────────── */
        .uav-tooltip {
          background: rgba(255,255,255,0.97);
          border: 1px solid rgba(212,86,122,0.18);
          border-radius: 10px;
          padding: 10px 14px;
          box-shadow: 0 4px 20px rgba(180,140,160,0.18);
          font-size: 12px;
          min-width: 160px;
        }

        .uav-tooltip-label {
          font-size: 11px;
          font-weight: 700;
          color: ${C.hint};
          margin: 0 0 6px;
        }

        .uav-tooltip-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 3px 0;
          font-weight: 600;
        }

        .uav-tooltip-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* ── States ──────────────────────────────────────────── */
        .uav-loading, .uav-empty, .uav-error {
          padding: 40px 24px;
          text-align: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .uav-loading { color: ${C.hint}; }
        .uav-empty   { color: ${C.muted}; }
        .uav-error   {
          color: #c0392b;
          background: rgba(192,57,43,0.07);
          border-radius: 10px;
          margin: 16px 0;
        }

        /* ── Mobile portrait: rotate hint ───────────────────── */
        .uav-rotate-hint {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 32px 24px;
          color: ${C.muted};
          text-align: center;
        }

        .uav-rotate-icon {
          font-size: 48px;
          display: inline-block;
          animation: uav-spin-hint 2s ease-in-out infinite;
        }

        .uav-rotate-hint p {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.6;
        }

        @keyframes uav-spin-hint {
          0%   { transform: rotate(0deg); }
          40%  { transform: rotate(90deg); }
          60%  { transform: rotate(90deg); }
          100% { transform: rotate(90deg); }
        }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 768px) {
          .uav-chart-wrapper {
            margin: 16px 16px 0;
            height: calc(100vh - 300px);
          }
          .uav-profile-card {
            padding: 16px 16px;
          }
          .uav-param-selector { gap: 8px 10px; }
        }

        @media (max-width: 600px) {
          .uav-chart-wrapper {
            margin: 12px 12px 0;
          }
        }
      `}</style>
    </div>
  );
}
