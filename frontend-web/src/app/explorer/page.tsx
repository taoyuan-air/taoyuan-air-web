'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Activity, ChevronDown, Clock, Database,
  Droplets, MapPin, Minus, Search, Shield,
  Thermometer, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import type { MoeStationData } from '@shared/api/moe';
import type { CwaWeatherBundle } from '@shared/api/cwa';

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
  'PM10':  { max: 250, marker: 50   },
  'O3':    { max: 200, marker: 54   },
  'NOx':   { max: 200, marker: 100  },
  'NO2':   { max: 200, marker: 53   },
  'SO2':   { max: 100, marker: 35   },
  'CO':    { max: 15,  marker: 4.4  },
  'VOCs':  { max: 200, marker: 50   },
  '氣溫':  { max: 45,  marker: 35   },
};

function pollutantColor(pollutant: string, value: number): string {
  if (pollutant === 'PM2.5') return value <= 15.4 ? C.primary : value <= 35.4 ? C.amber : C.red;
  if (pollutant === 'PM10')  return value <= 50   ? C.primary : value <= 100  ? C.amber : C.red;
  if (pollutant === 'O3')    return value <= 54   ? C.primary : value <= 70   ? C.amber : C.red;
  if (pollutant === 'NOx')   return value <= 100  ? C.primary : value <= 150  ? C.amber : C.red;
  if (pollutant === 'NO2')   return value <= 53   ? C.primary : value <= 100  ? C.amber : C.red;
  if (pollutant === 'SO2')   return value <= 35   ? C.primary : value <= 75   ? C.amber : C.red;
  if (pollutant === 'CO')    return value <= 4.4  ? C.primary : value <= 9.4  ? C.amber : C.red;
  if (pollutant === 'VOCs')  return value <= 50   ? C.primary : value <= 100  ? C.amber : C.red;
  if (pollutant === '氣溫')  return value <= 35   ? C.primary : value <= 38   ? C.amber : C.red;
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
function Dropdown({ id, value, options, onSelect, openId, setOpenId, renderOption }: {
  id: string; value: string; options: string[];
  onSelect: (v: string) => void;
  openId: string | null; setOpenId: (v: string | null) => void;
  renderOption?: (opt: string) => React.ReactNode;
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
        {renderOption ? renderOption(value) : value}
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
              {renderOption ? renderOption(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Data ───────────────────────────────────────────────────── */
interface StationData {
  id: number | string;
  district: string;
  station: string;
  time: string;
  passed: boolean;
  pollutant: string;
  value: number;
  unit: string;
  source: string;
  version: string;
  region: string;
  trend: '上升中' | '下降中' | '穩定中' | '歷史資料';
  aqi: number;
  temperature?: number;
  humidity?: number;
}

interface ExplorerCwaWeatherBundle extends CwaWeatherBundle {
  isFallback?: boolean;
}

interface MoeApiResponse {
  data: MoeStationData[];
  isFallback: boolean;
}

interface CwaApiResponse {
  data: CwaWeatherBundle;
  isFallback: boolean;
}

interface ExplorerHistoryResponse {
  data: StationData[];
  count: number;
  error?: string;
  latestAt?: Record<string, string>;
}

const MICRO_SENSOR_MOCK_DATA: StationData[] = [
  { id: 9001, district: '蘆竹工業區', station: 'Micro-Sensor A04', time: '13:45', passed: false, pollutant: 'PM2.5', value: 48, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '蘆竹區', trend: '上升中', aqi: 128, temperature: 28, humidity: 72 },
  { id: 9002, district: '桃園市區', station: 'Micro-Sensor B12', time: '11:15', passed: false, pollutant: 'NOx', value: 85, unit: 'ppb', source: '微感測器', version: '模擬資料', region: '桃園區', trend: '上升中', aqi: 112, temperature: 29, humidity: 62 },
  { id: 9003, district: '觀音工業區', station: 'Micro-Sensor B07', time: '昨日 23:30', passed: false, pollutant: 'PM2.5', value: 52, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '觀音區', trend: '上升中', aqi: 140, temperature: 23, humidity: 80 },
  { id: 9004, district: '中壢工業區', station: 'Micro-Sensor D05', time: '昨日 18:45', passed: true, pollutant: 'VOCs', value: 38, unit: 'ppb', source: '微感測器', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 76, temperature: 27, humidity: 66 },
  { id: 9005, district: '中壢市中心', station: 'Micro-Sensor G02', time: '6天前 09:45', passed: true, pollutant: 'VOCs', value: 25, unit: 'ppb', source: '微感測器', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 48, temperature: 24, humidity: 72 },
  { id: 9006, district: '大園住宅區', station: 'Micro-Sensor H09', time: '5天前 12:10', passed: true, pollutant: 'PM2.5', value: 18, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '大園區', trend: '下降中', aqi: 62, temperature: 26, humidity: 69 },
];

const TIME_TABS = ['近24小時', '近3天', '近7天'] as const;
const POLLUTANTS = ['全部污染物', 'PM2.5', 'PM10', 'O3', 'NOx', 'NO2', 'SO2', 'CO', 'VOCs', '氣溫'];
const REGIONS    = ['所有區域', '桃園區', '中壢區', '平鎮區', '龍潭區', '大園區', '觀音區', '蘆竹區'];
const SOURCES    = ['全部來源', '環境部', '桃園市環保局', '氣象署', '微感測器'];

const MOE_REGION_MAP: Record<string, string> = {
  桃園: '桃園區',
  中壢: '中壢區',
  平鎮: '平鎮區',
  龍潭: '龍潭區',
  大園: '大園區',
  觀音: '觀音區',
};

const MOE_POLLUTANTS: Array<{
  id: string;
  unit: string;
  value: (station: MoeStationData) => number;
}> = [
  { id: 'PM2.5', unit: 'μg/m³', value: station => station.pm25 },
  { id: 'PM10', unit: 'μg/m³', value: station => station.pm10 },
  { id: 'O3', unit: 'ppb', value: station => station.o3 },
  { id: 'NOx', unit: 'ppb', value: station => station.nox },
  { id: 'NO2', unit: 'ppb', value: station => station.no2 },
  { id: 'SO2', unit: 'ppb', value: station => station.so2 },
  { id: 'CO', unit: 'ppm', value: station => station.co },
];

function formatObservationTime(value?: string): string {
  if (!value) return '最新資料';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function buildMoeCards(stations: MoeStationData[]): StationData[] {
  const latestByStation = Array.from(
    new Map(stations.map(station => [station.sitename, station])).values()
  ).filter(station => station.sitename in MOE_REGION_MAP);

  return latestByStation.flatMap((station, stationIndex) =>
    MOE_POLLUTANTS.map((pollutant, pollutantIndex) => ({
      id: 1000 + stationIndex * 100 + pollutantIndex,
      district: `${station.sitename}測站`,
      station: `環境部 ${station.sitename}`,
      time: formatObservationTime(station.datacreationdate),
      passed: station.aqi <= 100,
      pollutant: pollutant.id,
      value: pollutant.value(station),
      unit: pollutant.unit,
      source: '環境部',
      version: '即時 API',
      region: MOE_REGION_MAP[station.sitename] ?? `${station.sitename}區`,
      trend: '穩定中' as const,
      aqi: station.aqi,
    }))
  );
}

function buildCwaCard(weather: ExplorerCwaWeatherBundle, region: string): StationData {
  const temperature = Number(weather.current.temperature);
  const humidity = Number(weather.current.humidity);
  return {
    id: 8001,
    district: region,
    station: `氣象署 · ${weather.current.weather}`,
    time: '目前觀測',
    passed: temperature <= 38,
    pollutant: '氣溫',
    value: Number.isFinite(temperature) ? temperature : 0,
    unit: '°C',
    source: '氣象署',
    version: weather.isFallback ? '模擬資料' : '觀測 API',
    region,
    trend: '穩定中',
    aqi: 0,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    humidity: Number.isFinite(humidity) ? humidity : undefined,
  };
}

function getPollutantDisplay(p: string): React.ReactNode {
  switch (p) {
    case 'PM2.5': return <>PM<sub className="text-xs">2.5</sub></>;
    case 'O3': return <>O<sub className="text-xs">3</sub></>;
    case 'NOx': return <>NO<sub className="text-xs">x</sub></>;
    case 'NO2': return <>NO<sub className="text-xs">2</sub></>;
    case 'SO2': return <>SO<sub className="text-xs">2</sub></>;
    default: return p;
  }
}

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
  const isWeather = station.source === '氣象署';
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
            {getPollutantDisplay(station.pollutant)}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: C.muted,
            padding: '3px 10px', borderRadius: 99,
            backgroundColor: 'rgba(180,160,200,0.10)', border: '1px solid rgba(180,160,200,0.15)',
          }}>
            {isWeather ? '氣象觀測' : `AQI ${station.aqi}`}
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
            {station.temperature !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>
                <Thermometer size={12} color={C.hint} strokeWidth={2} />
                {station.temperature}°C
              </span>
            )}
            {station.humidity !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.muted, fontWeight: 600 }}>
                <Droplets size={12} color={C.hint} strokeWidth={2} />
                {station.humidity}%
              </span>
            )}
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
  const [moeStations, setMoeStations]         = useState<MoeStationData[]>([]);
  const [cwaWeather, setCwaWeather]           = useState<ExplorerCwaWeatherBundle | null>(null);
  const [historyData, setHistoryData]         = useState<StationData[]>([]);
  const [moeLoading, setMoeLoading]           = useState(true);
  const [cwaLoading, setCwaLoading]           = useState(true);
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [historyLatestAt, setHistoryLatestAt] = useState<Record<string, string>>({});
  const [moeError, setMoeError]               = useState('');
  const [cwaError, setCwaError]               = useState('');
  const [historyError, setHistoryError]       = useState('');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/moe', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<MoeApiResponse>;
      })
      .then(response => {
        setMoeStations(response.data);
        if (response.isFallback) {
          setMoeError('環境部目前沒有可顯示的資料，請確認 API 金鑰與連線狀態。');
        }
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMoeError('環境部資料載入失敗，請稍後再試。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setMoeLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const district = selectedRegion === REGIONS[0] ? '中壢區' : selectedRegion;

    fetch(`/api/cwa?district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CwaApiResponse>;
      })
      .then(response => {
        setCwaWeather({
          ...response.data,
          isFallback: response.isFallback,
        });
        setCwaError(response.isFallback ? '氣象署 API 金鑰尚未設定，目前顯示模擬天氣資料。' : '');
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCwaError('氣象署資料載入失敗，請稍後再試。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setCwaLoading(false);
      });

    return () => controller.abort();
  }, [selectedRegion]);

  useEffect(() => {
    if (activeTime === '近24小時') {
      setHistoryData([]);
      setHistoryLatestAt({});
      setHistoryError('');
      setHistoryLoading(false);
      return;
    }

    const days = activeTime === '近7天' ? 7 : 3;
    const controller = new AbortController();
    setHistoryLoading(true);

    fetch(`/api/explorer/history?days=${days}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ExplorerHistoryResponse>;
      })
      .then(response => {
        setHistoryData(response.data);
        setHistoryLatestAt(response.latestAt ?? {});
        setHistoryError(response.error ? '歷史資料庫查詢失敗，請確認後端與資料庫連線。' : '');
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHistoryError('歷史資料庫尚未連線，請確認 FastAPI 後端與 PostgreSQL 已啟動。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [activeTime]);

  const closeDropdown = useCallback(() => setOpenId(null), []);

  const allMonitoringData = useMemo(() => {
    const moeCards = buildMoeCards(moeStations);
    const weatherRegion = selectedRegion === REGIONS[0] ? '中壢區' : selectedRegion;
    const cwaCards = cwaWeather && !cwaWeather.isFallback ? [buildCwaCard(cwaWeather, weatherRegion)] : [];

    // 有即時 API 資料的來源不顯示 DB 歷史版本；API 失敗才 fallback 到歷史
    const moeSource   = moeCards.length > 0 ? moeCards : historyData.filter(d => d.source === '環境部');
    const cwaSource   = cwaCards.length > 0 ? cwaCards : historyData.filter(d => d.source === '氣象署');
    const tydepSource = historyData.filter(d => d.source === '桃園市環保局');

    return [...tydepSource, ...moeSource, ...cwaSource, ...MICRO_SENSOR_MOCK_DATA];
  }, [historyData, moeStations, cwaWeather, selectedRegion]);

  const filtered = useMemo(() => allMonitoringData.filter(item => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!item.district.toLowerCase().includes(q) && !item.station.toLowerCase().includes(q)) return false;
    }
    if (selectedPollutant !== POLLUTANTS[0] && item.pollutant !== selectedPollutant) return false;
    if (selectedRegion    !== REGIONS[0]    && item.region    !== selectedRegion)    return false;
    if (selectedSource    !== SOURCES[0]    && item.source    !== selectedSource)    return false;
    return true;
  }), [allMonitoringData, searchText, selectedPollutant, selectedRegion, selectedSource]);

  const stationSummary = useMemo(() => {
    const stations = new Map<string, StationData>();
    allMonitoringData.forEach(item => {
      const key = `${item.source}:${item.station}`;
      if (!stations.has(key)) stations.set(key, item);
    });
    return Array.from(stations.values());
  }, [allMonitoringData]);

  const passedCount = stationSummary.filter(item => item.passed).length;
  const failedCount = stationSummary.filter(item => !item.passed).length;
  const aqiStations = stationSummary.filter(item => item.source !== '氣象署');
  const avgAqi = aqiStations.length
    ? Math.round(aqiStations.reduce((sum, item) => sum + item.aqi, 0) / aqiStations.length)
    : null;

  const loadingMessage = [
    historyLoading ? '歷史資料庫' : '',
    moeLoading ? '環境部' : '',
    cwaLoading ? '氣象署' : '',
  ].filter(Boolean).join('、');

  const hasTydepHistory = historyData.some(item => item.source === '桃園市環保局');

  const dbLatestBanner = activeTime !== '近24小時' && Object.keys(historyLatestAt).length > 0
    ? '資料截至：' + Object.entries(historyLatestAt)
        .map(([src, date]) => `${src} ${date}`)
        .join('、')
    : '';

  const sourceNotice = selectedSource === '桃園市環保局' && !hasTydepHistory && activeTime !== '近24小時'
    ? '桃園市環保局資料庫目前尚未匯入觀測資料，或後端尚未連上 PostgreSQL。'
    : selectedSource === '微感測器'
      ? '微感測器資料庫尚未建立，目前顯示的是介面測試用模擬資料。'
      : historyError
        ? historyError
      : selectedSource === '環境部' && moeError
        ? moeError
        : selectedSource === '氣象署' && cwaError
          ? cwaError
          : '';

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
            <StatChip icon={Database} value={stationSummary.length} label="站"  color={C.primary} />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={Shield}   value={passedCount}     label="正常" color={C.green}   />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={Activity} value={failedCount}     label="異常" color={failedCount > 0 ? C.red : C.green} />
            <span style={{ color: C.hint, fontSize: 15 }}>·</span>
            <StatChip icon={MapPin}   value={avgAqi === null ? 'AQI --' : `AQI ${avgAqi}`} color={C.amber} />
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
            <Dropdown id="pollutant" value={selectedPollutant} options={POLLUTANTS} onSelect={setSelectedPollutant} openId={openId} setOpenId={setOpenId} renderOption={getPollutantDisplay} />
            <Dropdown id="region"    value={selectedRegion}    options={REGIONS}    onSelect={setSelectedRegion}    openId={openId} setOpenId={setOpenId} />
            <Dropdown id="source"    value={selectedSource}    options={SOURCES}    onSelect={setSelectedSource}    openId={openId} setOpenId={setOpenId} />
          </div>

          <span style={{ marginLeft: 'auto', fontSize: 13, color: C.muted, fontWeight: 600 }}>
            共 {filtered.length} 筆資料
          </span>
        </div>

        {(loadingMessage || sourceNotice) && (
          <div style={{
            marginBottom: 8,
            padding: '11px 15px',
            borderRadius: 12,
            backgroundColor: sourceNotice ? C.amberAlpha : C.primaryAlpha,
            border: `1px solid ${sourceNotice ? C.amberBorder : C.primaryBorder}`,
            color: sourceNotice ? C.amber : C.primary,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {sourceNotice || `正在載入${loadingMessage}資料…`}
          </div>
        )}
        {dbLatestBanner && (
          <div style={{
            marginBottom: 18,
            padding: '9px 15px',
            borderRadius: 12,
            backgroundColor: 'rgba(180,160,200,0.08)',
            border: '1px solid rgba(180,160,200,0.20)',
            color: C.muted,
            fontSize: 12,
            fontWeight: 500,
          }}>
            {dbLatestBanner}
          </div>
        )}

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
            <p style={{ fontSize: 15, fontWeight: 700, color: C.muted }}>
              {selectedSource === '桃園市環保局' ? '環保局目前尚無可顯示資料' : '目前沒有符合條件的監測資料'}
            </p>
            <p style={{ fontSize: 13, color: C.hint }}>
              {selectedSource === '桃園市環保局'
                ? '完成 TYDEP 資料匯入與 API 串接後，資料會顯示在這裡'
                : '嘗試調整時間、污染物、區域或來源篩選條件'}
            </p>
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
