'use client';

/**
 * IOPUASView — IOP 無人機（UAS）垂直剖面圖
 *
 * 功能：
 * - 只顯示屬於此 IOP 測站（IOP1→Guanyin、IOP2→Dayuan）的飛行任務
 * - 日期篩選限縮在 IOP 官方期間內
 * - 測站 tabs（若同一 IOP 有多個測站時自動出現）
 * - 任務下拉選單
 * - 顯示參數選擇（與 UAV 頁一致）
 * - 垂直剖面圖 grid
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plane, BookOpen } from 'lucide-react';
import {
  fetchFlights,
  fetchProfile,
  type FlightSummary,
} from '@/lib/uavApi';
import {
  ALL_PARAMETER_IDS,
  DEFAULT_PARAMETERS,
  type ParameterId,
} from '@/components/UAV/uavConfig';
import { UAVParameterSelector } from '@/components/UAV/UAVParameterSelector';
import { UAVProfileChart, type ParamStats } from '@/components/UAV/UAVProfileChart';

/* ── Design tokens（與 IOP 其他元件保持一致）── */
const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glass:       'rgba(255,255,255,0.90)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  text:        '#0F1D3A',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
};

/* ── IOP → site_name 對應（不寫死清單，只提供預設 site hint） ── */
const IOP_DEFAULT_SITE: Record<string, string> = {
  IOP1: 'Guanyin',
  IOP2: 'Dayuan',
};

interface Props {
  iopId: string;
  iopStart: string;   // 'YYYY-MM-DD'
  iopEnd: string;     // 'YYYY-MM-DD'
}

/* ── 任務下拉 ── */
function MissionDropdown({
  missions,
  selected,
  onSelect,
}: {
  missions: FlightSummary[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const current = missions.find((f) => f.flight_id === selected);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
          background: C.glass, border: `1px solid ${C.roseBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: 700, color: C.rose,
          transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}
      >
        {current ? current.flight_id : '選擇任務'}
        <ChevronDown
          size={14} strokeWidth={2.5}
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: '#fff', border: `1px solid ${C.roseBorder}`,
          borderRadius: 14, boxShadow: '0 8px 32px rgba(30,58,95,0.18)',
          minWidth: 240, maxHeight: 320, overflowY: 'auto',
        }}>
          {missions.map((f, i) => (
            <button
              key={f.flight_id}
              onClick={() => { onSelect(f.flight_id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: selected === f.flight_id ? 700 : 500,
                color: selected === f.flight_id ? C.rose : C.text,
                background: selected === f.flight_id ? C.roseAlpha : 'transparent',
                borderBottom: i < missions.length - 1 ? '1px solid rgba(30,58,95,0.06)' : 'none',
                transition: 'background-color 0.12s', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: selected === f.flight_id ? C.rose : 'rgba(30,58,95,0.35)',
              }} />
              <span style={{ flex: 1 }}>
                {f.flight_id}
                <span style={{ marginLeft: 8, fontSize: 11, color: C.hint, fontWeight: 500 }}>
                  · {f.flight_direction}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 主元件 ── */
export default function IOPUASView({ iopId, iopStart, iopEnd }: Props) {
  const router = useRouter();
  const [allFlights, setAllFlights]       = useState<FlightSummary[]>([]);
  const [loadError, setLoadError]         = useState<string | null>(null);
  const [flightsLoading, setFlightsLoading] = useState(true);

  const [activeSite, setActiveSite]       = useState<string>('');
  const [selectedId, setSelectedId]       = useState<string | null>(null);

  const [parameters, setParameters]       = useState<ParameterId[]>(DEFAULT_PARAMETERS);
  const [paramStats, setParamStats]       = useState<Record<string, ParamStats>>({});
  const [availableParams, setAvailableParams] = useState<Set<ParameterId> | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ── 載入飛行清單，篩選屬於此 IOP 日期區間的任務 ── */
  useEffect(() => {
    setFlightsLoading(true);
    fetchFlights()
      .then((data) => {
        if (!mountedRef.current) return;

        // 只保留日期在 IOP 區間內（flight_id 格式 YYYYMMDD_HHMM，取前 8 碼）
        const filtered = data.filter((f) => {
          const datePart = f.flight_id.slice(0, 8);
          const dateStr  = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
          return dateStr >= iopStart && dateStr <= iopEnd;
        });

        setAllFlights(filtered);

        // 預設 activeSite：用 IOP 對應的預設測站，若無則取第一個出現的
        const defaultSite = IOP_DEFAULT_SITE[iopId] ?? '';
        const hasSite = filtered.some((f) => f.site_name === defaultSite);
        const firstSite = filtered[0]?.site_name ?? '';
        const initSite = hasSite ? defaultSite : firstSite;

        setActiveSite(initSite);

        // 自動選第一筆屬於 initSite 的任務
        const firstMission = filtered.find((f) => f.site_name === initSite);
        if (firstMission) setSelectedId(firstMission.flight_id);
      })
      .catch((err: Error) => {
        if (!mountedRef.current) return;
        setLoadError(err.message);
      })
      .finally(() => {
        if (mountedRef.current) setFlightsLoading(false);
      });
  }, [iopId, iopStart, iopEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 預取選中任務的可用參數 ── */
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    setAvailableParams(null);

    fetchProfile(selectedId)
      .then((rows) => {
        if (cancelled || !mountedRef.current) return;

        const available = new Set<ParameterId>();
        const stats: Record<string, ParamStats> = {};

        for (const p of ALL_PARAMETER_IDS) {
          const vals = rows
            .map((r) => (r as unknown as Record<string, unknown>)[p] as number | null)
            .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));

          if (vals.length > 0) {
            let min = vals[0], max = vals[0];
            for (const v of vals) {
              if (v < min) min = v;
              if (v > max) max = v;
            }
            stats[p] = { min, max, range: max - min || 1, hasData: true };
            available.add(p);
          } else {
            stats[p] = { min: 0, max: 0, range: 1, hasData: false };
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

  /* ── 目前 activeSite 的任務清單 ── */
  const sites = Array.from(
    allFlights.reduce<Map<string, string>>((m, f) => {
      const key = f.site_name ?? 'Unknown';
      if (!m.has(key)) m.set(key, key);
      return m;
    }, new Map()).keys(),
  );

  const siteMissions = allFlights.filter((f) => f.site_name === activeSite);
  const selectedFlight = allFlights.find((f) => f.flight_id === selectedId);

  /* ── 切換測站 ── */
  function handleSiteChange(site: string) {
    setActiveSite(site);
    const first = allFlights.find((f) => f.site_name === site);
    if (first) {
      setSelectedId(first.flight_id);
      setAvailableParams(null);
    }
  }

  /* ── 切換任務 ── */
  function handleMissionSelect(id: string) {
    setSelectedId(id);
    setAvailableParams(null);
  }

  /* ── 載入中 ── */
  if (flightsLoading) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
        color: C.hint, fontSize: 14, fontWeight: 600,
        border: '1px solid rgba(72,149,236,0.08)',
      }}>
        載入飛行任務中…
      </div>
    );
  }

  /* ── 錯誤 ── */
  if (loadError) {
    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center',
        background: 'rgba(192,57,43,0.07)', borderRadius: 16,
        color: '#c0392b', fontSize: 14, fontWeight: 600,
      }}>
        ⚠ {loadError}
      </div>
    );
  }

  /* ── 無資料 ── */
  if (allFlights.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
        color: C.hint, fontSize: 14, fontWeight: 600,
        border: '1px solid rgba(72,149,236,0.08)',
      }}>
        此 IOP 期間（{iopStart} – {iopEnd}）尚無 UAS 飛行資料
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 控制列 ── */}
      <div
        style={{
          background: C.glass,
          border: '1px solid rgba(72,149,236,0.08)',
          borderRadius: 16,
          boxShadow: C.glassShadow,
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 任務選擇列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, whiteSpace: 'nowrap' }}>
            飛行任務
          </span>
          {sites.length > 1 && (
            <div style={{
              display: 'flex', gap: 4, padding: 4,
              background: 'rgba(72,149,236,0.07)',
              border: `1px solid ${C.roseBorder}`,
              borderRadius: 999,
            }}>
              {sites.map((site) => {
                const isActive = site === activeSite;
                return (
                  <button
                    key={site}
                    onClick={() => handleSiteChange(site)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 999, border: 'none',
                      cursor: 'pointer', fontSize: 13,
                      fontWeight: isActive ? 800 : 600,
                      color: isActive ? '#fff' : C.muted,
                      background: isActive ? C.rose : 'transparent',
                      boxShadow: isActive ? `0 2px 8px ${C.rose}44` : 'none',
                      transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
                    }}
                  >
                    <Plane size={13} strokeWidth={2} />
                    {site}
                  </button>
                );
              })}
            </div>
          )}

          {/* 任務下拉 */}
          {siteMissions.length > 0 ? (
            <MissionDropdown
              missions={siteMissions}
              selected={selectedId ?? ''}
              onSelect={handleMissionSelect}
            />
          ) : (
            <span style={{ fontSize: 13, color: C.hint }}>此測站無飛行資料</span>
          )}
          </div>

          {/* 儀器介紹按鈕 */}
          <button
            className="iop-instrument-info-btn"
            onClick={() => router.push(`/instruments?tab=uav&from_iop=${iopId}&from_subtab=uas`)}
            title="前往 UAV 無人機儀器介紹"
          >
            <Plane size={13} strokeWidth={2.2} />
            <span className="iop-instrument-info-btn-label">UAV 是什麼？</span>
            <span className="iop-instrument-info-btn-hover-text">移動到儀器介紹 →</span>
          </button>
        </div>

        {/* 分隔線 */}
        <div style={{ height: 1, background: 'rgba(30,58,95,0.10)' }} />

        {/* 參數選擇 */}
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

      {/* ── 圖表區 ── */}
      <div className="iop-uas-chart-wrapper">
        {parameters.length === 0 ? (
          <div className="iop-uas-placeholder">請至少選擇一個參數</div>
        ) : selectedId ? (
          <UAVProfileChart
            key={selectedId}
            flightId={selectedId}
            flightDirection={selectedFlight?.flight_direction ?? 'ascending'}
            parameters={parameters}
            onStatsReady={handleStatsReady}
          />
        ) : (
          <div className="iop-uas-placeholder">請選擇飛行任務</div>
        )}
      </div>

      {/* ── Styles ── */}
      <style>{`
        .iop-uas-chart-wrapper {
          min-height: 320px;
        }

        .iop-uas-placeholder {
          min-height: 320px;
          display: flex; align-items: center; justify-content: center;
          background: ${C.glass};
          border: 1px solid rgba(72,149,236,0.08);
          border-radius: 16px;
          color: ${C.hint};
          font-size: 14px; font-weight: 600;
        }

        /* ── 儀器介紹按鈕 ── */
        .iop-instrument-info-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1.5px solid ${C.roseBorder};
          background: rgba(255,255,255,0.80);
          color: ${C.muted};
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          transition: color 0.22s, border-color 0.22s, background 0.22s, box-shadow 0.22s;
          box-shadow: 0 1px 6px rgba(72,149,236,0.10);
          flex-shrink: 0;
        }
        .iop-instrument-info-btn-label {
          transition: opacity 0.2s, transform 0.2s;
        }
        .iop-instrument-info-btn-hover-text {
          position: absolute;
          left: 50%; top: 50%;
          transform: translate(-50%, -50%) translateY(6px);
          opacity: 0;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          pointer-events: none;
          transition: opacity 0.2s, transform 0.2s;
        }
        .iop-instrument-info-btn:hover {
          background: ${C.rose};
          border-color: ${C.rose};
          color: #fff;
          box-shadow: 0 3px 14px rgba(72,149,236,0.35);
        }
        .iop-instrument-info-btn:hover .iop-instrument-info-btn-label {
          opacity: 0;
          transform: translateY(-6px);
        }
        .iop-instrument-info-btn:hover .iop-instrument-info-btn-hover-text {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(0);
        }
        .iop-instrument-info-btn:active {
          transform: scale(0.96);
        }

        /* 繼承 events/page.tsx 裡的 uav-* class，確保圖卡樣式一致 */
        .uav-profile-card {
          display: flex; flex-direction: column;
          background: ${C.glass};
          border: 1px solid rgba(72,149,236,0.08);
          border-radius: 16px; box-shadow: ${C.glassShadow};
          padding: 24px 28px; box-sizing: border-box;
          min-height: 200px;
        }
        .uav-chart-grid {
          display: grid; grid-template-columns: 1fr; gap: 16px;
        }
        @media (min-width: 769px)  { .uav-chart-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1200px) { .uav-chart-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1600px) { .uav-chart-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 768px)  {
          .uav-chart-grid  { grid-template-columns: 1fr !important; }
          .uav-param-card  { height: 360px !important; }
        }
        .uav-param-card {
          background: ${C.glass};
          border: 1px solid rgba(72,149,236,0.08);
          border-radius: 16px; box-shadow: ${C.glassShadow};
          padding: 16px 18px; box-sizing: border-box;
          height: 420px; display: flex; flex-direction: column;
        }
        .uav-param-card > .recharts-responsive-container { flex: 1 1 0; min-height: 0; }
        .uav-param-card-title {
          margin: 0 0 10px; font-size: 16px; font-weight: 800; letter-spacing: 0.2px; flex-shrink: 0;
        }
        .uav-param-card-unit { font-size: 12px; font-weight: 600; opacity: 0.75; margin-left: 2px; }
        .uav-loading  { padding: 40px 24px; text-align: center; font-size: 14px; font-weight: 600; color: ${C.hint}; flex-shrink: 0; }
        .uav-empty    { padding: 40px 24px; text-align: center; font-size: 14px; font-weight: 600; color: ${C.muted}; flex-shrink: 0; }
        .uav-error    { padding: 40px 24px; text-align: center; font-size: 14px; font-weight: 600; color: #c0392b; background: rgba(192,57,43,0.07); border-radius: 10px; margin: 16px 0; flex-shrink: 0; }
        .uav-param-selector {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
        }
        .uav-param-label   { font-size: 12px; font-weight: 800; color: ${C.muted}; white-space: nowrap; padding-right: 10px; }
        .uav-param-group   { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .uav-param-category { font-size: 10px; font-weight: 700; color: ${C.hint}; letter-spacing: 0.5px; padding: 2px 4px; white-space: nowrap; }
        .uav-param-btn {
          display: flex; flex-direction: column; align-items: center;
          padding: 5px 11px; border-radius: 10px; border: 1.5px solid;
          cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit;
          transition: all 0.15s; line-height: 1.4; gap: 1px;
        }
        .uav-param-btn:hover { filter: brightness(0.92); }
        .uav-param-btn-text { white-space: nowrap; }
        .uav-param-unit  { font-size: 10px; opacity: 0.75; }
        .uav-param-range { font-size: 10px; font-weight: 500; white-space: nowrap; line-height: 1.2; }
        .uav-tooltip {
          background: rgba(255,255,255,0.97);
          border: 1px solid rgba(72,149,236,0.18);
          border-radius: 10px; padding: 10px 14px;
          box-shadow: 0 4px 20px rgba(30,58,95,0.18);
          font-size: 12px; min-width: 160px;
        }
        .uav-tooltip-label { font-size: 11px; font-weight: 700; color: ${C.hint}; margin: 0 0 6px; }
        .uav-tooltip-row   { display: flex; align-items: center; gap: 6px; margin: 3px 0; font-weight: 600; }
        .uav-tooltip-dot   { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      `}</style>
    </div>
  );
}
