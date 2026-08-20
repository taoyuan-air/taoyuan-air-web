'use client';

/**
 * WindLidarPage — 風光達資料視覺化主頁面（自含式子視圖）
 *
 * 職責：
 * - 掛載時呼叫 fetchStations()，自動選取第一個測站 + 最新日期
 * - 監聽 station / date / heightMax 變化後重新呼叫 fetchPlotData()
 * - 管理 sharedXRange，透過 onRelayout 同步四個面板的 X 軸
 * - 隱藏面板時保留資料（不重新 fetch）
 */

import dynamic from 'next/dynamic';
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';
import WindLidarControls from './WindLidarControls';
import {
  fetchPlotData,
  fetchStations,
  type PanelKey,
  type PlotData,
  type StationInfo,
} from '@/lib/windLidarApi';

// ── 動態載入 WindLidarPanel（SSR disabled，Plotly 需要 browser DOM） ───────────
const WindLidarPanel = dynamic(() => import('./WindLidarPanel'), { ssr: false });

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  rose:      '#D4567A',
  roseAlpha: 'rgba(212,86,122,0.10)',
  roseBorder:'rgba(212,86,122,0.28)',
  glass:     'rgba(255,255,255,0.90)',
  glassShadow:'0 4px 20px rgba(180,140,160,0.12)',
  hint:      '#b0a0b8',
};

// ── 面板設定（colorscale / zmin / zmax / unit / arrows）────────────────────────
type PanelConfig = {
  key:        PanelKey;
  title:      string;
  colorscale: 'Jet' | 'WindDir' | 'Viridis' | 'Plasma';
  zmin:       number;
  zmax:       number;
  unit:       string;
  showArrows: boolean;
};

const PANEL_CONFIGS: PanelConfig[] = [
  { key: 'wind_speed',     title: '水平風速 (Hsp)',   colorscale: 'Jet',     zmin: 0,  zmax: 30,  unit: 'm/s', showArrows: true  },
  { key: 'wind_direction', title: '風向 (Wdir)',       colorscale: 'WindDir', zmin: 0,  zmax: 360, unit: '°',   showArrows: true  },
  { key: 'turbulence',     title: '亂流強度 (Turb)',  colorscale: 'Viridis', zmin: 0,  zmax: 1,   unit: '',    showArrows: false },
  { key: 'cnr',            title: '訊號強度 (Mean Int.)', colorscale: 'Plasma', zmin: 0, zmax: 10, unit: '',    showArrows: false },
];

const ALL_PANEL_VISIBILITY: Record<PanelKey, boolean> = {
  wind_speed:     true,
  wind_direction: true,
  turbulence:     true,
  cnr:            true,
};

// ── Error Boundary ────────────────────────────────────────────────────────────
interface EBState { hasError: boolean }

class ChartErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WindLidarPanel Error Boundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px 24px', textAlign: 'center',
          color: '#c0392b', background: 'rgba(192,57,43,0.07)',
          borderRadius: 12, fontSize: 14, fontWeight: 600,
        }}>
          圖表載入失敗，請重新整理頁面
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function WindLidarPage() {
  const [stations, setStations]           = useState<StationInfo[]>([]);
  const [selectedStation, setStation]     = useState<string>('');
  const [selectedDate, setDate]           = useState<string>('');
  const [heightMax, setHeightMax]         = useState<number>(1.0);
  const [panelVisibility, setVisibility]  = useState<Record<PanelKey, boolean>>(ALL_PANEL_VISIBILITY);
  const [plotData, setPlotData]           = useState<PlotData | null>(null);
  const [loading, setLoading]             = useState<boolean>(false);
  const [stationError, setStationError]   = useState<string | null>(null);
  const [dataError, setDataError]         = useState<string | null>(null);
  const [sharedXRange, setSharedXRange]   = useState<[string, string] | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── 載入測站清單 ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStations()
      .then((data) => {
        if (!mountedRef.current) return;
        setStations(data);
        if (data.length > 0) {
          setStation(data[0].station);
          if (data[0].dates.length > 0) {
            setDate(data[0].dates[0]);   // 最新日期（降冪排序，第一個最新）
          }
        }
      })
      .catch((err: Error) => {
        if (!mountedRef.current) return;
        setStationError(err.message);
      });
  }, []);

  // ── 切換測站時自動選最新日期 ────────────────────────────────────────────────
  const handleStationChange = (s: string) => {
    setStation(s);
    const info = stations.find((st) => st.station === s);
    setDate(info && info.dates.length > 0 ? info.dates[0] : '');
  };

  // ── 切換日期 ────────────────────────────────────────────────────────────────
  const handleDateChange = (d: string) => {
    setDate(d);
  };

  // ── 切換最大高度 ────────────────────────────────────────────────────────────
  const handleHeightMaxChange = (km: number) => {
    setHeightMax(km);
  };

  // ── 取得圖表資料 ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedStation || !selectedDate) return;
    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setDataError(null);
    setPlotData(null);
    setSharedXRange(null);

    fetchPlotData(selectedStation, selectedDate, heightMax)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setPlotData(data);
      })
      .catch((err: Error) => {
        if (cancelled || !mountedRef.current) return;
        setDataError(err.message);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedStation, selectedDate, heightMax]);

  // ── X 軸同步 ────────────────────────────────────────────────────────────────
  const handleRelayout = (event: Record<string, unknown>) => {
    if (event['xaxis.range[0]'] && event['xaxis.range[1]']) {
      setSharedXRange([
        String(event['xaxis.range[0]']),
        String(event['xaxis.range[1]']),
      ]);
    } else if (event['xaxis.autorange']) {
      setSharedXRange(null);
    }
  };

  const handleDoubleClick = () => {
    setSharedXRange(null);
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  const renderChartArea = () => {
    if (stationError) {
      return (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#c0392b',
          background: 'rgba(192,57,43,0.07)', borderRadius: 12, fontSize: 14 }}>
          ⚠ {stationError}
        </div>
      );
    }

    if (stations.length === 0 && !loading) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center',
          color: C.hint, fontSize: 14, fontWeight: 600,
          background: C.glass, borderRadius: 16, boxShadow: C.glassShadow }}>
          目前無可用測站資料
        </div>
      );
    }

    if (loading) {
      return (
        <div style={{ padding: '60px 24px', textAlign: 'center',
          color: C.hint, fontSize: 14, fontWeight: 600,
          background: C.glass, borderRadius: 16, boxShadow: C.glassShadow }}>
          載入中…
        </div>
      );
    }

    if (dataError) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center',
          color: dataError === '所選日期無資料' ? C.hint : '#c0392b',
          background: dataError === '所選日期無資料'
            ? C.glass
            : 'rgba(192,57,43,0.07)',
          borderRadius: 16, fontSize: 14, fontWeight: 600,
          boxShadow: C.glassShadow }}>
          {dataError === '所選日期無資料' ? '所選日期無資料' : `⚠ ${dataError}`}
        </div>
      );
    }

    if (!plotData) return null;

    const visiblePanels = PANEL_CONFIGS.filter((cfg) => panelVisibility[cfg.key]);

    if (visiblePanels.length === 0) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center',
          color: C.hint, fontSize: 14, fontWeight: 600,
          background: C.glass, borderRadius: 16, boxShadow: C.glassShadow }}>
          請至少勾選一個面板
        </div>
      );
    }

    return (
      <ChartErrorBoundary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {PANEL_CONFIGS.map((cfg) => {
            if (!panelVisibility[cfg.key]) return null;
            const panel = plotData.panels[cfg.key];
            if (!panel) return null;

            return (
              <WindLidarPanel
                key={cfg.key}
                title={cfg.title}
                times={plotData.times}
                heightsKm={plotData.heightsKm}
                z={panel.z}
                colorscale={cfg.colorscale}
                zmin={cfg.zmin}
                zmax={cfg.zmax}
                unit={cfg.unit}
                showArrows={cfg.showArrows}
                wdirZ={cfg.showArrows ? plotData.panels.wind_direction?.z : undefined}
                xRange={sharedXRange}
                onRelayout={handleRelayout}
                onDoubleClick={handleDoubleClick}
              />
            );
          })}
        </div>
      </ChartErrorBoundary>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 控制列 */}
      <WindLidarControls
        stations={stations}
        selectedStation={selectedStation}
        selectedDate={selectedDate}
        heightMax={heightMax}
        panelVisibility={panelVisibility}
        loading={loading}
        onStationChange={handleStationChange}
        onDateChange={handleDateChange}
        onHeightMaxChange={handleHeightMaxChange}
        onPanelVisibilityChange={(panel, visible) => {
          setVisibility((prev) => ({ ...prev, [panel]: visible }));
        }}
      />

      {/* 圖表區 */}
      {renderChartArea()}
    </div>
  );
}