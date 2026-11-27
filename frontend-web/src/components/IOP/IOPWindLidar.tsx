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
import { useRouter } from 'next/navigation';
import { BookOpen, Wind } from 'lucide-react';
import IOPDateSlider from './IOPDateSlider';
import { fetchPlotData, type PanelKey, type PlotData, type StationInfo } from '@/lib/windLidarApi';

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
  iopStart: string;
  iopEnd: string;
}

export default function IOPWindLidar({ stationInfo, iopStart, iopEnd }: IOPWindLidarProps) {
  const router = useRouter();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 篩選風光達日期：僅保留 iopStart ～ iopEnd 之間有資料的日期，升冪排序
  const filteredDates = [...stationInfo.dates]
    .filter((d) => d >= iopStart && d <= iopEnd)
    .sort();

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [plotData, setPlotData]         = useState<PlotData | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [sharedXRange, setSharedXRange] = useState<[string, string] | null>(null);

  // 若 selectedDate 還沒設或已超出 IOP 期間，就設成第一個 IOP 期間內的日期
  useEffect(() => {
    const firstInRange = filteredDates.find((d) => d >= iopStart) ?? filteredDates[0] ?? '';
    setSelectedDate((prev) => {
      if (!prev || prev < iopStart || prev > iopEnd) return firstInRange;
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iopStart, iopEnd]);

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
      {/* ── 控制列白框：測站資訊 + 儀器介紹按鈕 + 日期滑桿 ── */}
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
      >
        {/* 第一行：測站資訊 + 儀器介紹按鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, color: C.rose, fontWeight: 800 }}>
            測站：{stationInfo.station}
          </div>
          <button
            className="iop-instrument-info-btn"
            onClick={() => router.push('/instruments?tab=wind-lidar')}
            title="前往風光達儀器介紹"
          >
            <Wind size={13} strokeWidth={2.2} />
            <span className="iop-instrument-info-btn-label">風光達是什麼？</span>
            <span className="iop-instrument-info-btn-hover-text">移動到儀器介紹 →</span>
          </button>
        </div>

        {/* 灰色分隔線 */}
        <div style={{ height: 1, background: 'rgba(30,58,95,0.10)' }} />

        {/* 第二行：日期滑桿 */}
        {filteredDates.length > 0 ? (
          <IOPDateSlider
            dates={filteredDates}
            selected={selectedDate}
            onChange={(d) => setSelectedDate(d)}
            iopStart={iopStart}
            iopEnd={iopEnd}
          />
        ) : (
          <div style={{ textAlign: 'center', color: C.hint, fontSize: 13, fontWeight: 600 }}>
            此 IOP 期間無風光達資料
          </div>
        )}
      </div>

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

      <style>{`
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
      `}</style>
    </div>
  );
}
