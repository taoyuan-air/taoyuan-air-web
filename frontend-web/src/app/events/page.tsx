'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Plane, Wind } from 'lucide-react';
import { UAVProfileChart, type ParamStats } from '@/components/UAV/UAVProfileChart';
import { UAVParameterSelector } from '@/components/UAV/UAVParameterSelector';
import { fetchFlights, fetchProfile, type FlightSummary } from '@/lib/uavApi';
import { ALL_PARAMETER_IDS, DEFAULT_PARAMETERS, type ParameterId } from '@/components/UAV/uavConfig';
import WindLidarPage from '@/components/WindLidar/WindLidarPage';
import { AuthGuard } from '@/components/auth/AuthGuard';

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

type ActiveView = 'uav' | 'wind-lidar';

/* ──────────────────────────────────────────────────────────── */
/*  View Switcher Tab Bar                                        */
/* ──────────────────────────────────────────────────────────── */
function ViewSwitcher({
  active,
  onChange,
}: {
  active: ActiveView;
  onChange: (v: ActiveView) => void;
}) {
  const tabs: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
    {
      id: 'uav',
      label: 'UAV 無人機',
      icon: <Plane size={15} strokeWidth={2} />,
    },
    {
      id: 'wind-lidar',
      label: 'Wind Lidar 風光達',
      icon: <Wind size={15} strokeWidth={2} />,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '6px',
        margin: '40px 0px 8px 36px',
        background: 'rgba(255,255,255,0.70)',
        borderRadius: 999,
        border: `1px solid ${C.roseBorder}`,
        boxShadow: C.glassShadow,
        width: 'fit-content',
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 20px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: isActive ? 800 : 600,
              color: isActive ? '#fff' : C.muted,
              background: isActive ? C.rose : 'transparent',
              boxShadow: isActive ? '0 2px 10px rgba(212,86,122,0.30)' : 'none',
              transition: 'all 0.18s',
            }}
            aria-pressed={isActive}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

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
export default function EventsPage() {
  // ── Tab 狀態 ──────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>('uav');

  // ── UAV 狀態（保持 mounted，切 tab 不重置） ───────────────
  const [flights, setFlights]       = useState<FlightSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ParameterId[]>(DEFAULT_PARAMETERS);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [paramStats, setParamStats] = useState<Record<string, ParamStats>>({});
  const [availableParams, setAvailableParams] = useState<Set<ParameterId> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    fetchFlights()
      .then((data) => {
        setFlights(data);
        if (data.length > 0) setSelectedId(data[0].flight_id);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    fetchProfile(selectedId)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;

        const stats: Record<string, ParamStats> = {};
        const available = new Set<ParameterId>();

        for (const p of ALL_PARAMETER_IDS) {
          const vals = rows
            .map((r) => (r as unknown as Record<string, unknown>)[p] as number | null)
            .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));

          if (vals.length === 0) {
            stats[p] = { min: 0, max: 0, range: 1, hasData: false };
          } else {
            let min = vals[0], max = vals[0];
            for (const v of vals) {
              if (v < min) min = v;
              if (v > max) max = v;
            }
            stats[p] = { min, max, range: max - min || 1, hasData: true };
            available.add(p);
          }
        }

        setParamStats(stats);
        setAvailableParams(available);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          setAvailableParams(new Set(ALL_PARAMETER_IDS));
        }
      });

    return () => { cancelled = true; };
  }, [selectedId]);

  const handleStatsReady = useCallback(
    (stats: Record<string, ParamStats>) => setParamStats(stats),
    [],
  );

  const selectedFlight = flights.find((f) => f.flight_id === selectedId);

  // ── 根據 activeView 決定頁面標題 ─────────────────────────
  const pageTitle  = activeView === 'uav' ? 'UAV 垂直剖面分析' : '風光達廓線分析';
  const pageSubtitle = activeView === 'uav'
    ? '無人機大氣量測 · 觀音站 · 2026-03-30 共 6 次飛行'
    : '風光達觀測 · TMA_328 測站';
  const pageIcon = activeView === 'uav'
    ? <Plane size={20} color={C.rose} strokeWidth={2} />
    : <Wind  size={20} color={C.rose} strokeWidth={2} />;

  return (
    <AuthGuard>
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 80 }}>

      {/* Tab switcher — 放在 header 最下方、控制列上方 */}
      <ViewSwitcher active={activeView} onChange={setActiveView} />

      {/* ── Page header ── */}
      <div style={{ padding: '28px 40px 0' }}>
        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {pageIcon}
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.rose }}>
            {pageTitle}
          </h1>
        </div>
        <p style={{ margin: '4px 0 16px 52px', fontSize: 13, color: C.hint }}>
          {pageSubtitle}
        </p>

      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* UAV 子視圖（保持 mounted，靠 CSS display 切換）      */}
      {/* ════════════════════════════════════════════════════ */}
      <div style={{ display: activeView === 'uav' ? 'block' : 'none' }}>

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
                onSelect={(id) => {
                  setSelectedId(id);
                  setAvailableParams(null);
                }}
              />
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(180,140,160,0.10)' }} />

          {/* Parameter selector */}
          <UAVParameterSelector
            selected={parameters}
            onChange={setParameters}
            paramStats={paramStats}
            availableParams={availableParams}
          />

          {parameters.length > 1 && (
            <p style={{ margin: 0, fontSize: 11, color: C.hint }}>
              ℹ 各參數各自獨立座標軸，Y 軸高度已對齊。
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
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* Wind Lidar 子視圖（切換時 mount / unmount）          */}
      {/* ════════════════════════════════════════════════════ */}
      {activeView === 'wind-lidar' && (
        <div style={{ margin: '20px 40px 0' }}>
          <WindLidarPage />
        </div>
      )}

      {/* ── Styles ── */}
      <style>{`
        /* ── Chart wrapper ───────────────────────────────────── */
        .uav-chart-wrapper {
          margin: 20px 40px 0;
          min-height: 480px;
        }

        /* Loading / error card (single-chart states) */
        .uav-profile-card {
          display: flex;
          flex-direction: column;
          background: ${C.glass};
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px;
          box-shadow: ${C.glassShadow};
          padding: 24px 28px;
          box-sizing: border-box;
          min-height: 200px;
        }

        /* ── Flight title ────────────────────────────────────── */
        .uav-flight-title { margin-bottom: 16px; }

        .uav-flight-title-inner {
          display: flex; flex-direction: column; gap: 6px;
          background: ${C.glass};
          border: 1px solid rgba(212,86,122,0.14);
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(212,86,122,0.10), ${C.glassShadow};
          padding: 14px 20px;
        }

        .uav-flight-id {
          font-size: 15px; font-weight: 800; color: ${C.rose}; letter-spacing: 0.3px;
        }

        .uav-flight-meta {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          font-size: 12px; color: ${C.muted}; font-weight: 500;
        }

        .uav-flight-meta-sep { color: ${C.hint}; font-size: 10px; }

        /* ── Small chart grid ────────────────────────────────── */
        .uav-chart-grid {
          display: grid; grid-template-columns: 1fr; gap: 16px;
        }
        @media (min-width: 769px)  { .uav-chart-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1200px) { .uav-chart-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1600px) { .uav-chart-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 768px)  {
          .uav-chart-grid { grid-template-columns: 1fr !important; }
          .uav-param-card { height: 360px !important; }
        }

        /* ── Individual parameter card ───────────────────────── */
        .uav-param-card {
          background: ${C.glass};
          border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px; box-shadow: ${C.glassShadow};
          padding: 16px 18px; box-sizing: border-box;
          height: 420px; display: flex; flex-direction: column;
        }
        .uav-param-card > .recharts-responsive-container { flex: 1 1 0; min-height: 0; }
        .uav-param-card-title {
          margin: 0 0 10px; font-size: 16px; font-weight: 800;
          letter-spacing: 0.2px; flex-shrink: 0;
        }
        .uav-param-card-unit { font-size: 12px; font-weight: 600; opacity: 0.75; margin-left: 2px; }

        /* ── Placeholder cards ───────────────────────────────── */
        .uav-placeholder {
          min-height: 480px; display: flex; align-items: center; justify-content: center;
          background: ${C.glass}; border: 1px solid rgba(212,86,122,0.08);
          border-radius: 16px; color: ${C.hint}; font-size: 14px; font-weight: 600;
        }

        /* ── Parameter selector ─────────────────────────────── */
        .uav-param-selector {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 10px 12px;
        }
        .uav-param-label { font-size: 12px; font-weight: 800; color: ${C.muted}; white-space: nowrap; padding-right: 10px; }
        .uav-param-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .uav-param-category { font-size: 10px; font-weight: 700; color: ${C.hint}; letter-spacing: 0.5px; padding: 2px 4px; white-space: nowrap; }
        .uav-param-btn {
          display: flex; flex-direction: column; align-items: center;
          padding: 5px 11px; border-radius: 10px; border: 1.5px solid;
          cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit;
          transition: all 0.15s; line-height: 1.4; gap: 1px;
        }
        .uav-param-btn:hover { filter: brightness(0.92); }
        .uav-param-btn-text { white-space: nowrap; }
        .uav-param-unit { font-size: 10px; opacity: 0.75; }
        .uav-param-range { font-size: 10px; font-weight: 500; white-space: nowrap; line-height: 1.2; }

        /* ── Custom Tooltip ──────────────────────────────────── */
        .uav-tooltip {
          background: rgba(255,255,255,0.97);
          border: 1px solid rgba(212,86,122,0.18);
          border-radius: 10px; padding: 10px 14px;
          box-shadow: 0 4px 20px rgba(180,140,160,0.18);
          font-size: 12px; min-width: 160px;
        }
        .uav-tooltip-label { font-size: 11px; font-weight: 700; color: ${C.hint}; margin: 0 0 6px; }
        .uav-tooltip-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; font-weight: 600; }
        .uav-tooltip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        /* ── States ──────────────────────────────────────────── */
        .uav-loading, .uav-empty, .uav-error {
          padding: 40px 24px; text-align: center; font-size: 14px; font-weight: 600; flex-shrink: 0;
        }
        .uav-loading { color: ${C.hint}; }
        .uav-empty   { color: ${C.muted}; }
        .uav-error   { color: #c0392b; background: rgba(192,57,43,0.07); border-radius: 10px; margin: 16px 0; }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 768px) {
          .uav-chart-wrapper { margin: 16px 16px 0; }
          .uav-param-selector { gap: 8px 10px; }
          .uav-flight-title-inner { padding: 12px 16px; }
        }
        @media (max-width: 600px) {
          .uav-chart-wrapper { margin: 12px 12px 0; }
        }
      `}</style>
    </div>
    </AuthGuard>
  );
}
