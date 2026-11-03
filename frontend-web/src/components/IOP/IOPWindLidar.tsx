'use client';

/**
 * IOPWindLidar — IOP 內部的風光達視圖
 *
 * - 使用日期滑桿（IOPDateSlider）切換日期
 * - 同時顯示五個面板（wind_speed, wind_direction, vertical_wind, turbulence, cnr）
 * - X 軸縮放同步（sharedXRange）
 */

import dynamic from 'next/dynamic';
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from 'react';
import IOPDateSlider from './IOPDateSlider';
import { fetchPlotData, type PanelKey, type PlotData, type StationInfo } from '@/lib/windLidarApi';
import { fetchVOCs } from '@/lib/iopApi';

const WindLidarPanel = dynamic(() => import('@/components/WindLidar/WindLidarPanel'), { ssr: false });

const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glass:       'rgba(255,255,255,0.90)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
  text:        '#0F1D3A',
};

interface PanelConfig {
  key: PanelKey;
  title: string;
  colorscale: 'Jet' | 'WindDir' | 'RdBu' | 'Viridis' | 'Plasma';
  zmin: number;
  zmax: number;
  unit: string;
  showArrows: boolean;
  arrowType?: 'horizontal' | 'vertical';
}

const PANEL_CONFIGS: PanelConfig[] = [
  { key: 'wind_speed',     title: '水平風速 (Hsp)',      colorscale: 'Jet',     zmin: 0,   zmax: 30,  unit: 'm/s', showArrows: true,  arrowType: 'horizontal' },
  { key: 'wind_direction', title: '水平風向 (Wdir)',      colorscale: 'WindDir', zmin: 0,   zmax: 360, unit: '°',   showArrows: false },
  { key: 'vertical_wind',  title: '垂直風速 (Vsp)',       colorscale: 'RdBu',    zmin: -10, zmax: 10,  unit: 'm/s', showArrows: true,  arrowType: 'vertical' },
  { key: 'turbulence',     title: '亂流強度 (Turb)',      colorscale: 'Viridis', zmin: 0,   zmax: 1,   unit: '',    showArrows: false },
  { key: 'cnr',            title: '訊號強度 (Mean Int.)', colorscale: 'Plasma',  zmin: 0,   zmax: 10,  unit: '',    showArrows: false },
];

// ── Error Boundary ──────────────────────────────────────────────────────────
class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[IOPWindLidar Error Boundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#c0392b',
          background: 'rgba(192,57,43,0.07)', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          圖表載入失敗，請重新整理頁面
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 主元件 ───────────────────────────────────────────────────────────────────
interface IOPWindLidarProps {
  stationInfo: StationInfo;
  iopId: string;       // 用來查詢 VOCs 最晚日期，作為滑桿右邊界
  iopStart: string;
  iopEnd: string;
}

export default function IOPWindLidar({ stationInfo, iopId, iopStart, iopEnd }: IOPWindLidarProps) {
  // maxObsDate：IOP 內所有觀測資料（目前為 VOCs）的最晚日期
  // 決定風光達滑桿的右邊界；初始先用 iopEnd，fetch 完後更新
  const [maxObsDate, setMaxObsDate] = useState<string>(iopEnd);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 查詢 VOCs 全部採樣，取最晚日期
  useEffect(() => {
    fetchVOCs(iopId)
      .then((data) => {
        if (!mountedRef.current) return;
        const dates = data.samples
          .map((s) => s.sample_time.slice(0, 10))
          .filter(Boolean);
        if (dates.length === 0) return;
        const latest = dates.reduce((a, b) => (a > b ? a : b));
        // 只有比 iopEnd 更晚才更新，否則保持 iopEnd
        if (latest > iopEnd) setMaxObsDate(latest);
      })
      .catch(() => {
        // fetch 失敗就用 iopEnd，不影響主流程
      });
  }, [iopId, iopEnd]);

  // 篩選風光達日期：iopStart ～ maxObsDate 之間有資料的日期，升冪排序
  const filteredDates = [...stationInfo.dates]
    .filter((d) => d >= iopStart && d <= maxObsDate)
    .sort();

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [plotData, setPlotData]         = useState<PlotData | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [sharedXRange, setSharedXRange] = useState<[string, string] | null>(null);

  // maxObsDate 確定後，若 selectedDate 還沒設或已超出新範圍，就設成第一個 IOP 期間內的日期
  useEffect(() => {
    const firstInRange = filteredDates.find((d) => d >= iopStart) ?? filteredDates[0] ?? '';
    setSelectedDate((prev) => {
      if (!prev || prev < iopStart || prev > maxObsDate) return firstInRange;
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxObsDate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlotData(null);
    setSharedXRange(null);

    fetchPlotData(stationInfo.station, selectedDate, 1.5)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setPlotData(data);
      })
      .catch((err: Error) => {
        if (cancelled || !mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedDate, stationInfo.station]);

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

  const handleDoubleClick = () => setSharedXRange(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 測站標籤 */}
      <div style={{ fontSize: 12, color: C.hint, fontWeight: 600 }}>
        測站：{stationInfo.station}　IOP 期間共 {filteredDates.filter((d) => d <= iopEnd).length} 天有資料
        {filteredDates.some((d) => d > iopEnd) && (
          <span style={{ marginLeft: 8, color: '#B0BECF' }}>
            （含延伸 {filteredDates.filter((d) => d > iopEnd).length} 天）
          </span>
        )}
      </div>

      {/* 日期滑桿 */}
      {filteredDates.length > 0 ? (
        <IOPDateSlider
          dates={filteredDates}
          selected={selectedDate}
          onChange={(d) => setSelectedDate(d)}
          iopStart={iopStart}
          iopEnd={iopEnd}
        />
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: C.hint,
          background: C.glass, borderRadius: 14, fontSize: 13, fontWeight: 600 }}>
          此 IOP 期間無風光達資料
        </div>
      )}

      {/* 圖表區：五個面板縱向排列 */}
      {filteredDates.length > 0 && (
        <>
          {loading && (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: C.hint,
              background: C.glass, borderRadius: 16, boxShadow: C.glassShadow,
              fontSize: 14, fontWeight: 600 }}>
              載入中…
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '40px 24px', textAlign: 'center',
              color: error === '所選日期無資料' ? C.hint : '#c0392b',
              background: error === '所選日期無資料' ? C.glass : 'rgba(192,57,43,0.07)',
              borderRadius: 16, fontSize: 14, fontWeight: 600, boxShadow: C.glassShadow }}>
              {error === '所選日期無資料' ? '所選日期無風光達資料' : `⚠ ${error}`}
            </div>
          )}

          {!loading && !error && plotData && (
            <ChartErrorBoundary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {PANEL_CONFIGS.map((cfg) => {
                  const panel = plotData.panels[cfg.key];
                  if (!panel) return null;
                  return (
                    <WindLidarPanel
                      key={`${selectedDate}-${cfg.key}`}
                      title={cfg.title}
                      times={plotData.times}
                      heightsKm={plotData.heightsKm}
                      z={panel.z}
                      colorscale={cfg.colorscale}
                      zmin={cfg.zmin}
                      zmax={cfg.zmax}
                      unit={cfg.unit}
                      showArrows={cfg.showArrows}
                      arrowType={cfg.arrowType}
                      wdirZ={
                        cfg.showArrows && cfg.arrowType === 'horizontal'
                          ? plotData.panels.wind_direction?.z
                          : undefined
                      }
                      xRange={sharedXRange}
                      onRelayout={handleRelayout}
                      onDoubleClick={handleDoubleClick}
                    />
                  );
                })}
              </div>
            </ChartErrorBoundary>
          )}
        </>
      )}
    </div>
  );
}
