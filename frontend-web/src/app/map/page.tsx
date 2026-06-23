'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@shared/store';
import { getGrid, setScenario, getTEDSPoints } from '@shared/api/index';
import { palette } from '@shared/constants/theme';
import { DISTRICT_COORDINATES, DISTRICTS, calculateDistance, findNearestDistrict } from '@shared/constants/districts';
import { GridCell, Pollutant, TEDSPoint } from '@shared/types';

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), { ssr: false });
const TGOSMap = dynamic(() => import('@/components/map/TGOSMap'), { ssr: false });

// ── Pollutant metadata ───────────────────────────────────────────
const pollutantMeta: Record<Pollutant, {
  short: React.ReactNode; label: string; unit: string; description: string;
  range: [string, string, string, string]; arcMax: number; arcStandard: number;
}> = {
  PM25: {
    short: <>PM<sub className="text-xs">2.5</sub></>, label: '細懸浮微粒', unit: 'µg/m³',
    description: '極細小的懸浮顆粒，容易被吸入肺部深處，來源包括車輛廢氣與工業排放。',
    range: ['0', '15', '35', '54+'], arcMax: 100, arcStandard: 15.4,
  },
  O3: {
    short: <>O<sub className="text-xs">3</sub></>, label: '臭氧', unit: 'ppb',
    description: '陽光照射下產生的氣體，午後濃度較高，對眼睛和呼吸道有刺激性。',
    range: ['0', '55', '125', '165+'], arcMax: 200, arcStandard: 54,
  },
  NOX: {
    short: <>NO<sub className="text-xs">x</sub></>, label: '氮氧化物', unit: 'ppb',
    description: '主要來自交通與燃燒排放，是城市空氣污染的重要指標。',
    range: ['0', '30', '80', '150+'], arcMax: 200, arcStandard: 30,
  },
  VOCs: {
    short: 'VOCs', label: '揮發性有機物', unit: 'ppb',
    description: '來自工業、油漆、溶劑等，也是臭氧生成的重要前驅物。',
    range: ['0', '100', '250', '500+'], arcMax: 600, arcStandard: 100,
  },
};

// ── AQI color / status (standard scale) ─────────────────────────
const getAQIColor = (aqi: number) => {
  if (aqi <= 50)  return '#76c476';
  if (aqi <= 100) return '#edbb05';
  if (aqi <= 150) return '#ff9800';
  if (aqi <= 200) return '#f44336';
  return '#9c27b0';
};
const getAQIStatus = (aqi: number) => {
  if (aqi <= 50)  return '良好';
  if (aqi <= 100) return '普通';
  if (aqi <= 150) return '敏感族群注意';
  if (aqi <= 200) return '對所有人不健康';
  return '非常不健康';
};
const getAQIBadgeBg = (aqi: number) => {
  if (aqi <= 50)  return { bg: 'rgba(118,196,118,0.14)', color: '#2F6B3D' };
  if (aqi <= 100) return { bg: 'rgba(237,187,5,0.14)',   color: '#7A5A00' };
  if (aqi <= 150) return { bg: 'rgba(255,152,0,0.14)',   color: '#8B4E00' };
  if (aqi <= 200) return { bg: 'rgba(244,67,54,0.12)',   color: '#9F1239' };
  return              { bg: 'rgba(156,39,176,0.12)',   color: '#6B21A8' };
};

const getPollutantColor = (value: number, standard: number) => {
  const r = value / standard;
  if (r <= 1)   return '#76c476';
  if (r <= 2)   return '#edbb05';
  if (r <= 3.5) return '#ff9800';
  return '#f44336';
};

// ── Circle AQI Gauge (adapted from Dashboard AQIGauge) ──────────
const G = { SIZE: 118, STROKE: 8 } as const;
const G_R    = (G.SIZE - G.STROKE) / 2;        // 55
const G_CIRC = 2 * Math.PI * G_R;              // ~345.6
const G_CTR  = G.SIZE / 2;                     // 59

function CardAQIGauge({ aqi }: { aqi: number }) {
  const color  = getAQIColor(aqi);
  const pct    = Math.min(Math.max(aqi / 200, 0), 1);
  const offset = G_CIRC * (1 - pct);
  return (
    <div style={{ position: 'relative', width: G.SIZE, height: G.SIZE, display: 'grid', placeItems: 'center', margin: '0 auto' }}>
      <svg width={G.SIZE} height={G.SIZE} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id="map-aqi-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${color}99`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={G_CTR} cy={G_CTR} r={G_R} stroke={color} strokeOpacity={0.2} strokeWidth={G.STROKE} fill="none" />
        <circle
          key={`aqi-ring-${aqi}`}
          cx={G_CTR} cy={G_CTR} r={G_R}
          stroke="url(#map-aqi-grad)" strokeWidth={G.STROKE} fill="none"
          strokeDasharray={G_CIRC} strokeDashoffset={G_CIRC}
          strokeLinecap="round"
          transform={`rotate(-90, ${G_CTR}, ${G_CTR})`}
        >
          <animate attributeName="stroke-dashoffset" from={G_CIRC} to={offset} dur="1s" fill="freeze" calcMode="linear" />
        </circle>
      </svg>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', width: G.SIZE - 38, height: G.SIZE - 38, borderRadius: '50%', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(58,30,45,0.08)' }}>
        <span style={{ fontSize: 8, color: '#b0a0b8', letterSpacing: '1.5px', fontFamily: 'monospace' }}>AQI</span>
        <strong style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 900, color }}>{aqi}</strong>
        <span style={{ marginTop: 3, padding: '1px 6px', borderRadius: 999, background: `${color}22`, border: `1px solid ${color}44`, fontSize: 8, fontWeight: 800, color }}>{getAQIStatus(aqi)}</span>
      </div>
    </div>
  );
}

// ── Half-arc pollutant gauge (adapted from Dashboard GaugeArc) ───
const ARC_R   = 42;
const ARC_CX  = 52;
const ARC_CY  = 54;
const ARC_LEN = Math.PI * ARC_R;

function polarToXY(angleDeg: number) {
  const rad = (Math.PI * (180 - angleDeg)) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(rad), y: ARC_CY - ARC_R * Math.sin(rad) };
}

function CardPollutantArc({ value, max, standard, color, unit, label }: {
  value: number; max: number; standard: number; color: string; unit: string; label: string;
}) {
  const dashOffset    = ARC_LEN * (1 - Math.min(value / max, 1));
  const markerAngle   = Math.min(standard / max, 1) * 180;
  const rad           = (Math.PI * (180 - markerAngle)) / 180;
  const mp            = polarToXY(markerAngle);
  const lx            = ARC_CX + (ARC_R + 13) * Math.cos(rad);
  const ly            = ARC_CY - (ARC_R + 13) * Math.sin(rad);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: palette.textMain, lineHeight: 1.2 }}>{label}</div>
      <svg
        key={`arc-${value}-${unit}`}
        width={160} height={76}
        viewBox="-8 0 120 65"
        style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
        aria-hidden="true"
      >
        <path d={`M 10 54 A ${ARC_R} ${ARC_R} 0 0 1 94 54`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={6} strokeLinecap="round" />
        <path
          d={`M 10 54 A ${ARC_R} ${ARC_R} 0 0 1 94 54`}
          fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={ARC_LEN} strokeDashoffset={ARC_LEN}
        >
          <animate attributeName="stroke-dashoffset" from={ARC_LEN} to={dashOffset} dur="0.8s" fill="freeze" calcMode="linear" />
        </path>
        <line x1={mp.x} y1={mp.y} x2={lx} y2={ly} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} strokeLinecap="round" />
        <text x={lx} y={ly - 2} fontSize={8} fill="#aaa" textAnchor="middle">{standard}</text>
        <text x={ARC_CX} y={48} fontSize={19} fontWeight={700} fill={color} textAnchor="middle">{Math.round(value)}</text>
        <text x={ARC_CX} y={59} fontSize={8} fill="#aaa" textAnchor="middle">{unit}</text>
      </svg>
    </div>
  );
}

// ── Sensitive group icons ────────────────────────────────────────
const SENSITIVE_GROUPS = [
  {
    key: '兒童',
    label: '兒童',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="6" r="4"/>
        <path d="M8 12h8l1.5 8H6.5z"/>
      </svg>
    ),
  },
  {
    key: '老人',
    label: '老人',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10.5" cy="5" r="3"/>
        <path d="M8 9h5l-0.5 7H8.5z"/>
        <path d="M10 16v5M8 21h4"/>
        <line x1="14.5" y1="9.5" x2="18" y2="21"/>
      </svg>
    ),
  },
  {
    key: '孕婦',
    label: '孕婦',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="3.2"/>
        <path d="M9.5 9.5c-1.5 2-1.5 4.5 0 6.5s2.5 3 2.5 3 1-1 2.5-3 1.5-4.5 0-6.5"/>
        <path d="M12 19v3"/>
      </svg>
    ),
  },
  {
    key: '心肺',
    label: '心肺疾病',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        <polyline points="8 12 10 10 12 14 14 11 16 12"/>
      </svg>
    ),
  },
  {
    key: '氣喘',
    label: '氣喘患者',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v5"/>
        <path d="M8.5 9C5 10 4 13 4 15s2 4.5 5 4.5h1.5V9"/>
        <path d="M15.5 9C19 10 20 13 20 15s-2 4.5-5 4.5H13.5V9"/>
      </svg>
    ),
  },
] as const;

// ── Helpers ──────────────────────────────────────────────────────
const formatTime = (iso?: string) => {
  if (!iso) return '尚無資料';
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
};

type GridWithDistrict = GridCell & { district?: string; village?: string };
type SearchResult = {
  key: string;
  label: string;
  detail: string;
  grid: GridWithDistrict;
};

type VillageCenter = {
  district: string;
  village: string;
  latitude: number;
  longitude: number;
};

const TAOYUAN_VILLAGE_CENTERS: VillageCenter[] = [
  { district: '桃園區', village: '中正里', latitude: 24.9937, longitude: 121.3010 },
  { district: '桃園區', village: '武陵里', latitude: 24.9896, longitude: 121.3136 },
  { district: '桃園區', village: '龍鳳里', latitude: 24.9807, longitude: 121.2817 },
  { district: '桃園區', village: '中路里', latitude: 24.9975, longitude: 121.2900 },
  { district: '桃園區', village: '大林里', latitude: 24.9848, longitude: 121.3227 },
  { district: '桃園區', village: '會稽里', latitude: 25.0060, longitude: 121.3195 },
  { district: '中壢區', village: '石頭里', latitude: 24.9539, longitude: 121.2248 },
  { district: '中壢區', village: '中原里', latitude: 24.9575, longitude: 121.2418 },
  { district: '中壢區', village: '內壢里', latitude: 24.9726, longitude: 121.2589 },
  { district: '中壢區', village: '青埔里', latitude: 25.0137, longitude: 121.2140 },
  { district: '中壢區', village: '龍岡里', latitude: 24.9342, longitude: 121.2323 },
  { district: '中壢區', village: '過嶺里', latitude: 24.9636, longitude: 121.1754 },
  { district: '平鎮區', village: '北勢里', latitude: 24.9450, longitude: 121.2188 },
  { district: '平鎮區', village: '東勢里', latitude: 24.9166, longitude: 121.2485 },
  { district: '平鎮區', village: '宋屋里', latitude: 24.9446, longitude: 121.2060 },
  { district: '平鎮區', village: '山峰里', latitude: 24.8974, longitude: 121.2130 },
  { district: '八德區', village: '大成里', latitude: 24.9287, longitude: 121.2833 },
  { district: '八德區', village: '大湳里', latitude: 24.9581, longitude: 121.3016 },
  { district: '八德區', village: '瑞豐里', latitude: 24.9308, longitude: 121.3001 },
  { district: '八德區', village: '興仁里', latitude: 24.9214, longitude: 121.2848 },
  { district: '龜山區', village: '龜山里', latitude: 24.9925, longitude: 121.3375 },
  { district: '龜山區', village: '大湖里', latitude: 25.0535, longitude: 121.3611 },
  { district: '龜山區', village: '文化里', latitude: 25.0567, longitude: 121.3689 },
  { district: '龜山區', village: '山頂里', latitude: 24.9878, longitude: 121.3280 },
  { district: '蘆竹區', village: '南崁里', latitude: 25.0475, longitude: 121.2926 },
  { district: '蘆竹區', village: '坑口里', latitude: 25.0843, longitude: 121.2658 },
  { district: '蘆竹區', village: '海湖里', latitude: 25.1012, longitude: 121.2562 },
  { district: '蘆竹區', village: '山腳里', latitude: 25.0916, longitude: 121.2875 },
  { district: '大園區', village: '大園里', latitude: 25.0608, longitude: 121.2006 },
  { district: '大園區', village: '埔心里', latitude: 25.0532, longitude: 121.2247 },
  { district: '大園區', village: '菓林里', latitude: 25.0797, longitude: 121.2342 },
  { district: '大園區', village: '竹圍里', latitude: 25.1041, longitude: 121.2440 },
  { district: '大園區', village: '橫峰里', latitude: 25.0186, longitude: 121.2145 },
  { district: '觀音區', village: '觀音里', latitude: 25.0354, longitude: 121.0823 },
  { district: '觀音區', village: '草漯里', latitude: 25.0435, longitude: 121.1420 },
  { district: '觀音區', village: '樹林里', latitude: 25.0545, longitude: 121.1245 },
  { district: '觀音區', village: '崙坪里', latitude: 25.0005, longitude: 121.1512 },
  { district: '觀音區', village: '新坡里', latitude: 25.0138, longitude: 121.1354 },
  { district: '新屋區', village: '新屋里', latitude: 24.9697, longitude: 121.1063 },
  { district: '新屋區', village: '永安里', latitude: 24.9869, longitude: 121.0315 },
  { district: '新屋區', village: '後庄里', latitude: 24.9509, longitude: 121.0306 },
  { district: '新屋區', village: '埔頂里', latitude: 24.9588, longitude: 121.0875 },
  { district: '楊梅區', village: '楊梅里', latitude: 24.9175, longitude: 121.1460 },
  { district: '楊梅區', village: '埔心里', latitude: 24.9127, longitude: 121.1838 },
  { district: '楊梅區', village: '富岡里', latitude: 24.9348, longitude: 121.0832 },
  { district: '楊梅區', village: '上湖里', latitude: 24.8970, longitude: 121.1152 },
  { district: '龍潭區', village: '龍潭里', latitude: 24.8635, longitude: 121.2168 },
  { district: '龍潭區', village: '中正里', latitude: 24.8675, longitude: 121.2125 },
  { district: '龍潭區', village: '高原里', latitude: 24.8358, longitude: 121.1964 },
  { district: '龍潭區', village: '三林里', latitude: 24.8518, longitude: 121.2322 },
  { district: '大溪區', village: '一心里', latitude: 24.8838, longitude: 121.2681 },
  { district: '大溪區', village: '仁善里', latitude: 24.9050, longitude: 121.2816 },
  { district: '大溪區', village: '南興里', latitude: 24.8860, longitude: 121.2520 },
  { district: '大溪區', village: '月眉里', latitude: 24.8972, longitude: 121.2923 },
  { district: '復興區', village: '澤仁里', latitude: 24.8202, longitude: 121.3523 },
  { district: '復興區', village: '三民里', latitude: 24.8335, longitude: 121.3165 },
  { district: '復興區', village: '羅浮里', latitude: 24.7904, longitude: 121.3730 },
  { district: '復興區', village: '華陵里', latitude: 24.6854, longitude: 121.3921 },
];

const SEARCH_PLACE_ALIASES: Array<{
  label: string;
  tokens: string[];
  latitude: number;
  longitude: number;
}> = [
  { label: '桃園市', tokens: ['桃園市', '全市'], latitude: 24.9936, longitude: 121.3010 },
  { label: '桃園機場', tokens: ['桃園機場', '機場', 'taoyuanairport', 'airport'], latitude: 25.0797, longitude: 121.2342 },
  { label: '高鐵桃園站', tokens: ['高鐵桃園', '桃園高鐵', '青埔', '高鐵站'], latitude: 25.0137, longitude: 121.2140 },
  { label: '觀音工業區', tokens: ['觀音工業區', '觀音工業', '工業區'], latitude: 25.0384, longitude: 121.1138 },
  { label: '中壢交流道', tokens: ['中壢交流道', '中壢'], latitude: 24.9681, longitude: 121.2231 },
];

const normalizeSearchText = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/台/g, '臺');

const getGridDistrict = (grid: GridCell) => (
  (grid as GridWithDistrict).district ||
  findNearestDistrict(grid.centerLatLng.latitude, grid.centerLatLng.longitude)
);

const getGridVillageLocation = (grid: GridCell) => {
  const existing = grid as GridWithDistrict;
  if (existing.district && existing.village) {
    return { district: existing.district, village: existing.village };
  }

  const nearest = TAOYUAN_VILLAGE_CENTERS.reduce<VillageCenter | null>((best, village) => {
    if (!best) return village;
    return calculateDistance(
      grid.centerLatLng.latitude,
      grid.centerLatLng.longitude,
      village.latitude,
      village.longitude,
    ) < calculateDistance(
      grid.centerLatLng.latitude,
      grid.centerLatLng.longitude,
      best.latitude,
      best.longitude,
    )
      ? village
      : best;
  }, null);

  return nearest
    ? { district: nearest.district, village: nearest.village }
    : { district: getGridDistrict(grid), village: '' };
};

const getGridLocationName = (grid: GridCell) => {
  const { district, village } = getGridVillageLocation(grid);
  return village ? `${district}${village}` : district;
};

const withDistrict = (grid: GridCell): GridWithDistrict => ({
  ...grid,
  ...getGridVillageLocation(grid),
});

const getDistanceToPoint = (grid: GridCell, latitude: number, longitude: number) => (
  calculateDistance(grid.centerLatLng.latitude, grid.centerLatLng.longitude, latitude, longitude)
);

const getNearestGridToDistrict = (grids: GridCell[], district: string) => {
  const coords = DISTRICT_COORDINATES[district];
  if (!coords) return null;
  return grids.reduce<GridCell | null>((best, grid) => {
    if (!best) return grid;
    return getDistanceToPoint(grid, coords.latitude, coords.longitude) <
      getDistanceToPoint(best, coords.latitude, coords.longitude)
      ? grid
      : best;
  }, null);
};

const getNearestGridToPoint = (grids: GridCell[], latitude: number, longitude: number) => (
  grids.reduce<GridCell | null>((best, grid) => {
    if (!best) return grid;
    return getDistanceToPoint(grid, latitude, longitude) < getDistanceToPoint(best, latitude, longitude)
      ? grid
      : best;
  }, null)
);

const IconTemp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </svg>
);
const IconHumidity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
);
const IconWind = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
  </svg>
);
const IconCompass = ({ deg }: { deg: number }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: `rotate(${deg}deg)`, display: 'block' }}>
    <circle cx="12" cy="12" r="10"/>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none" opacity="0.3"/>
    <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2.5"/>
  </svg>
);

// ── Section label (same style as Dashboard SecLabel) ─────────────
function SecLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, flexShrink: 0, background: palette.primaryDeep, boxShadow: `0 0 6px ${palette.primaryDeep}55` }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: palette.textMain }}>{title}</span>
      {sub && <small style={{ fontSize: 11, color: '#aaa', fontWeight: 600 }}>{sub}</small>}
    </div>
  );
}

// ── Map page ─────────────────────────────────────────────────────
export default function MapPage() {
  const store = useStore();
  const { selectedPollutant, setSelectedPollutant, mode, setMode, setGridCells, setSelectedGridId, selectedScenario, isLoading, setIsLoading } = store;
  const gridCells: GridCell[] = store.gridCells;
  const [mapMode, setMapMode] = useState<'2D' | 'Satellite'>('2D');
  const [selectedGrid, setSelectedGrid] = useState<GridCell | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [focusedGrid, setFocusedGrid] = useState<GridCell | null>(null);
  const [tedsPoints, setTedsPoints] = useState<TEDSPoint[]>([]);
  const Z = 1100;

  useEffect(() => {
    setIsLoading(true);
    setScenario(selectedScenario);
    getGrid({ pollutant: selectedPollutant })
      .then(setGridCells)
      .catch(console.error)
      .finally(() => setIsLoading(false));

    getTEDSPoints().then(setTedsPoints).catch(console.error);
  }, [selectedPollutant, selectedScenario, setGridCells, setIsLoading]);

  const handleGridPress = (grid: GridCell) => {
    setSelectedGrid(withDistrict(grid));
    setSelectedGridId(grid.gridId);
    setShowSheet(true);
  };

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = normalizeSearchText(search);
    if (!query || gridCells.length === 0) return [];

    const results: SearchResult[] = [];
    const usedGridIds = new Set<string>();
    const matchedDistricts = DISTRICTS.filter((district) => {
      const normalizedDistrict = normalizeSearchText(district);
      const normalizedShort = normalizeSearchText(district.replace(/區$/, ''));
      return normalizedDistrict.includes(query) || normalizedShort.includes(query);
    });

    matchedDistricts.forEach((district) => {
      const grid = getNearestGridToDistrict(gridCells, district);
      if (!grid) return;
      usedGridIds.add(grid.gridId);
      results.push({
        key: `district-${district}`,
        label: district,
        detail: `前往 ${district} 附近網格 ${grid.gridId}`,
        grid: withDistrict(grid),
      });
    });

    SEARCH_PLACE_ALIASES
      .filter((place) => place.tokens.some((token) => normalizeSearchText(token).includes(query)))
      .forEach((place) => {
        const grid = getNearestGridToPoint(gridCells, place.latitude, place.longitude);
        if (!grid || usedGridIds.has(grid.gridId)) return;
        usedGridIds.add(grid.gridId);
        results.push({
          key: `place-${place.label}`,
          label: place.label,
        detail: `前往 ${getGridLocationName(grid)} 附近網格 ${grid.gridId}`,
          grid: withDistrict(grid),
        });
      });

    gridCells
      .filter((grid) => normalizeSearchText(grid.gridId).includes(query) && !usedGridIds.has(grid.gridId))
      .slice(0, 4)
      .forEach((grid) => {
        const location = getGridLocationName(grid);
        usedGridIds.add(grid.gridId);
        results.push({
          key: `grid-${grid.gridId}`,
          label: grid.gridId,
          detail: `${location} ｜ ${Math.round(grid.values.value)} ${grid.values.unit}`,
          grid: withDistrict(grid),
        });
      });

    return results.slice(0, 6);
  }, [gridCells, search]);

  const selectSearchResult = (result: SearchResult) => {
    setSearch(result.label);
    setSearchMessage('');
    setSearchFocused(false);
    setFocusedGrid(result.grid);
    handleGridPress(result.grid);
  };

  const submitSearch = () => {
    if (searchResults.length > 0) {
      selectSearchResult(searchResults[0]);
      return;
    }
    if (search.trim()) setSearchMessage('找不到符合的行政區或網格 ID');
  };

  const selectedMeta = pollutantMeta[selectedPollutant as Pollutant];
  const gridValues   = useMemo(() => gridCells.map((g) => g.values.value), [gridCells]);
  const gridAverage  = gridValues.length ? Math.round(gridValues.reduce((s, v) => s + v, 0) / gridValues.length) : 0;
  const gridMaximum  = gridValues.length ? Math.round(Math.max(...gridValues)) : 0;

  const aqi       = selectedGrid?.health.aqi ?? 0;
  const aqiBadge  = getAQIBadgeBg(aqi);
  const pollValue = selectedGrid ? Math.round(selectedGrid.values.value) : 0;
  const pollColor = selectedGrid ? getPollutantColor(selectedGrid.values.value, selectedMeta.arcStandard) : '#76c476';

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 80px)', background: 'var(--app-bg-gradient)', overflow: 'hidden' }}>

      {/* ── Top-left controls: mode toggle + search ─────── */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: Z, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 25, padding: 4, boxShadow: '0 2px 12px rgba(58,30,45,0.12)', border: `1px solid ${palette.borderSoft}`, alignSelf: 'flex-start' }}>
          {(['NOW', 'FORECAST'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '7px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              backgroundColor: mode === m ? palette.primaryDeep : 'transparent',
              color: mode === m ? '#fff' : palette.textSecondary,
              fontSize: 13, fontWeight: 700, transition: 'all 0.18s',
            }}>
              {m === 'NOW' ? '即時監測' : '預報模式'}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative', width: 300 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 25,
            padding: '9px 16px',
            boxShadow: '0 2px 12px rgba(58,30,45,0.12)', border: `1px solid ${palette.borderSoft}`,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={palette.textSecondary} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchMessage('');
              }}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSearch();
                }
                if (e.key === 'Escape') setSearchFocused(false);
              }}
              placeholder="搜尋行政區或網格 ID…"
              style={{
                flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                fontSize: 13, color: palette.textMain, outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => {
                setSearch('');
                setSearchMessage('');
                setSearchFocused(false);
              }} style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: palette.textSecondary, fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
              }}>×</button>
            )}
          </div>

          {(searchFocused && search.trim()) && (
            <div style={{
              position: 'absolute', top: 48, left: 0, right: 0,
              background: 'rgba(255,255,255,0.98)', border: `1px solid ${palette.borderSoft}`,
              borderRadius: 14, boxShadow: '0 12px 32px rgba(58,30,45,0.16)',
              overflow: 'hidden', backdropFilter: 'blur(18px)',
            }}>
              {searchResults.length > 0 ? searchResults.map((result) => (
                <button
                  key={result.key}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSearchResult(result)}
                  style={{
                    width: '100%', border: 'none', background: 'transparent',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 3, padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                    borderBottom: `1px solid ${palette.borderSoft}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: palette.textMain }}>{result.label}</span>
                  <span style={{ fontSize: 11, color: palette.textSecondary }}>{result.detail}</span>
                </button>
              )) : (
                <div style={{ padding: '12px 14px', fontSize: 12, color: palette.textSecondary }}>
                  找不到符合的行政區或網格 ID
                </div>
              )}
            </div>
          )}

          {searchMessage && (
            <div style={{ marginTop: 6, paddingLeft: 14, fontSize: 11, fontWeight: 700, color: '#9F1239' }}>
              {searchMessage}
            </div>
          )}
        </div>
      </div>

      {/* ── Map ──────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, display: mode === 'FORECAST' ? 'none' : 'block' }}>
          <LeafletMap gridCells={[]} tedsPoints={tedsPoints} mapMode={mapMode} onGridPress={handleGridPress} focusGrid={focusedGrid} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: mode === 'FORECAST' ? 'block' : 'none' }}>
          <TGOSMap gridCells={gridCells} onGridPress={handleGridPress} focusGrid={focusedGrid} />
        </div>
      </div>

      {/* ── Legend panel (bottom-left) ────────────────────── */}
      <div style={{ position: 'absolute', left: 20, bottom: 20, zIndex: Z }}>
        <div style={{
          width: 296, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 16,
          padding: '16px 16px 14px', border: `1px solid ${palette.borderSoft}`,
          boxShadow: '0 8px 32px rgba(58,30,45,0.14)', backdropFilter: 'blur(18px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SecLabel title="污染物圖層" />
            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(231,101,149,0.10)', color: palette.primaryDeep, fontSize: 11, fontWeight: 700 }}>
              {mode === 'NOW' ? '即時' : '預報'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
            {(['PM25', 'O3', 'NOX', 'VOCs'] as Pollutant[]).map((p) => {
              const on = selectedPollutant === p;
              const m  = pollutantMeta[p];
              return (
                <button key={p} onClick={() => setSelectedPollutant(p)} className={`pollutant-btn${on ? ' selected' : ''}`}>
                  <div className="pollutant-btn-name">{m.short}</div>
                  <div className="pollutant-btn-label">{m.label}</div>
                </button>
              );
            })}
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.65, color: palette.textSecondary }}>{selectedMeta.description}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[{ label: '桃園平均', value: gridAverage }, { label: '最高網格', value: gridMaximum }].map(({ label, value }) => (
              <div key={label} style={{ borderRadius: 10, background: 'rgba(248,208,218,0.26)', padding: '9px 12px' }}>
                <p style={{ margin: 0, fontSize: 11, color: palette.textSecondary }}>{label}</p>
                <p style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, color: palette.textMain, lineHeight: 1 }}>
                  {value}<span style={{ fontSize: 10, fontWeight: 500, color: palette.textSecondary, marginLeft: 3 }}>{selectedMeta.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Color scale — matches getGridColor in LeafletMap */}
          <div style={{ marginBottom: 5 }}><SecLabel title="濃度由低→高" /></div>
          <div style={{ height: 7, borderRadius: 999, background: 'linear-gradient(to right, rgb(0,228,0), rgb(255,255,0), rgb(255,126,0), rgb(255,0,0), rgb(126,0,35))' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {selectedMeta.range.map((r) => <span key={r} style={{ fontSize: 10, color: palette.textSecondary }}>{r}</span>)}
          </div>
        </div>
      </div>

      {/* ── Layer switcher + attribution (bottom-right) ─────── */}
      <div style={{ position: 'absolute', right: 20, bottom: 20, zIndex: Z, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {/* Map layer toggle card */}
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 5,
          boxShadow: '0 4px 16px rgba(58,30,45,0.13)', border: `1px solid ${palette.borderSoft}`,
          display: 'flex', gap: 4,
        }}>
          {([
            { mode: '2D' as const,        label: '地圖',   icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            )},
            { mode: 'Satellite' as const, label: '衛星',   icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            )},
          ] as const).map(({ mode: m, label, icon }) => {
            const on = mapMode === m;
            return (
              <button key={m} onClick={() => setMapMode(m)} style={{
                width: 58, height: 50, borderRadius: 9, border: `1.5px solid ${on ? palette.primaryDeep : 'transparent'}`,
                cursor: 'pointer', background: on ? 'rgba(231,101,149,0.08)' : 'rgba(248,249,250,0.8)',
                color: on ? palette.primaryDeep : palette.textSecondary,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                transition: 'all 0.18s',
              }}>
                {icon}
                <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Attribution */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.80)', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: palette.textSecondary }}>地圖來源：</span>
          <a href={mode === 'FORECAST' ? 'https://www.tgos.tw' : 'https://www.windy.com'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: palette.primaryDeep, textDecoration: 'none', fontWeight: 600 }}>
            {mode === 'FORECAST' ? 'TGOS 國土測繪' : 'Windy.com'}
          </a>
        </div>
      </div>

      {/* ── Grid detail card (right side) ────────────────────── */}
      {showSheet && selectedGrid && (
        <aside style={{
          position: 'absolute', top: 20, right: 20, width: 356,
          maxHeight: 'calc(100vh - 120px)', zIndex: 1210,
          backgroundColor: 'rgba(255,255,255,0.98)', border: `1px solid ${palette.borderSoft}`,
          borderRadius: 16, boxShadow: '0 12px 48px rgba(58,30,45,0.18)',
          backdropFilter: 'blur(20px)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>

          {/* Card header */}
          <div style={{ padding: '15px 18px 14px', borderBottom: `1px solid ${palette.borderSoft}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: palette.textSecondary, fontWeight: 600 }}>點選網格</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 20, color: palette.textMain, fontWeight: 800 }}>
                  {getGridLocationName(selectedGrid)}
                </h2>
              </div>
              <button onClick={() => setShowSheet(false)} aria-label="關閉" style={{
                width: 30, height: 30, borderRadius: 15, border: `1px solid ${palette.borderSoft}`,
                background: '#f4f5f6', color: palette.textSecondary, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
              }}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '4px 12px', borderRadius: 999, backgroundColor: aqiBadge.bg, color: aqiBadge.color, fontSize: 12, fontWeight: 800 }}>
                {selectedGrid.health.level}
              </span>
              <span style={{ fontSize: 11, color: palette.textSecondary }}>更新 {formatTime(selectedGrid.updatedAt)}</span>
            </div>
          </div>

          <div className="card-body" style={{ padding: '16px 18px', flex: 1, overflowY: 'auto', minHeight: 0 }}>

            {/* AQI gauge + pollutant arc */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}><SecLabel title="AQI 空氣品質指標" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
                <div>
                  <CardAQIGauge key={`gauge-${aqi}`} aqi={aqi} />
                  <p style={{ margin: '6px 0 0', fontSize: 10, color: palette.textSecondary, textAlign: 'center' }}>數值 0–200，越低越好</p>
                </div>
                <div>
                  <CardPollutantArc
                    key={`arc-${pollValue}-${selectedPollutant}`}
                    value={pollValue}
                    max={selectedMeta.arcMax}
                    standard={selectedMeta.arcStandard}
                    color={pollColor}
                    unit={selectedMeta.unit}
                    label={selectedMeta.label}
                  />
                </div>
              </div>
            </div>

            {/* Health advisory + Sensitive groups */}
            <div style={{ borderRadius: 12, border: `1px solid ${palette.borderSoft}`, padding: '12px 14px', marginBottom: 14, background: 'rgba(250,251,252,0.9)' }}>
              <div style={{ marginBottom: 8 }}><SecLabel title="健康建議" /></div>
              <p style={{ margin: '0 0 10px', color: palette.textSecondary, fontSize: 12, lineHeight: 1.65 }}>{selectedGrid.health.summary}</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, background: 'rgba(248,208,218,0.35)', fontSize: 12, color: palette.textMain }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={palette.primaryDeep} strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  戶外活動：{selectedGrid.health.outdoorActivity}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, fontSize: 12, color: palette.textMain, background: selectedGrid.health.maskRequired ? 'rgba(244,67,54,0.08)' : 'rgba(118,196,118,0.12)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={selectedGrid.health.maskRequired ? '#f44336' : '#2F6B3D'} strokeWidth="2.5" strokeLinecap="round">
                    {selectedGrid.health.maskRequired
                      ? <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      : <polyline points="20 6 9 17 4 12"/>}
                  </svg>
                  {selectedGrid.health.maskRequired ? '建議配戴口罩' : '無需口罩'}
                </div>
              </div>

              {/* Sensitive group icons */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${palette.borderSoft}` }}>
                <div style={{ marginBottom: 10 }}><SecLabel title="需特別留意的族群" /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {SENSITIVE_GROUPS.map(({ key, label, icon }) => {
                    const active = selectedGrid.health.sensitiveGroups.some((g) => g.includes(key));
                    const iconColor = active ? getAQIColor(aqi) : '#c8bfcb';
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 13,
                          background: active ? `${iconColor}1a` : 'rgba(0,0,0,0.03)',
                          border: `1.5px solid ${active ? iconColor + '50' : 'rgba(0,0,0,0.06)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: iconColor,
                          boxShadow: active ? `0 2px 8px ${iconColor}30` : 'none',
                          transition: 'all 0.22s',
                        }}>
                          {icon}
                        </div>
                        <span style={{ fontSize: 10, color: iconColor, fontWeight: active ? 700 : 500, textAlign: 'center', lineHeight: 1.3 }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Weather */}
            <div style={{ marginBottom: 8 }}><SecLabel title="當地氣象" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 14 }}>
              {[
                { icon: <IconTemp />,                                            label: '溫度', value: `${selectedGrid.meteo.temp.toFixed(1)}°C` },
                { icon: <IconHumidity />,                                        label: '濕度', value: `${selectedGrid.meteo.humidity.toFixed(0)}%` },
                { icon: <IconWind />,                                            label: '風速', value: `${selectedGrid.meteo.windSpeed.toFixed(1)} m/s` },
                { icon: <IconCompass deg={selectedGrid.meteo.windDir} />,        label: '風向', value: `${selectedGrid.meteo.windDir.toFixed(0)}°` },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{ borderRadius: 10, background: 'rgba(249,250,251,0.95)', padding: '9px 6px', textAlign: 'center', border: `1px solid ${palette.borderSoft}` }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: palette.primaryDeep }}>{icon}</div>
                  <p style={{ margin: '0 0 2px', color: palette.textSecondary, fontSize: 10 }}>{label}</p>
                  <p style={{ margin: 0, color: palette.textMain, fontSize: 11, fontWeight: 700 }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* ── Loading overlay ──────────────────────────────────── */}
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.50)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, backdropFilter: 'blur(4px)' }}>
          <div style={{
            width: 270, backgroundColor: 'rgba(255,255,255,0.97)', border: `1px solid ${palette.borderSoft}`,
            borderRadius: 16, boxShadow: '0 16px 48px rgba(58,30,45,0.16)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 28,
          }}>
            <div className="map-spinner" />
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 15, color: palette.textMain, fontWeight: 800 }}>載入地圖資料</p>
              <p style={{ margin: '5px 0 0', fontSize: 12, color: palette.textSecondary }}>正在同步最新空品資訊…</p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .map-spinner {
          width: 38px; height: 38px; border-radius: 50%;
          border: 3.5px solid rgba(248,208,218,0.8);
          border-top-color: ${palette.primaryDeep};
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .card-body::-webkit-scrollbar { width: 4px; }
        .card-body::-webkit-scrollbar-track {
          background: rgba(246,200,214,0.18);
          border-radius: 999px;
          margin: 10px 0;
        }
        .card-body::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #FBA7BC, ${palette.primaryDeep});
          border-radius: 999px;
        }
        .card-body::-webkit-scrollbar-thumb:hover {
          background: ${palette.primaryDeep};
        }
        .pollutant-btn {
          min-width: 0;
          padding: 8px 6px;
          border-radius: 11px;
          text-align: center;
          cursor: pointer;
          border: 1.5px solid transparent;
          background-color: rgba(248,208,218,0.22);
          transition: all 0.18s;
        }
        .pollutant-btn.selected {
          border-color: ${palette.primaryDeep};
          background-color: rgba(231,101,149,0.09);
        }
        .pollutant-btn-name {
          font-size: 12px;
          font-weight: 800;
          color: ${palette.textMain};
          line-height: 1.2;
          white-space: nowrap;
        }
        .pollutant-btn.selected .pollutant-btn-name {
          color: ${palette.primaryDeep};
        }
        .pollutant-btn-label {
          margin-top: 2px;
          font-size: 9px;
          color: ${palette.textSecondary};
          line-height: 1.2;
          opacity: 0.85;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pollutant-btn.selected .pollutant-btn-label {
          color: ${palette.primaryDeep};
        }
      `}</style>
    </div>
  );
}
