'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Activity, ChevronDown, Clock, Database,
  Droplets, MapPin, Minus, Search, Shield,
  Thermometer, TrendingDown, TrendingUp, X,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:       '#D4567A',
  primaryAlpha:  'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)',
  red:           '#E94C78',
  redAlpha:      'rgba(233,76,120,0.12)',
  redBorder:     'rgba(233,76,120,0.30)',
  amber:         '#D97706',
  amberAlpha:    'rgba(217,119,6,0.12)',
  amberBorder:   'rgba(217,119,6,0.28)',
  green:         '#059669',
  greenAlpha:    'rgba(5,150,105,0.12)',
  greenBorder:   'rgba(5,150,105,0.28)',
  glass:         'rgba(255,255,255,0.60)',
  glassBorder:   'rgba(255,255,255,0.80)',
  glassShadow:   '0 4px 16px rgba(180,140,160,0.10)',
  text:          '#1a1220',
  muted:         '#7a6880',
  hint:          '#b0a0b8',
};

/* ─── Gauge helpers ──────────────────────────────────────────── */
const GAUGE_PARAMS: Record<string, { max: number; marker: number }> = {
  'PM2.5': { max: 150, marker: 15.4 },
  'O3':    { max: 200, marker: 54   },
  'NOX':   { max: 200, marker: 100  },
  'VOCs':  { max: 200, marker: 50   },
};

function pollutantColor(pollutant: string, value: number): string {
  if (pollutant === 'PM2.5') return value <= 15.4 ? C.primary : value <= 35.4 ? C.amber : C.red;
  if (pollutant === 'O3')    return value <= 54   ? C.primary : value <= 70   ? C.amber : C.red;
  if (pollutant === 'NOX')   return value <= 100  ? C.primary : value <= 150  ? C.amber : C.red;
  if (pollutant === 'VOCs')  return value <= 50   ? C.primary : value <= 100  ? C.amber : C.red;
  return C.primary;
}

const ARC_R = 45, ARC_CX = 55, ARC_CY = 58, ARC_LEN = Math.PI * ARC_R;

function polarToXY(deg: number) {
  const rad = (Math.PI * (180 - deg)) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(rad), y: ARC_CY - ARC_R * Math.sin(rad) };
}

function GaugeArc({ value, pollutant, unit }: { value: number; pollutant: string; unit: string }) {
  const { max, marker } = GAUGE_PARAMS[pollutant] ?? { max: 200, marker: 100 };
  const color = pollutantColor(pollutant, value);
  const dashOffset = ARC_LEN * (1 - Math.min(value / max, 1));
  const markerAngle = Math.min(marker / max, 1) * 180;
  const mp = polarToXY(markerAngle);
  const rad = (Math.PI * (180 - markerAngle)) / 180;
  const lx = ARC_CX + (ARC_R + 14) * Math.cos(rad);
  const ly = ARC_CY - (ARC_R + 14) * Math.sin(rad);

  return (
    <svg
      viewBox="-10 0 120 75"
      style={{ display: 'block', width: '100%', maxWidth: 190, margin: '0 auto', overflow: 'visible' }}
    >
      <path d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={7} strokeLinecap="round" />
      <path
        d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`}
        fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={ARC_LEN} strokeDashoffset={dashOffset}
      />
      <line x1={mp.x} y1={mp.y} x2={lx} y2={ly} stroke="rgba(0,0,0,0.22)" strokeWidth={1.5} strokeLinecap="round" />
      <text x={lx} y={ly - 3} fontSize={9} fill="#bbb" textAnchor="middle">{marker}</text>
      <text x={ARC_CX} y={50} fontSize={22} fontWeight={700} fill={color} textAnchor="middle">{value}</text>
      <text x={ARC_CX} y={63} fontSize={9} fill="#aaa" textAnchor="middle">{unit}</text>
    </svg>
  );
}

/* ─── Dropdown ───────────────────────────────────────────────── */
function Dropdown({ id, value, options, onSelect, openId, setOpenId }: {
  id: string; value: string; options: string[];
  onSelect: (v: string) => void;
  openId: string | null; setOpenId: (v: string | null) => void;
}) {
  const isOpen = openId === id;
  const isActive = value !== options[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : id); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
          backgroundColor: isActive ? C.primaryAlpha : C.glass,
          border: `1px solid ${isActive ? C.primaryBorder : C.glassBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: isActive ? 700 : 500,
          color: isActive ? C.primary : C.muted,
          transition: 'all 0.15s',
        }}
      >
        {value}
        <ChevronDown
          size={14} strokeWidth={2.5}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200,
            backgroundColor: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 160, overflow: 'hidden',
          }}
        >
          {options.map((opt, i) => (
            <button key={opt} onClick={() => { onSelect(opt); setOpenId(null); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '11px 16px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: value === opt ? 700 : 500,
              color: value === opt ? C.primary : C.text,
              backgroundColor: value === opt ? C.primaryAlpha : 'transparent',
              borderBottom: i < options.length - 1 ? '1px solid rgba(180,140,160,0.08)' : 'none',
            }}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Data ───────────────────────────────────────────────────── */
interface StationData {
  id: number;
  district: string;
  station: string;
  time: string;
  passed: boolean;
  pollutant: string;
  value: number;
  unit: string;
  source: string;
  version: string;
  timeCategory: '近24小時' | '近3天' | '近7天';
  region: string;
  trend: '上升中' | '下降中' | '穩定中';
  aqi: number;
  temperature: number;
  humidity: number;
}

const allMonitoringData: StationData[] = [
  { id: 1,  district: '中壢工業區',   station: 'Station TY-09',    time: '14:02', passed: true,  pollutant: 'PM2.5', value: 12, unit: 'μg/m³', source: 'MOE',   version: 'v2.1', timeCategory: '近24小時', region: '中壢區', trend: '下降中', aqi: 45,  temperature: 26, humidity: 68 },
  { id: 2,  district: '蘆竹工業區',   station: 'Grid Alpha-4',     time: '13:45', passed: false, pollutant: 'PM2.5', value: 48, unit: 'μg/m³', source: '微感測', version: 'v2.0', timeCategory: '近24小時', region: '蘆竹區', trend: '上升中', aqi: 128, temperature: 28, humidity: 72 },
  { id: 3,  district: '觀音海岸',     station: 'Sensor TY-42',     time: '13:20', passed: true,  pollutant: 'PM2.5', value: 8,  unit: 'μg/m³', source: '光達',   version: 'v2.1', timeCategory: '近24小時', region: '觀音區', trend: '穩定中', aqi: 30,  temperature: 24, humidity: 78 },
  { id: 4,  district: '大園工業區',   station: 'Station TY-15',    time: '12:30', passed: true,  pollutant: 'O3',    value: 35, unit: 'ppb',    source: 'MOE',   version: 'v2.1', timeCategory: '近24小時', region: '大園區', trend: '穩定中', aqi: 42,  temperature: 27, humidity: 65 },
  { id: 5,  district: '桃園市區',     station: 'Micro-Sensor B12', time: '11:15', passed: false, pollutant: 'NOX',   value: 85, unit: 'ppb',    source: '微感測', version: 'v1.8', timeCategory: '近24小時', region: '桃園區', trend: '上升中', aqi: 112, temperature: 29, humidity: 62 },
  { id: 6,  district: '中壢商業區',   station: 'LUV-Station C3',   time: '10:45', passed: true,  pollutant: 'VOCs',  value: 22, unit: 'ppb',    source: 'LUV',   version: 'v3.0', timeCategory: '近24小時', region: '中壢區', trend: '下降中', aqi: 55,  temperature: 25, humidity: 70 },
  { id: 7,  district: '觀音工業區',   station: 'Grid Beta-7',      time: '昨日 23:30', passed: false, pollutant: 'PM2.5', value: 52, unit: 'μg/m³', source: '微感測', version: 'v2.0', timeCategory: '近3天', region: '觀音區', trend: '上升中', aqi: 140, temperature: 23, humidity: 80 },
  { id: 8,  district: '大園住宅區',   station: 'Station TY-22',    time: '昨日 22:15', passed: true,  pollutant: 'O3',    value: 28, unit: 'ppb',    source: 'MOE',   version: 'v2.1', timeCategory: '近3天', region: '大園區', trend: '穩定中', aqi: 35,  temperature: 22, humidity: 75 },
  { id: 9,  district: '桃園機場周邊', station: 'LIDAR-Point A1',   time: '昨日 20:00', passed: true,  pollutant: 'NOX',   value: 42, unit: 'ppb',    source: '光達',   version: 'v2.3', timeCategory: '近3天', region: '大園區', trend: '下降中', aqi: 58,  temperature: 24, humidity: 71 },
  { id: 10, district: '中壢工業區',   station: 'Micro-Array D5',   time: '昨日 18:45', passed: false, pollutant: 'VOCs',  value: 78, unit: 'ppb',    source: '微感測', version: 'v1.9', timeCategory: '近3天', region: '中壢區', trend: '穩定中', aqi: 95,  temperature: 27, humidity: 66 },
  { id: 11, district: '桃園都會區',   station: 'LUV-Hub M1',       time: '3天前 16:30', passed: true,  pollutant: 'PM2.5', value: 18, unit: 'μg/m³', source: 'LUV',   version: 'v3.0', timeCategory: '近7天', region: '桃園區', trend: '下降中', aqi: 62,  temperature: 26, humidity: 69 },
  { id: 12, district: '觀音沿海',     station: 'Station TY-35',    time: '4天前 14:20', passed: true,  pollutant: 'O3',    value: 31, unit: 'ppb',    source: 'MOE',   version: 'v2.1', timeCategory: '近7天', region: '觀音區', trend: '穩定中', aqi: 38,  temperature: 23, humidity: 77 },
  { id: 13, district: '大園農業區',   station: 'LIDAR-Grid F8',    time: '5天前 12:10', passed: false, pollutant: 'NOX',   value: 95, unit: 'ppb',    source: '光達',   version: 'v2.3', timeCategory: '近7天', region: '大園區', trend: '上升中', aqi: 118, temperature: 25, humidity: 73 },
  { id: 14, district: '中壢市中心',   station: 'Micro-Net G2',     time: '6天前 09:45', passed: true,  pollutant: 'VOCs',  value: 25, unit: 'ppb',    source: '微感測', version: 'v2.0', timeCategory: '近7天', region: '中壢區', trend: '穩定中', aqi: 48,  temperature: 24, humidity: 72 },
  { id: 15, district: '桃園高鐵站',   station: 'LUV-Station H4',   time: '7天前 15:30', passed: true,  pollutant: 'PM2.5', value: 15, unit: 'μg/m³', source: 'LUV',   version: 'v3.0', timeCategory: '近7天', region: '桃園區', trend: '下降中', aqi: 55,  temperature: 26, humidity: 67 },
];

const TIME_TABS = ['近24小時', '近3天', '近7天'] as const;
const POLLUTANTS = ['全部污染物', 'PM2.5', 'O3', 'NOX', 'VOCs'];
const REGIONS    = ['所有區域', '桃園區', '中壢區', '大園區', '觀音區', '蘆竹區'];
const SOURCES    = ['全部來源', 'MOE', '微感測', '光達', 'LUV'];

/* ─── Stat chip ──────────────────────────────────────────────── */
function StatChip({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: string | number; label?: string; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon size={15} color={color} strokeWidth={2.2} />
      <span style={{ fontSize: 15, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {value}
        {label && <span style={{ fontWeight: 500, marginLeft: 2 }}>{label}</span>}
      </span>
    </div>
  );
}

/* ─── Station card ───────────────────────────────────────────── */
function StationCard({ station }: { station: StationData }) {
  const pColor  = pollutantColor(station.pollutant, station.value);
  const sColor  = station.passed ? C.green : C.red;
  const sAlpha  = station.passed ? C.greenAlpha : C.redAlpha;
  const sBorder = station.passed ? C.greenBorder : C.redBorder;

  const TrendIcon  = station.trend === '上升中' ? TrendingUp : station.trend === '下降中' ? TrendingDown : Minus;
  const tColor  = station.trend === '上升中' ? C.red   : station.trend === '下降中' ? C.green : C.hint;
  const tAlpha  = station.trend === '上升中' ? C.redAlpha   : station.trend === '下降中' ? C.greenAlpha : 'rgba(180,160,200,0.10)';
  const tBorder = station.trend === '上升中' ? C.redBorder  : station.trend === '下降中' ? C.greenBorder : 'rgba(180,160,200,0.20)';

  return (
    <div style={{
      backgroundColor: 'rgba(255,255,255,0.94)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 20,
      boxShadow: '0 4px 16px rgba(180,140,160,0.10)',
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{station.district}</p>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginTop: 3 }}>{station.station}</p>
          </div>
          <span style={{
            flexShrink: 0, marginLeft: 12,
            padding: '5px 12px', borderRadius: 99,
            backgroundColor: sAlpha, border: `1px solid ${sBorder}`,
            fontSize: 12, fontWeight: 700, color: sColor,
          }}>
            {station.passed ? '正常' : '異常'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={11} color={C.hint} strokeWidth={2} />
          <span style={{ fontSize: 11, color: C.hint, fontWeight: 500 }}>{station.time}</span>
          <span style={{ fontSize: 11, color: C.hint }}>·</span>
          <span style={{
            fontSize: 11, color: C.primary, fontWeight: 700,
            padding: '2px 8px', borderRadius: 99, backgroundColor: C.primaryAlpha,
          }}>
            {station.source}
          </span>
          <span style={{ fontSize: 11, color: C.hint, fontWeight: 500 }}>{station.version}</span>
        </div>
      </div>

      {/* Gauge section */}
      <div style={{ padding: '16px 20px 12px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 13, fontWeight: 800, color: pColor,
            padding: '3px 12px', borderRadius: 99,
            backgroundColor: `${pColor}18`, border: `1px solid ${pColor}40`,
          }}>
            {station.pollutant}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: C.muted,
            padding: '3px 10px', borderRadius: 99,
            backgroundColor: 'rgba(180,160,200,0.10)', border: '1px solid rgba(180,160,200,0.15)',
          }}>
            AQI {station.aqi}
          </span>
        </div>
        <GaugeArc value={station.value} pollutant={station.pollutant} unit={station.unit} />
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 99,
            backgroundColor: tAlpha, border: `1px solid ${tBorder}`,
            fontSize: 12, fontWeight: 700, color: tColor,
          }}>
            <TrendIcon size={13} strokeWidth={2.5} />
            {station.trend}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>
              <Thermometer size={12} color={C.hint} strokeWidth={2} />
              {station.temperature}°C
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>
              <Droplets size={12} color={C.hint} strokeWidth={2} />
              {station.humidity}%
            </span>
          </div>
        </div>
        <button style={{
          width: '100%', padding: '10px 0', borderRadius: 12, cursor: 'pointer',
          backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
          fontSize: 13, fontWeight: 700, color: C.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <MapPin size={14} strokeWidth={2} />
          查看完整監測資料
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function ExplorerPage() {
  const [searchText, setSearchText]           = useState('');
  const [activeTime, setActiveTime]           = useState<typeof TIME_TABS[number]>('近24小時');
  const [selectedPollutant, setSelectedPollutant] = useState(POLLUTANTS[0]);
  const [selectedRegion, setSelectedRegion]   = useState(REGIONS[0]);
  const [selectedSource, setSelectedSource]   = useState(SOURCES[0]);
  const [openId, setOpenId]                   = useState<string | null>(null);
  const [isMobile, setIsMobile]               = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const closeDropdown = useCallback(() => setOpenId(null), []);

  const timeData = allMonitoringData.filter(i => i.timeCategory === activeTime);

  const filtered = timeData.filter(item => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!item.district.toLowerCase().includes(q) && !item.station.toLowerCase().includes(q)) return false;
    }
    if (selectedPollutant !== POLLUTANTS[0] && item.pollutant !== selectedPollutant) return false;
    if (selectedRegion    !== REGIONS[0]    && item.region    !== selectedRegion)    return false;
    if (selectedSource    !== SOURCES[0]    && item.source    !== selectedSource)    return false;
    return true;
  });

  const passedCount = timeData.filter(i => i.passed).length;
  const failedCount = timeData.filter(i => !i.passed).length;
  const avgAqi      = Math.round(timeData.reduce((s, i) => s + i.aqi, 0) / (timeData.length || 1));

  return (
    <div
      style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 60 }}
      onClick={closeDropdown}
    >
      <div style={{ padding: isMobile ? '16px 16px 0' : '28px 40px 0' }}>

        {/* ── Search bar + stat chips ──────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? 10 : 14, marginBottom: 16,
        }}>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.92)',
            borderRadius: 999,
            boxShadow: '0 4px 16px rgba(180,140,160,0.10)',
            display: 'flex', alignItems: 'center', padding: '10px 18px', gap: 10,
            ...(isMobile ? {} : { width: 340, flexShrink: 0 }),
          }}>
            <Search size={16} strokeWidth={2} color={C.hint} />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜尋區域或感測器 ID..."
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: 14, color: C.text, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.hint, padding: 2, display: 'flex', borderRadius: 99 }}
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatChip icon={Database} value={timeData.length} label="站"  color={C.primary} />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={Shield}   value={passedCount}     label="正常" color={C.green}   />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={Activity} value={failedCount}     label="異常" color={failedCount > 0 ? C.red : C.green} />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={MapPin}   value={`AQI ${avgAqi}`}              color={C.amber}   />
          </div>
        </div>

        {/* ── Controls bar ─────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIME_TABS.map(tab => {
            const active = activeTime === tab;
            return (
              <button key={tab} onClick={(e) => { e.stopPropagation(); setActiveTime(tab); }} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
                backgroundColor: active ? C.primaryAlpha : C.glass,
                border: `1px solid ${active ? C.primaryBorder : C.glassBorder}`,
                boxShadow: C.glassShadow,
                fontWeight: 700, fontSize: 13, letterSpacing: 0.2,
                color: active ? C.primary : C.hint,
                transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: active ? C.primary : 'rgba(180,140,160,0.35)',
                  transition: 'background-color 0.18s',
                }} />
                {tab}
              </button>
            );
          })}

          {!isMobile && <div style={{ width: 1, height: 24, backgroundColor: 'rgba(180,140,160,0.20)', margin: '0 2px' }} />}

          <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <Dropdown id="pollutant" value={selectedPollutant} options={POLLUTANTS} onSelect={setSelectedPollutant} openId={openId} setOpenId={setOpenId} />
            <Dropdown id="region"    value={selectedRegion}    options={REGIONS}    onSelect={setSelectedRegion}    openId={openId} setOpenId={setOpenId} />
            <Dropdown id="source"    value={selectedSource}    options={SOURCES}    onSelect={setSelectedSource}    openId={openId} setOpenId={setOpenId} />
          </div>

          <span style={{ marginLeft: 'auto', fontSize: 13, color: C.muted, fontWeight: 600 }}>
            共 {filtered.length} 筆資料
          </span>
        </div>

        {/* ── Cards grid ───────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.60)',
            border: '1px solid rgba(255,255,255,0.80)',
            borderRadius: 20, boxShadow: C.glassShadow,
            padding: '56px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 15,
              backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={24} color={C.primary} strokeWidth={2} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.muted }}>目前沒有符合條件的監測資料</p>
            <p style={{ fontSize: 13, color: C.hint }}>嘗試調整篩選條件以查看更多監測站</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
            paddingBottom: 60,
          }}>
            {filtered.map(station => <StationCard key={station.id} station={station} />)}
          </div>
        )}
      </div>
    </div>
  );
}
