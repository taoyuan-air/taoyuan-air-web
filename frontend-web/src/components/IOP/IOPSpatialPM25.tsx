'use client';

/**
 * IOPSpatialPM25 — IOP 空間推估圖瀏覽器
 *
 * Section A：逐小時 XGBoost PM₂.₅ 空間分佈圖
 * Section B：日均模型比較（RF vs XGBoost 並排）
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Map, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fetchSpatialImages,
  getSpatialImageUrl,
  type SpatialImageList,
} from '@/lib/iopApi';

const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
  text:        '#0F1D3A',
};

// ── 工具函式 ──────────────────────────────────────────────────────────────────

function parseHourlyDate(f: string): string {
  const m = f.match(/PM25_XGB_(\d{4}-\d{2}-\d{2})_\d{2}\.jpg$/);
  return m ? m[1] : '';
}
function parseWindDate(f: string): string {
  const m = f.match(/PM25_Wind_(\d{4}-\d{2}-\d{2})_\d{2}\.jpg$/);
  return m ? m[1] : '';
}
function parseDailyDate(f: string): string {
  const m = f.match(/(\d{4}-\d{2}-\d{2})\.jpg$/);
  return m ? m[1] : '';
}
function fmtShort(d: string): string {
  if (!d) return '';
  const [, mm, dd] = d.split('-');
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
}
function fmtFull(d: string): string {
  if (!d) return '';
  const [yyyy, mm, dd] = d.split('-');
  return `${yyyy}年 ${parseInt(mm, 10)}月 ${parseInt(dd, 10)}日`;
}

// ── PM₂.₅ 下標 ───────────────────────────────────────────────────────────────
function PM25() {
  return <>PM<sub style={{ fontSize: '0.72em', letterSpacing: 0 }}>2.5</sub></>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <style>{`
        @keyframes iop-spin { to { transform: rotate(360deg); } }
        .iop-spinner {
          width: 32px; height: 32px;
          border: 3px solid rgba(72,149,236,0.18);
          border-top-color: #4895EC;
          border-radius: 50%;
          animation: iop-spin 0.75s linear infinite;
        }
      `}</style>
      <div className="iop-spinner" />
    </>
  );
}

// ── 美化版滑桿 ────────────────────────────────────────────────────────────────
const SLIDER_CSS = `
  .iop-range {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; border-radius: 999px;
    outline: none; cursor: pointer;
    background: linear-gradient(
      to right,
      #4895EC var(--pct, 50%),
      rgba(72,149,236,0.18) var(--pct, 50%)
    );
  }
  .iop-range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff; border: 2.5px solid #4895EC;
    box-shadow: 0 1px 6px rgba(72,149,236,0.35); cursor: pointer;
    transition: transform 0.12s, box-shadow 0.12s;
  }
  .iop-range::-webkit-slider-thumb:hover {
    transform: scale(1.2); box-shadow: 0 2px 10px rgba(72,149,236,0.45);
  }
  .iop-range::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff; border: 2.5px solid #4895EC;
    box-shadow: 0 1px 6px rgba(72,149,236,0.35); cursor: pointer;
  }
  .iop-range::-moz-range-track {
    height: 4px; border-radius: 999px; background: rgba(72,149,236,0.18);
  }
  .iop-range::-moz-range-progress {
    height: 4px; border-radius: 999px; background: #4895EC;
  }
`;

function HourSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = `${(value / 23) * 100}%`;
  return (
    <>
      <style>{SLIDER_CSS}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <input
          type="range" min={0} max={23} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="iop-range"
          style={{ '--pct': pct } as React.CSSProperties}
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10, fontWeight: 600, color: C.hint, userSelect: 'none',
        }}>
          {['00:00', '06:00', '12:00', '18:00', '23:00'].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </>
  );
}

// ── 日期按鈕組（單行不換行） ──────────────────────────────────────────────────
function DatePills({
  dates, selected, onChange, size = 'md',
}: {
  dates: string[]; selected: string; onChange: (d: string) => void; size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <div style={{
      display: 'flex', flexWrap: 'nowrap', gap: sm ? 4 : 6,
      overflowX: 'auto', paddingBottom: 2,
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    } as React.CSSProperties}>
      {dates.map((d) => {
        const active = d === selected;
        return (
          <button key={d} onClick={() => onChange(d)} style={{
            flexShrink: 0,
            padding: sm ? '4px 10px' : '6px 14px',
            borderRadius: 999,
            border: `1.5px solid ${active ? C.rose : C.roseBorder}`,
            background: active ? C.rose : '#fff',
            color: active ? '#fff' : C.muted,
            fontSize: sm ? 11 : 13, fontWeight: active ? 800 : 600,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.13s',
            boxShadow: active ? '0 2px 8px rgba(72,149,236,0.28)' : 'none',
          }} aria-pressed={active}>
            {fmtShort(d)}
          </button>
        );
      })}
    </div>
  );
}

// ── 地理範圍（TWD97 GeoTransform → WGS84，硬編碼桃園市 bbox） ─────────────────
// GeoTransform: origin=(248184.77, 2779479.54), pixel=50m, size=1008×1189
// X: 248184 ~ 298584 m  →  ~121.00° ~ 121.56°E
// Y: 2779479 ~ 2720029 m → ~25.14° ~ 24.60°N
const GEO = {
  lonMin: 121.00, lonMax: 121.56,
  latMin: 24.60,  latMax: 25.14,
};

// 軸刻度：每 0.1° 一個刻度
function range(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  // 第一個刻度從 ceil(min/step)*step 開始
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v = Math.round((v + step) * 1e9) / 1e9) {
    ticks.push(v);
  }
  return ticks;
}

const LON_TICKS = range(GEO.lonMin, GEO.lonMax, 0.1); // [121.0, 121.1, ..., 121.5]
const LAT_TICKS = range(GEO.latMin, GEO.latMax, 0.1); // [24.6, 24.7, ..., 25.1]

const AXIS_L = 42; // 左軸寬 px
const AXIS_B = 20; // 底軸高 px

// ── Cross-fade 圖片框（含座標軸） ────────────────────────────────────────────
function FadeImage({
  url, alt, minHeight, aspectRatio = 0.74, showAxes = false, emptyText = '選擇日期以顯示圖片',
}: {
  url: string | null; alt: string; minHeight: number; aspectRatio?: number; showAxes?: boolean; emptyText?: string;
}) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(false);

  useEffect(() => {
    if (!url) { setDisplayUrl(null); setLoading(false); setError(false); return; }
    if (url === displayUrl) return;
    setLoading(true); setError(false);
    const img = new window.Image();
    img.onload  = () => { setDisplayUrl(url); setLoading(false); };
    img.onerror = () => { setLoading(false); setError(true); };
    img.src = url;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // 圖片本體（不含軸）
  const imgBox = (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: `${aspectRatio * 100}%`, minHeight,
      background: 'rgba(72,149,236,0.03)',
      border: `1px solid ${C.roseBorder}`, borderRadius: showAxes ? '0 12px 0 0' : 12,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {displayUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={alt} style={{
            width: '100%', height: '100%', objectFit: 'contain', display: 'block',
            borderRadius: showAxes ? '0 10px 0 0' : 10,
            transition: 'opacity 0.25s ease', opacity: loading ? 0.35 : 1,
          }} />
        )}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: showAxes ? '0 12px 0 0' : 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: displayUrl ? 'rgba(255,255,255,0.55)' : 'transparent',
          }}>
            <Spinner />
          </div>
        )}
        {!url && !loading && !error && (
          <span style={{ fontSize: 12, color: C.hint, fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>
            {emptyText}
          </span>
        )}
        {error && <span style={{ fontSize: 12, color: '#c0392b', fontWeight: 600 }}>圖片載入失敗</span>}
      </div>
    </div>
  );

  if (!showAxes) return imgBox;

  // ── 有座標軸版本 ───────────────────────────────────────────────────────────
  const lonSpan = GEO.lonMax - GEO.lonMin;
  const latSpan = GEO.latMax - GEO.latMin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* 上排：Y 軸 + 圖片 */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* Y 軸（緯度） */}
        <div style={{
          width: AXIS_L, flexShrink: 0,
          position: 'relative',
          // 配合 imgBox 的 paddingBottom aspect-ratio trick：
          // 用 paddingBottom 在父容器撐高，不可行；改用 aspectRatio CSS
          aspectRatio: `${AXIS_L} / ${aspectRatio * 100}`,
          minHeight,
        }}>
          {LAT_TICKS.map((lat) => {
            // lat 在圖片中的相對位置（由上到下，latMax 在頂）
            const pct = ((GEO.latMax - lat) / latSpan) * 100;
            return (
              <div key={lat} style={{
                position: 'absolute', right: 6, top: `${pct}%`,
                transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, color: C.hint,
                  fontFamily: 'monospace', whiteSpace: 'nowrap', letterSpacing: '-0.2px',
                }}>
                  {lat.toFixed(1)}°N
                </span>
                {/* 刻度短線 */}
                <div style={{ width: 5, height: 1, background: C.hint, flexShrink: 0 }} />
              </div>
            );
          })}
        </div>

        {/* 圖片本體 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {imgBox}
        </div>
      </div>

      {/* X 軸（經度） */}
      <div style={{
        marginLeft: AXIS_L,
        height: AXIS_B,
        position: 'relative',
      }}>
        {LON_TICKS.map((lon) => {
          const pct = ((lon - GEO.lonMin) / lonSpan) * 100;
          return (
            <div key={lon} style={{
              position: 'absolute', left: `${pct}%`, top: 0,
              transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <div style={{ width: 1, height: 5, background: C.hint }} />
              <span style={{
                fontSize: 9.5, fontWeight: 700, color: C.hint,
                fontFamily: 'monospace', whiteSpace: 'nowrap', letterSpacing: '-0.2px',
              }}>
                {lon.toFixed(1)}°E
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 逐小時格子（前一 / 目前 / 後一小時通用） ───────────────────────────────────
function HourCell({
  date, hour, iopId, imageList, tag, isCurrent,
}: {
  date: string; hour: number; iopId: string; imageList: SpatialImageList;
  tag: string; isCurrent: boolean;
}) {
  const valid      = !!date && hour >= 0 && hour <= 23;
  const filename   = valid ? `PM25_XGB_${date}_${String(hour).padStart(2, '0')}.jpg` : null;
  const fileExists = filename ? imageList.hourly.includes(filename) : false;
  const imgUrl     = fileExists && filename ? getSpatialImageUrl(iopId, 'hourly', filename) : null;
  const emptyText  = valid ? '此小時無資料' : '無此小時資料';

  const border = isCurrent ? C.rose : C.roseBorder;
  const headBg = isCurrent ? 'rgba(72,149,236,0.14)' : 'rgba(72,149,236,0.06)';

  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      border: `1.5px solid ${border}`, borderRadius: 14, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: isCurrent ? '0 4px 16px rgba(72,149,236,0.18)' : 'none',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}>
      {/* 格子頭部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 8px',
        borderBottom: `1px solid rgba(72,149,236,0.10)`,
        background: headBg, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.hint, letterSpacing: '0.06em' }}>
            {tag}
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, color: isCurrent ? C.rose : C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            {valid ? `${String(hour).padStart(2, '0')}:00` : '—'}
          </span>
        </div>
        {isCurrent && (
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
            color: '#fff', background: C.rose, letterSpacing: '0.04em', alignSelf: 'center',
          }}>
            目前
          </span>
        )}
      </div>

      {/* 圖片 */}
      <div style={{ padding: '0 10px 10px', flex: 1 }}>
        <FadeImage
          url={imgUrl}
          alt={`PM2.5 ${date || ''} ${valid ? String(hour).padStart(2, '0') : '--'}:00`}
          minHeight={160} aspectRatio={1.18} showAxes
          emptyText={emptyText}
        />
      </div>
    </div>
  );
}

// ── 風場逐小時面板 ─────────────────────────────────────────────────────────────
function WindHourlyPanel({
  iopId, imageList, dates, hour, selDate, onHourChange, onDateChange,
}: {
  iopId: string;
  imageList: SpatialImageList;
  dates: string[];
  hour: number;
  selDate: string;
  onHourChange: (h: number) => void;
  onDateChange: (d: string) => void;
}) {
  const filename = selDate
    ? `PM25_Wind_${selDate}_${String(hour).padStart(2, '0')}.jpg`
    : null;
  const fileExists = filename ? imageList.hourly_wind.includes(filename) : false;
  const imgUrl = fileExists && filename
    ? getSpatialImageUrl(iopId, 'hourly_wind', filename)
    : null;

  // 偵測容器寬度，決定控制區排列方向
  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 620);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 時間控制區 */}
      <div style={{
        display: 'flex',
        flexDirection: narrow ? 'column' : 'row',
        alignItems: narrow ? 'stretch' : 'stretch',
        gap: narrow ? 14 : 20,
        padding: '16px 20px',
        background: 'rgba(72,149,236,0.04)',
        borderRadius: 14, border: `1px solid ${C.roseBorder}`,
      }}>
        {/* 日期選擇 */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.hint }}>日期</div>
          <DatePills dates={dates} selected={selDate} onChange={onDateChange} size="sm" />
        </div>

        {/* 分隔：寬螢幕垂直線，窄螢幕水平線 */}
        {narrow
          ? <div style={{ height: 1, background: C.roseBorder }} />
          : <div style={{ width: 1, background: C.roseBorder, flexShrink: 0, alignSelf: 'stretch' }} />
        }

        {/* 時間控制 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <button
              onClick={() => onHourChange(Math.max(0, hour - 1))} disabled={hour === 0}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: `2px solid ${hour === 0 ? C.roseBorder : C.rose}`,
                background: hour === 0 ? '#fff' : C.rose,
                color: hour === 0 ? C.hint : '#fff',
                cursor: hour === 0 ? 'not-allowed' : 'pointer',
                opacity: hour === 0 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s',
              }}
              aria-label="前一小時"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 28px', background: '#fff', borderRadius: 12,
              border: `1.5px solid ${C.roseBorder}`,
              boxShadow: '0 2px 10px rgba(72,149,236,0.12)', minWidth: 130,
            }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: C.rose, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>

            <button
              onClick={() => onHourChange(Math.min(23, hour + 1))} disabled={hour === 23}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                border: `2px solid ${hour === 23 ? C.roseBorder : C.rose}`,
                background: hour === 23 ? '#fff' : C.rose,
                color: hour === 23 ? C.hint : '#fff',
                cursor: hour === 23 ? 'not-allowed' : 'pointer',
                opacity: hour === 23 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s',
              }}
              aria-label="後一小時"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div style={{ width: '100%', display: 'flex' }}>
            <HourSlider value={hour} onChange={onHourChange} />
          </div>
        </div>
      </div>

      {/* 風場圖：全寬單張，16:9，限制最大高度讓控制區同時可見 */}
      <FadeImage
        url={imgUrl}
        alt={`PM2.5 風場 ${selDate || ''} ${String(hour).padStart(2, '0')}:00`}
        minHeight={120}
        aspectRatio={0.42}
        showAxes={false}
        emptyText={selDate ? '此小時無資料' : '請選擇日期'}
      />
    </div>
  );
}

// ── Section A：逐小時圖（XGBoost + 風場，tab 切換） ──────────────────────────
function HourlySection({ iopId, imageList }: { iopId: string; imageList: SpatialImageList }) {
  const [activeTab, setActiveTab] = useState<'xgb' | 'wind'>('xgb');

  // XGBoost tab 狀態
  const xgbDates = [...new Set(imageList.hourly.map(parseHourlyDate))].sort();
  const [xgbHour,    setXgbHour]    = useState(12);
  const [xgbSelDate, setXgbSelDate] = useState(xgbDates[0] ?? '');

  // 風場 tab 狀態
  const windDates = [...new Set(imageList.hourly_wind.map(parseWindDate))].sort();
  const [windHour,    setWindHour]    = useState(12);
  const [windSelDate, setWindSelDate] = useState(windDates[0] ?? '');

  const hasWind = imageList.hourly_wind.length > 0;

  // 預載 XGBoost
  useEffect(() => {
    if (!xgbSelDate) return;
    for (let h = 0; h < 24; h++) {
      const fn = `PM25_XGB_${xgbSelDate}_${String(h).padStart(2, '0')}.jpg`;
      if (imageList.hourly.includes(fn)) {
        const img = new window.Image();
        img.src = getSpatialImageUrl(iopId, 'hourly', fn);
      }
    }
  }, [xgbSelDate, iopId, imageList.hourly]);

  // 預載風場
  useEffect(() => {
    if (!windSelDate || !hasWind) return;
    for (let h = 0; h < 24; h++) {
      const fn = `PM25_Wind_${windSelDate}_${String(h).padStart(2, '0')}.jpg`;
      if (imageList.hourly_wind.includes(fn)) {
        const img = new window.Image();
        img.src = getSpatialImageUrl(iopId, 'hourly_wind', fn);
      }
    }
  }, [windSelDate, iopId, imageList.hourly_wind, hasWind]);

  const xgbCells = [
    { key: 'prev', hour: xgbHour - 1, tag: '前一小時', current: false },
    { key: 'cur',  hour: xgbHour,     tag: '目前',     current: true  },
    { key: 'next', hour: xgbHour + 1, tag: '後一小時', current: false },
  ];

  // ── Tab 控制區 ───────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'xgb',  label: <span>XGBoost 推估</span> },
    ...(hasWind ? [{ key: 'wind' as const, label: <span>逐小時 <PM25 /> 風場疊圖</span> }] : []),
  ] as { key: 'xgb' | 'wind'; label: ReactNode }[];

  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: C.glassShadow, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '18px 24px 0', borderBottom: `1px solid rgba(72,149,236,0.10)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Map size={15} color={C.rose} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>逐小時 <PM25 /> 空間分佈</div>
            <div style={{ fontSize: 11, color: C.hint, fontWeight: 500 }}>桃園市空間推估 · 每小時一張</div>
          </div>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '9px 20px',
                    fontSize: 13, fontWeight: active ? 800 : 600,
                    color: active ? C.rose : C.muted,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `2.5px solid ${active ? C.rose : 'transparent'}`,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    marginBottom: -1,
                  }}
                  aria-selected={active}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── XGBoost tab ── */}
        {activeTab === 'xgb' && (
          <>
            {/* 時間控制區 */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              padding: '20px 24px',
              background: 'rgba(72,149,236,0.04)',
              borderRadius: 14, border: `1px solid ${C.roseBorder}`,
            }}>
              <div style={{ width: '100%', maxWidth: 520 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 8, textAlign: 'center' }}>日期</div>
                <DatePills dates={xgbDates} selected={xgbSelDate} onChange={setXgbSelDate} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => setXgbHour((h) => Math.max(0, h - 1))} disabled={xgbHour === 0}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: `2px solid ${xgbHour === 0 ? C.roseBorder : C.rose}`,
                    background: xgbHour === 0 ? '#fff' : C.rose,
                    color: xgbHour === 0 ? C.hint : '#fff',
                    cursor: xgbHour === 0 ? 'not-allowed' : 'pointer',
                    opacity: xgbHour === 0 ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}
                  aria-label="前一小時"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '10px 28px', background: '#fff', borderRadius: 12,
                  border: `1.5px solid ${C.roseBorder}`,
                  boxShadow: '0 2px 10px rgba(72,149,236,0.12)', minWidth: 130,
                }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: C.rose, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {String(xgbHour).padStart(2, '0')}:00
                  </span>
                </div>

                <button
                  onClick={() => setXgbHour((h) => Math.min(23, h + 1))} disabled={xgbHour === 23}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: `2px solid ${xgbHour === 23 ? C.roseBorder : C.rose}`,
                    background: xgbHour === 23 ? '#fff' : C.rose,
                    color: xgbHour === 23 ? C.hint : '#fff',
                    cursor: xgbHour === 23 ? 'not-allowed' : 'pointer',
                    opacity: xgbHour === 23 ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                  }}
                  aria-label="後一小時"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div style={{ width: '100%', maxWidth: 520, display: 'flex' }}>
                <HourSlider value={xgbHour} onChange={setXgbHour} />
              </div>
            </div>

            {/* 格子區：前一 / 目前 / 後一小時 */}
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'stretch' }}>
              {xgbCells.map((c) => (
                <div key={c.key} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 380 }}>
                  <HourCell
                    date={xgbSelDate} hour={c.hour}
                    iopId={iopId} imageList={imageList}
                    tag={c.tag} isCurrent={c.current}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── 風場 tab ── */}
        {activeTab === 'wind' && hasWind && (
          <WindHourlyPanel
            iopId={iopId}
            imageList={imageList}
            dates={windDates}
            hour={windHour}
            selDate={windSelDate}
            onHourChange={setWindHour}
            onDateChange={setWindSelDate}
          />
        )}

      </div>
    </div>
  );
}

// ── Section B：日均模型比較 ────────────────────────────────────────────────────
function DailySection({ iopId, imageList }: { iopId: string; imageList: SpatialImageList }) {
  const dates = imageList.daily_rf.length > 0
    ? imageList.daily_rf.map(parseDailyDate).sort()
    : imageList.daily_xgboost.map(parseDailyDate).sort();
  const [sel, setSel] = useState(dates[0] ?? '');

  const rfFn  = sel ? `RF_${sel}.jpg`      : null;
  const xgbFn = sel ? `XGBoost_${sel}.jpg` : null;
  const rfUrl  = rfFn  && imageList.daily_rf.includes(rfFn)
    ? getSpatialImageUrl(iopId, 'daily_rf',       rfFn)  : null;
  const xgbUrl = xgbFn && imageList.daily_xgboost.includes(xgbFn)
    ? getSpatialImageUrl(iopId, 'daily_xgboost',  xgbFn) : null;

  useEffect(() => {
    if (!sel) return;
    ([
      { type: 'daily_rf'      as const, fn: `RF_${sel}.jpg` },
      { type: 'daily_xgboost' as const, fn: `XGBoost_${sel}.jpg` },
    ] as const).forEach(({ type, fn }) => {
      const list = type === 'daily_rf' ? imageList.daily_rf : imageList.daily_xgboost;
      if (list.includes(fn)) { const img = new window.Image(); img.src = getSpatialImageUrl(iopId, type, fn); }
    });
  }, [sel, iopId, imageList.daily_rf, imageList.daily_xgboost]);

  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: C.glassShadow, overflow: 'hidden' }}>
      <div style={{
        padding: '18px 24px 14px', borderBottom: `1px solid rgba(72,149,236,0.10)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BarChart2 size={15} color={C.rose} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>日均模型比較（RF vs XGBoost）</div>
          <div style={{ fontSize: 11, color: C.hint, fontWeight: 500 }}>
            Random Forest 與 XGBoost 日平均 <PM25 /> 空間推估
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: C.rose, letterSpacing: '-0.3px' }}>
          {fmtFull(sel)}
        </span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 8 }}>日期</div>
          <DatePills dates={dates} selected={sel} onChange={setSel} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Random Forest（RF）', url: rfUrl,  alt: `RF PM2.5 日均 ${sel}` },
            { label: 'XGBoost',             url: xgbUrl, alt: `XGBoost PM2.5 日均 ${sel}` },
          ].map(({ label, url, alt }) => (
            <div key={label} style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.muted, textAlign: 'center' }}>{label}</div>
              <FadeImage url={url} alt={alt} minHeight={180} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function IOPSpatialPM25({ iopId }: { iopId: string }) {
  const [imageList, setImageList] = useState<SpatialImageList | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const mountedRef                = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    setLoading(true); setError(null);
    fetchSpatialImages(iopId)
      .then((d) => { if (mountedRef.current) setImageList(d); })
      .catch((e: Error) => { if (mountedRef.current) setError(e.message); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [iopId]);

  if (loading) return (
    <div style={{
      padding: '48px 24px', background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      fontSize: 14, fontWeight: 600, color: C.hint, textAlign: 'center',
    }}>
      <Spinner /><span>載入空間推估圖清單…</span>
    </div>
  );

  if (error) return (
    <div style={{
      padding: '36px 24px', background: 'rgba(192,57,43,0.07)', borderRadius: 16,
      fontSize: 14, fontWeight: 600, color: '#c0392b', textAlign: 'center',
    }}>⚠ {error}</div>
  );

  if (!imageList) return null;

  const hasHourly = imageList.hourly.length > 0 || imageList.hourly_wind.length > 0;
  const hasDaily  = imageList.daily_rf.length > 0 || imageList.daily_xgboost.length > 0;

  if (!hasHourly && !hasDaily) return (
    <div style={{
      padding: '48px 24px', background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
      fontSize: 14, fontWeight: 600, color: C.hint, textAlign: 'center',
    }}>此 IOP 目前尚無空間推估圖資料</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {hasHourly && <HourlySection iopId={iopId} imageList={imageList} />}
      {hasDaily  && <DailySection  iopId={iopId} imageList={imageList} />}
    </div>
  );
}
