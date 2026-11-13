'use client';

/**
 * IOPSpatialPM25 — IOP 空間推估圖瀏覽器
 *
 * Section A：逐小時 XGBoost PM₂.₅ 空間分佈圖
 * Section B：日均模型比較（RF vs XGBoost 並排）
 */

import { useEffect, useRef, useState } from 'react';
import { Map, BarChart2, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
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

// ── Cross-fade 圖片框 ─────────────────────────────────────────────────────────
function FadeImage({
  url, alt, minHeight, aspectRatio = 0.74,
}: {
  url: string | null; alt: string; minHeight: number; aspectRatio?: number;
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

  return (
    <div style={{
      position: 'relative', width: '100%',
      paddingBottom: `${aspectRatio * 100}%`, minHeight,
      background: 'rgba(72,149,236,0.03)',
      border: `1px solid ${C.roseBorder}`, borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {displayUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayUrl} alt={alt} style={{
            width: '100%', height: '100%', objectFit: 'contain', display: 'block',
            borderRadius: 10, transition: 'opacity 0.25s ease', opacity: loading ? 0.35 : 1,
          }} />
        )}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: displayUrl ? 'rgba(255,255,255,0.55)' : 'transparent',
          }}>
            <Spinner />
          </div>
        )}
        {!url && !loading && !error && (
          <span style={{ fontSize: 12, color: C.hint, fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>
            選擇日期以顯示圖片
          </span>
        )}
        {error && <span style={{ fontSize: 12, color: '#c0392b', fontWeight: 600 }}>圖片載入失敗</span>}
      </div>
    </div>
  );
}

// ── 新增按鈕格 ────────────────────────────────────────────────────────────────
function AddSlotButton({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', height: '100%', minHeight: 260,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
        background: hov ? 'rgba(72,149,236,0.22)' : 'rgba(72,149,236,0.10)',
        border: `2px dashed ${hov ? C.rose : 'rgba(72,149,236,0.55)'}`,
        borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
        color: hov ? C.rose : C.muted, fontSize: 13, fontWeight: 700,
        transition: 'all 0.15s',
      }}
      aria-label="新增比較日期"
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: hov ? 'rgba(72,149,236,0.30)' : 'rgba(72,149,236,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        <Plus size={18} color={C.rose} strokeWidth={2.5} />
      </div>
      新增比較日期
    </button>
  );
}

// ── 比較格子 ──────────────────────────────────────────────────────────────────
function CompareSlot({
  date, hour, dates, iopId, imageList, canClose, onClose, onDateChange,
}: {
  date: string; hour: number;
  dates: string[]; iopId: string; imageList: SpatialImageList;
  canClose: boolean; onClose: () => void; onDateChange: (d: string) => void;
}) {
  const filename   = date ? `PM25_XGB_${date}_${String(hour).padStart(2, '0')}.jpg` : null;
  const fileExists = filename ? imageList.hourly.includes(filename) : false;
  const imgUrl     = fileExists && filename ? getSpatialImageUrl(iopId, 'hourly', filename) : null;

  useEffect(() => {
    if (!date) return;
    for (let h = 0; h < 24; h++) {
      const fn = `PM25_XGB_${date}_${String(h).padStart(2, '0')}.jpg`;
      if (imageList.hourly.includes(fn)) {
        const img = new window.Image();
        img.src = getSpatialImageUrl(iopId, 'hourly', fn);
      }
    }
  }, [date, iopId, imageList.hourly]);

  return (
    <div style={{
      width: '100%', height: '100%', background: '#fff',
      border: `1.5px solid ${C.roseBorder}`,
      borderRadius: 14, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 格子頭部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 8px',
        borderBottom: `1px solid rgba(72,149,236,0.10)`,
        background: 'rgba(72,149,236,0.06)', flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 900, color: C.rose, letterSpacing: '-0.2px' }}>
          {date ? fmtFull(date) : '—'}
        </span>
        {canClose && (
          <button
            onClick={onClose}
            style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: 'none', background: 'rgba(72,149,236,0.14)',
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            aria-label="移除此比較格"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220,60,60,0.20)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(72,149,236,0.14)')}
          >
            <X size={12} color={C.muted} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* 日期 pills */}
      <div style={{ padding: '8px 10px 6px', flexShrink: 0 }}>
        <DatePills dates={dates} selected={date} onChange={onDateChange} size="sm" />
      </div>

      {/* 圖片 */}
      <div style={{ padding: '0 10px 10px', flex: 1 }}>
        <FadeImage
          url={imgUrl}
          alt={`PM2.5 ${date} ${String(hour).padStart(2, '0')}:00`}
          minHeight={160} aspectRatio={1.18}
        />
      </div>
    </div>
  );
}

// ── Section A：逐小時圖 ───────────────────────────────────────────────────────
let _id = 0;
const uid = () => `s${++_id}`;
interface SlotState { id: string; date: string; }

function HourlySection({ iopId, imageList }: { iopId: string; imageList: SpatialImageList }) {
  const dates = [...new Set(imageList.hourly.map(parseHourlyDate))].sort();
  const [hour,  setHour]  = useState(12);
  const [slots, setSlots] = useState<SlotState[]>([{ id: uid(), date: dates[0] ?? '' }]);

  const addSlot = () => {
    if (slots.length >= 3) return;
    const used = new Set(slots.map((s) => s.date));
    const next = dates.find((d) => !used.has(d)) ?? dates[0] ?? '';
    setSlots((p) => [...p, { id: uid(), date: next }]);
  };
  const removeSlot = (id: string) => setSlots((p) => p.filter((s) => s.id !== id));
  const updateDate = (id: string, d: string) => setSlots((p) => p.map((s) => s.id === id ? { ...s, date: d } : s));

  const count    = slots.length;
  const isSingle = count === 1;
  const ADD_W    = 160;

  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: C.glassShadow, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '18px 24px 14px', borderBottom: `1px solid rgba(72,149,236,0.10)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Map size={15} color={C.rose} strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>逐小時 <PM25 /> 空間分佈</div>
          <div style={{ fontSize: 11, color: C.hint, fontWeight: 500 }}>XGBoost 模型輸出 · 桃園市空間推估</div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 時間控制區 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          padding: '20px 24px',
          background: 'rgba(72,149,236,0.04)',
          borderRadius: 14, border: `1px solid ${C.roseBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setHour((h) => Math.max(0, h - 1))} disabled={hour === 0}
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
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '10px 28px', background: '#fff', borderRadius: 12,
              border: `1.5px solid ${C.roseBorder}`,
              boxShadow: '0 2px 10px rgba(72,149,236,0.12)', minWidth: 130,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>時間</span>
              <span style={{ fontSize: 28, fontWeight: 900, color: C.rose, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {String(hour).padStart(2, '0')}:00
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.hint }}>LST（本地時間）</span>
            </div>

            <button
              onClick={() => setHour((h) => Math.min(23, h + 1))} disabled={hour === 23}
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

          <div style={{ width: '100%', maxWidth: 520, display: 'flex' }}>
            <HourSlider value={hour} onChange={setHour} />
          </div>
        </div>

        {/* 格子區 */}
        {isSingle ? (
          <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: ADD_W, flexShrink: 0, alignSelf: 'stretch' }}>
              <AddSlotButton onClick={addSlot} />
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0, maxWidth: 380 }}>
              <CompareSlot
                date={slots[0].date} hour={hour}
                dates={dates} iopId={iopId} imageList={imageList}
                canClose={false} onClose={() => {}}
                onDateChange={(d) => updateDate(slots[0].id, d)}
              />
            </div>
            <div style={{ width: ADD_W, flexShrink: 0, alignSelf: 'stretch' }}>
              <AddSlotButton onClick={addSlot} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'stretch' }}>
            {slots.map((slot) => (
              <div key={slot.id} style={{ flex: '1 1 0', minWidth: 0, maxWidth: 380 }}>
                <CompareSlot
                  date={slot.date} hour={hour}
                  dates={dates} iopId={iopId} imageList={imageList}
                  canClose={count > 1}
                  onClose={() => removeSlot(slot.id)}
                  onDateChange={(d) => updateDate(slot.id, d)}
                />
              </div>
            ))}
            {count < 3 && (
              <div style={{ flex: '0 0 150px' }}>
                <AddSlotButton onClick={addSlot} />
              </div>
            )}
          </div>
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

  const hasHourly = imageList.hourly.length > 0;
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
