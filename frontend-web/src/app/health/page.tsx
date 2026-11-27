'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { MoeStationData } from '@shared/api/moe';
import {
  DISTRICT_STATIC_AQ,
  EPA_STATION_TO_DISTRICT,
  findNearestDistrict,
} from '@shared/constants/districts';
import { useAuth } from '@/lib/auth-context';
import { getAqiLevel } from '@/lib/health/aqiUtils';
import { AqiGauge } from '@/components/shared/AqiGauge';
import { Disclaimer } from '@/components/health/Disclaimer';
import { OFFICIAL_LEVEL_TEXT } from '@shared/constants/officialText';
import { AQI_LEVELS } from '@shared/constants/airHealth';
import { API_BASE } from '@/lib/apiBase';
import TaoyuanSVGMap from '@/components/map/TaoyuanSVGMap';
import { AuthGuard } from '@/components/auth/AuthGuard';

/* ── fetch ───────────────────────────────────────────── */
const fetchMoeStations = (): Promise<MoeStationData[]> =>
  fetch(`${API_BASE}/moe`)
    .then((r) => r.json())
    .then((res) => res.data);

/* ── 設計 token ───────────────────────────────────────── */
const C = {
  primary:       '#4895EC',
  primaryAlpha:  'rgba(72,149,236,0.12)',
  primaryBorder: 'rgba(72,149,236,0.30)',
  glass:         'rgba(255,255,255,0.52)',
  glassBorder:   'rgba(255,255,255,0.72)',
  glassShadow:   '0 4px 16px rgba(30,58,95,0.10)',
  text:          '#0F1D3A',
  muted:         '#4A6080',
  hint:          '#7A9AC0',
};

/* ── 區域擴充污染物靜態資料 ───────────────────────────── */
const DISTRICT_EXTENDED: Record<string, { no2: number; so2: number; co: number; pm10: number }> = {
  桃園區: { no2: 15, so2: 2.5, co: 0.45, pm10: 45 },
  中壢區: { no2: 15, so2: 1.3, co: 0.41, pm10: 44 },
  八德區: { no2: 12, so2: 2.1, co: 0.38, pm10: 38 },
  龜山區: { no2: 18, so2: 3.2, co: 0.55, pm10: 52 },
  蘆竹區: { no2: 11, so2: 2.0, co: 0.35, pm10: 32 },
  大園區: { no2: 10, so2: 2.8, co: 0.30, pm10: 30 },
  大溪區: { no2: 9,  so2: 1.8, co: 0.28, pm10: 28 },
  平鎮區: { no2: 13, so2: 2.2, co: 0.40, pm10: 36 },
  楊梅區: { no2: 12, so2: 2.0, co: 0.36, pm10: 34 },
  龍潭區: { no2: 10, so2: 1.9, co: 0.36, pm10: 33 },
  觀音區: { no2: 16, so2: 3.5, co: 0.48, pm10: 50 },
  新屋區: { no2: 14, so2: 3.0, co: 0.46, pm10: 48 },
  復興區: { no2: 5,  so2: 1.2, co: 0.20, pm10: 20 },
};

/* ── 污染物六等級判斷（對齊 AQI 標準色） ────────────── */
interface PollutantLevel { label: string; color: string; min: number; max: number }

function getPollutantLevels(key: PollutantKey): PollutantLevel[] {
  // 對照環境部濃度對照表，6 段對應 AQI_LEVELS id 1~6
  const table: Record<PollutantKey, Array<[number, number]>> = {
    'PM2.5': [[0,12.4],[12.5,30.4],[30.5,54.4],[54.5,150.4],[150.5,250.4],[250.5,500]],
    'PM10':  [[0,30],[31,75],[76,190],[191,354],[355,424],[425,604]],
    'O₃':   [[0,54],[55,70],[71,85],[86,105],[106,200],[201,604]],   // ppb (8h)
    'NO₂':  [[0,21],[22,100],[101,360],[361,649],[650,1249],[1250,2049]],
    'SO₂':  [[0,8],[9,65],[66,160],[161,304],[305,604],[605,1004]],
    'CO':   [[0,4.4],[4.5,9.4],[9.5,12.4],[12.5,15.4],[15.5,30.4],[30.5,50.4]],
  };
  return AQI_LEVELS.map((l, i) => ({
    label: l.label,
    color: l.hex,
    min: table[key][i][0],
    max: table[key][i][1],
  }));
}

function getPollutantStatus(key: PollutantKey, value: number): { status: string; color: string; levelIdx: number } {
  const levels = getPollutantLevels(key);
  for (let i = 0; i < levels.length; i++) {
    if (value <= levels[i].max) return { status: levels[i].label, color: levels[i].color, levelIdx: i };
  }
  const last = levels[levels.length - 1];
  return { status: last.label, color: last.color, levelIdx: levels.length - 1 };
}

/* ── 污染物定義 ──────────────────────────────────────── */
type PollutantKey = 'PM2.5' | 'PM10' | 'O₃' | 'NO₂' | 'SO₂' | 'CO';

const POLLUTANT_META: Array<{
  key: PollutantKey;
  nameJsx: React.ReactNode;
  unit: string;
  desc: string;
  arcMax: number;
  markerVal: number;
  markerLabel: string;
}> = [
  {
    key: 'PM2.5',
    nameJsx: <><span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>PM</span><sub style={{ fontSize: 11, fontWeight: 700 }}>2.5</sub></>,
    unit: 'μg/m³', arcMax: 150, markerVal: 12.4, markerLabel: '12.4',
    desc: '0.5×前12小時平均 + 0.5×前4小時平均',
  },
  {
    key: 'O₃',
    nameJsx: <><span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>O</span><sub style={{ fontSize: 11, fontWeight: 700 }}>3</sub></>,
    unit: 'ppb', arcMax: 200, markerVal: 54, markerLabel: '54',
    desc: '最近連續 8 小時移動平均值',
  },
  {
    key: 'PM10',
    nameJsx: <><span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>PM</span><sub style={{ fontSize: 11, fontWeight: 700 }}>10</sub></>,
    unit: 'μg/m³', arcMax: 350, markerVal: 30, markerLabel: '30',
    desc: '0.5×前12小時平均 + 0.5×前4小時平均',
  },
  {
    key: 'NO₂',
    nameJsx: <><span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>NO</span><sub style={{ fontSize: 11, fontWeight: 700 }}>2</sub></>,
    unit: 'ppb', arcMax: 500, markerVal: 21, markerLabel: '21',
    desc: '即時濃度值',
  },
  {
    key: 'SO₂',
    nameJsx: <><span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>SO</span><sub style={{ fontSize: 11, fontWeight: 700 }}>2</sub></>,
    unit: 'ppb', arcMax: 300, markerVal: 8, markerLabel: '8',
    desc: '即時濃度值',
  },
  {
    key: 'CO',
    nameJsx: <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>CO</span>,
    unit: 'ppm', arcMax: 15, markerVal: 4.4, markerLabel: '4.4',
    desc: '最近連續 8 小時移動平均值',
  },
];

/* ── 半圓弧 (dashboard GaugeArc 移植) ───────────────── */
const ARC_R   = 45;
const ARC_CX  = 55;
const ARC_CY  = 58;
const ARC_LEN = Math.PI * ARC_R;

function polarToXY(angleDeg: number) {
  const rad = (Math.PI * (180 - angleDeg)) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(rad), y: ARC_CY - ARC_R * Math.sin(rad) };
}

function PollutantArc({ value, max, markerVal, markerLabel, color, unit, animKey }: {
  value: number; max: number; markerVal: number; markerLabel: string;
  color: string; unit: string; animKey: string;
}) {
  const dashOffset = ARC_LEN * (1 - Math.min(value / max, 1));
  const markerAngle = Math.min(markerVal / max, 1) * 180;
  const mp  = polarToXY(markerAngle);
  const rad = (Math.PI * (180 - markerAngle)) / 180;
  const lx  = ARC_CX + (ARC_R + 14) * Math.cos(rad);
  const ly  = ARC_CY - (ARC_R + 14) * Math.sin(rad);
  return (
    <svg width={190} height={80} viewBox="-10 0 120 68" aria-hidden="true"
      style={{ display: 'block', margin: '0 auto', overflow: 'visible', width: 152, height: 68 }}>
      <path d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`}
        fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={7} strokeLinecap="round" />
      <path
        key={`arc-${animKey}`}
        d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`}
        fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={ARC_LEN} strokeDashoffset={ARC_LEN}
      >
        <animate attributeName="stroke-dashoffset"
          from={ARC_LEN} to={dashOffset}
          dur="0.8s" fill="freeze" calcMode="linear" />
      </path>
      <line x1={mp.x} y1={mp.y} x2={lx} y2={ly}
        stroke="rgba(0,0,0,0.28)" strokeWidth={1.5} strokeLinecap="round" />
      <text x={lx} y={ly - 3} fontSize={9} fill="#aaa" textAnchor="middle">{markerLabel}</text>
      <text x={ARC_CX} y={52} fontSize={20} fontWeight={700} fill={color} textAnchor="middle">{value}</text>
      <text x={ARC_CX} y={63} fontSize={9}  fill="#aaa" textAnchor="middle">{unit}</text>
    </svg>
  );
}

/* ── Tooltip（共用，藍色主題，含動畫 + 修正三角形） ─── */
function Tooltip({ children, borderColor }: { children: React.ReactNode; borderColor?: string }) {
  const bc = borderColor ?? C.primaryBorder;
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 7px)',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#EBF3FE',
      border: `1px solid ${bc}`,
      color: C.text,
      borderRadius: 8,
      padding: '5px 10px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      zIndex: 100,
      pointerEvents: 'none',
      boxShadow: '0 4px 12px rgba(72,149,236,0.18)',
      animation: 'tooltipPop 0.15s ease',
    }}>
      {children}
      {/* 三角：外層（邊框色）+ 內層（填色），修正沒有邊框的問題 */}
      <span style={{
        position: 'absolute', top: '100%', left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: `6px solid ${bc}`,
      }} />
      <span style={{
        position: 'absolute', top: 'calc(100% - 1px)', left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: '5px solid #EBF3FE',
      }} />
    </div>
  );
}

/* ── 污染物卡片（含 hover tooltip + 狀態標籤） ────────── */
function PollutantCard({ meta, value, district }: {
  meta: typeof POLLUTANT_META[number];
  value: number;
  district: string;
}) {
  const { status, color, levelIdx } = getPollutantStatus(meta.key, value);
  const [hovered, setHovered] = useState(false);
  const levels = getPollutantLevels(meta.key);
  const lv = levels[levelIdx];

  return (
    <div
      style={{
        flex: '1 1 140px', minWidth: 140,
        padding: '14px 16px', borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.70)',
        border: `1px solid ${C.glassBorder}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      {/* 污染物名稱 */}
      <div style={{ color: C.hint, lineHeight: 1 }}>{meta.nameJsx}</div>

      {/* 半圓弧 */}
      <PollutantArc
        key={`${district}-${meta.key}`}
        value={value} max={meta.arcMax}
        markerVal={meta.markerVal} markerLabel={meta.markerLabel}
        color={color} unit={meta.unit}
        animKey={`${district}-${meta.key}-${value}`}
      />
      {/* 良好上限說明 */}
      <span style={{ fontSize: 9, color: C.hint, textAlign: 'center', marginTop: -4 }}>
        良好上限為 （{meta.markerLabel} {meta.unit}）
      </span>

      {/* 狀態標籤（hover 顯示濃度範圍） */}
      <div style={{ position: 'relative', alignSelf: 'flex-start' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          padding: '3px 10px', borderRadius: 99,
          fontSize: 10, fontWeight: 700,
          backgroundColor: `${color}22`,
          border: `1px solid ${color}66`,
          color, cursor: 'default',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          transform: hovered ? 'scale(1.08)' : 'scale(1)',
          boxShadow: hovered ? `0 2px 8px ${color}44` : 'none',
        }}>
          {status}
        </div>
        {hovered && (
          <Tooltip borderColor={`${color}88`}>
            <span style={{ color, fontWeight: 800 }}>{status}</span>
            <span style={{ color: C.muted }}>　{lv.min}–{lv.max} {meta.unit}</span>
          </Tooltip>
        )}
      </div>

      {/* 即時統計說明 */}
      <span style={{ fontSize: 9, color: C.hint, lineHeight: 1.5, marginTop: 4 }}>
        {meta.desc}
      </span>
    </div>
  );
}

/* ── AQI 色票選擇器 ───────────────────────────────────── */
function AqiLevelPicker({
  activeLevelId, selectedLevelId, onSelect,
}: {
  activeLevelId: number;
  selectedLevelId: number;
  onSelect: (id: number) => void;
}) {
  const [tooltipId, setTooltipId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (id: number) => { if (timerRef.current) clearTimeout(timerRef.current); setTooltipId(id); };
  const hide = () => { timerRef.current = setTimeout(() => setTooltipId(null), 100); };

  return (
    <>
      <style>{`@keyframes tooltipPop { from { opacity:0; transform:translateX(-50%) translateY(4px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {AQI_LEVELS.map((l) => {
          const isActive   = l.id === activeLevelId;
          const isSelected = l.id === selectedLevelId;
          const showTip    = tooltipId === l.id;
          return (
            <div key={l.id} style={{ position: 'relative' }}>
              <button
                onClick={() => onSelect(l.id)}
                onMouseEnter={() => show(l.id)}
                onMouseLeave={hide}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 99,
                  border: isSelected ? `2px solid ${l.hex}` : '2px solid transparent',
                  backgroundColor: isSelected ? `${l.hex}22` : `${l.hex}11`,
                  cursor: 'pointer', outline: 'none',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? `0 0 0 3px ${l.hex}30` : 'none',
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {isSelected && (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: l.hex, flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: 12, fontWeight: isSelected ? 800 : 600,
                  color: isSelected ? l.hex : C.hint, whiteSpace: 'nowrap',
                }}>
                  {isActive ? `${l.label} ·NOW` : l.label}
                </span>
              </button>

              {showTip && (
                <Tooltip>
                  <span style={{ color: l.hex, fontWeight: 800 }}>{l.colorName}</span>
                  <span style={{ color: C.muted }}>　AQI {l.min}–{l.max}</span>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── 活動建議欄 ───────────────────────────────────────── */
function AdviceColumn({ title, items, highlight, levelHex, showBadge }: {
  title: string; items: string[];
  highlight: boolean; levelHex: string; showBadge: boolean;
}) {
  return (
    <div style={{
      flex: 1, padding: '14px 16px', borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.65)',
      border: `1.5px solid ${highlight ? levelHex + '88' : C.glassBorder}`,
      boxShadow: highlight ? `0 0 0 3px ${levelHex}22` : 'none',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</span>
        {highlight && showBadge && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: 0.3,
            backgroundColor: C.primaryAlpha, padding: '2px 8px', borderRadius: 99,
          }}>依您的設定</span>
        )}
      </div>
      {items.map((line, i) => {
        const text   = line.replace(/^\d+[.\s]\s*/, '');
        const hasNum = /^\d+[.\s]/.test(line);
        return (
          <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            {hasNum && (
              <span style={{
                flexShrink: 0, width: 17, height: 17, borderRadius: '50%',
                backgroundColor: `${levelHex}22`, border: `1.2px solid ${levelHex}66`,
                color: levelHex, fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
              }}>{i + 1}</span>
            )}
            <p style={{ fontSize: 11.5, lineHeight: 1.75, color: C.text, margin: 0 }}>{text}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function HealthPage() {
  const { user } = useAuth();

  const [district,       setDistrict]       = useState('中壢區');
  const [allStations,    setAllStations]    = useState<MoeStationData[]>([]);
  const [isMobile,       setIsMobile]       = useState(false);
  const [previewLevelId, setPreviewLevelId] = useState<number | null>(null);
  const [aqiBoxHeight,   setAqiBoxHeight]   = useState<number | undefined>(undefined);
  const aqiBoxRef = useRef<HTMLDivElement>(null);
  const maxHeightRef = useRef(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 820);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestDistrict(pos.coords.latitude, pos.coords.longitude);
        setDistrict(nearest);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    fetchMoeStations().then(setAllStations).catch(console.error);
  }, []);

  /* ── AQI 計算 ───────────────────────────────────────── */
  const remoteMetrics = useMemo(() => {
    if (!allStations.length) return null;
    const sitename = Object.entries(EPA_STATION_TO_DISTRICT)
      .find(([, d]) => d === district)?.[0];
    if (!sitename) return null;
    const station = allStations.find((s) => s.sitename === sitename);
    if (!station) return null;
    const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ['中壢區'];
    return { district, aqi: station.aqi || base.aqi };
  }, [district, allStations]);

  const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ['中壢區'];
  const live = remoteMetrics?.district === district ? remoteMetrics : null;
  const aqi  = live?.aqi ?? base.aqi;

  const level = useMemo(() => getAqiLevel(aqi), [aqi]);
  useEffect(() => { setPreviewLevelId(null); }, [district]);

  const activeLevelId    = level?.id ?? 1;
  const displayLevelId   = previewLevelId ?? activeLevelId;
  const displayLevel     = AQI_LEVELS.find((l) => l.id === displayLevelId);
  const displayLevelText = OFFICIAL_LEVEL_TEXT.find((t) => t.levelId === displayLevelId);
  const isSensitive      = (user?.sensitivity ?? '一般民眾') === '敏感族群';

  /* 每次 level 切換後量測高度，記錄最大值並鎖定 */
  useEffect(() => {
    if (isMobile) return;
    const el = aqiBoxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = el.offsetHeight;
    if (h > maxHeightRef.current) {
      maxHeightRef.current = h;
      setAqiBoxHeight(h);
    } else {
      el.style.height = `${maxHeightRef.current}px`;
    }
  }, [displayLevelId, isMobile]);

  /* ── 污染物數值 ──────────────────────────────────────── */
  const liveStation = useMemo(() => {
    if (!allStations.length) return null;
    const sitename = Object.entries(EPA_STATION_TO_DISTRICT)
      .find(([, d]) => d === district)?.[0];
    return allStations.find((s) => s.sitename === sitename) ?? null;
  }, [district, allStations]);

  const extStatic = DISTRICT_EXTENDED[district] ?? DISTRICT_EXTENDED['中壢區'];
  const pollutantValues: Record<PollutantKey, number> = {
    'PM2.5': liveStation?.pm25 || (DISTRICT_STATIC_AQ[district]?.pm25 ?? 18),
    'PM10':  liveStation?.pm10 || extStatic.pm10,
    'O₃':   liveStation?.o3   || (DISTRICT_STATIC_AQ[district]?.o3 ?? 42),
    'NO₂':  liveStation?.no2  || extStatic.no2,
    'SO₂':  liveStation?.so2  || extStatic.so2,
    'CO':   liveStation?.co   || extStatic.co,
  };

  /* ── AQI 資訊框 ──────────────────────────────────────── */
  const mapHeight   = isMobile ? 'min(55vw, 320px)' : (aqiBoxHeight ? `${aqiBoxHeight}px` : 'min(60vh, 540px)');
  const aqiHeight   = isMobile ? undefined : (aqiBoxHeight ?? undefined);

  const renderRight = () => (
    <div ref={aqiBoxRef} style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      backgroundColor: C.glass,
      border: `1px solid ${C.glassBorder}`,
      borderRadius: 20,
      boxShadow: C.glassShadow,
      padding: '24px 20px',
      flex: 1, minWidth: 280,
      alignSelf: isMobile ? 'auto' : 'stretch',
      height: aqiHeight,
      minHeight: isMobile ? 'auto' : undefined,
    }}>
      {/* 小標題 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 16, marginBottom: 8 }}>
        <div style={{
          width: 3, height: 16, flexShrink: 0, borderRadius: 2,
          backgroundColor: C.primary, boxShadow: `0 0 8px ${C.primaryBorder}`,
        }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>AQI 空氣指標</span>
      </div>

      {/* 地區名 + 等級標籤 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MapPin size={18} color={C.primary} strokeWidth={2.5} />
          <span style={{ fontSize: 24, fontWeight: 800, color: C.primary }}>{district}</span>
        </div>
        {level && (
          <span style={{
            fontSize: 14, fontWeight: 700, padding: '5px 14px', borderRadius: 99,
            backgroundColor: level.hex, color: '#fff',
          }}>
            {level.label}
          </span>
        )}
      </div>

      {/* 第一排：圓環 ｜ 色票 + 健康影響 */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 20 : 24,
        alignItems: isMobile ? 'stretch' : 'flex-start',
        marginTop: 12,
      }}>
        {/* 圓環 */}
        <div style={{ flexShrink: 0 }}>
          <AqiGauge
            key={`${district}-${aqi}`}
            aqi={aqi}
            animationKey={`${district}-${aqi}`}
            size={190}
          />
        </div>

        {/* 間隔 */}
        <div style={{
          width: isMobile ? '100%' : 1, height: isMobile ? 1 : 'auto',
          alignSelf: 'stretch', flexShrink: 0,
        }} />

        {/* 色票 + 健康影響 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AqiLevelPicker
            activeLevelId={activeLevelId}
            selectedLevelId={displayLevelId}
            onSelect={(id) => setPreviewLevelId(id === activeLevelId ? null : id)}
          />

          {/* 等級資訊列 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', borderRadius: 10, minHeight: 38, marginTop: 4,
            backgroundColor: `${displayLevel?.hex}18`,
            border: `1px ${previewLevelId !== null && previewLevelId !== activeLevelId ? 'dashed' : 'solid'} ${displayLevel?.hex}66`,
            transition: 'all 0.3s ease',
          }}>
            <span style={{ fontSize: 13, color: C.muted }}>
              <strong style={{ color: displayLevel?.hex }}>{displayLevel?.label}</strong>
              　AQI {displayLevel?.min}–{displayLevel?.max}
            </span>
            {previewLevelId !== null && previewLevelId !== activeLevelId ? (
              <button onClick={() => setPreviewLevelId(null)} style={{
                fontSize: 11, color: C.hint, background: 'none', border: 'none',
                cursor: 'pointer', padding: '2px 8px', borderRadius: 4, flexShrink: 0,
              }}>回到當前</button>
            ) : (
              <span style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0, visibility: 'hidden' }}>回到當前</span>
            )}
          </div>

          {/* 人體健康影響 */}
          <div style={{
            padding: '14px 16px', borderRadius: 12, marginTop: 2,
            backgroundColor: displayLevel ? `${displayLevel.hex}18` : 'rgba(30,58,95,0.04)',
            border: `1px solid ${displayLevel ? displayLevel.hex + '44' : C.glassBorder}`,
            transition: 'all 0.3s ease',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.hint, margin: '0 0 6px', letterSpacing: 0.5 }}>
              人體健康影響
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: C.text, margin: 0 }}>
              {displayLevelText?.healthImpact ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(30,58,95,0.08)' }} />

      {/* 活動建議 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.hint, letterSpacing: 0.5 }}>活動建議</span>
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          <AdviceColumn
            title="一般民眾活動建議"
            items={displayLevelText?.generalAdvice ?? ['—']}
            highlight={!isSensitive}
            levelHex={displayLevel?.hex ?? C.primary}
            showBadge={false}
          />
          <AdviceColumn
            title="敏感性族群活動建議"
            items={displayLevelText?.sensitiveAdvice ?? ['—']}
            highlight={isSensitive}
            levelHex={displayLevel?.hex ?? C.primary}
            showBadge={true}
          />
        </div>
      </div>
    </div>
  );

  /* ── 地圖欄 ───────────────────────────────────────────── */
  const renderLeft = () => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      flexShrink: 0, flexGrow: 0,
      width: isMobile ? '100%' : 'min(44%, 520px)',
      minWidth: isMobile ? 'unset' : 280,
      position: 'relative',
    }}>
      <div style={{
        width: '100%', height: mapHeight,
        overflow: 'hidden', position: 'relative',
      }}>
        <TaoyuanSVGMap selectedDistrict={district} onSelectDistrict={setDistrict} />
        <button type="button" style={{
          position: 'absolute', left: isMobile ? 12 : 20, bottom: isMobile ? 12 : 16,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          border: `1px solid ${C.primary}`, borderRadius: 999,
          padding: isMobile ? '8px 14px' : '10px 18px',
          background: '#EBF3FE', color: C.primary,
          fontSize: isMobile ? 13 : 15, fontWeight: 800,
          whiteSpace: 'nowrap', cursor: 'default',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          點選查看區域詳情
          <MapPin size={15} strokeWidth={2.5} />
          {district}
        </button>
      </div>
    </div>
  );

  /* ── 完整版面 ──────────────────────────────────────────── */
  return (
    <AuthGuard>
      <style>{`@keyframes tooltipPop { from { opacity:0; transform:translateX(-50%) translateY(4px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
      <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)' }}>
        <div style={{
          padding: isMobile ? '20px 16px 80px' : '50px 40px 50px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* 地圖 + AQI */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            gap: 24,
            alignItems: 'flex-start',
          }}>
            {renderLeft()}
            {renderRight()}
          </div>

          {/* 污染物模塊 */}
          <div style={{
            backgroundColor: C.glass,
            border: `1px solid ${C.glassBorder}`,
            borderRadius: 20,
            boxShadow: C.glassShadow,
            padding: '20px 20px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 16 }}>
              <div style={{
                width: 3, height: 14, flexShrink: 0, borderRadius: 2,
                backgroundColor: C.primary, boxShadow: `0 0 8px ${C.primaryBorder}`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>污染物即時濃度</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {POLLUTANT_META.map((meta) => (
                <PollutantCard
                  key={meta.key}
                  meta={meta}
                  value={pollutantValues[meta.key]}
                  district={district}
                />
              ))}
            </div>
          </div>

          {/* 免責聲明 */}
          <div style={{ maxWidth: isMobile ? '100%' : 760 }}>
            <Disclaimer variant="full" />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
