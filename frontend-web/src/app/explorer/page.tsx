'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Activity, ChevronDown, Clock, Database,
  Droplets, MapPin, Minus, Search, Shield,
  Thermometer, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import type { MoeStationData } from '@shared/api/moe';
import type { CwaWeatherBundle } from '@shared/api/cwa';
import { AuthGuard } from '@/components/auth/AuthGuard';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:       '#D4567A',
  primaryAlpha:  'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)',
  red:           '#E94C78',
  redAlpha:      'rgba(233,76,120,0.12)',
  redBorder:     'rgba(233,76,120,0.30)',
  orange:        '#EA580C',
  orangeAlpha:   'rgba(234,88,12,0.12)',
  orangeBorder:  'rgba(234,88,12,0.30)',
  yellow:        '#CA8A04',
  yellowAlpha:   'rgba(202,138,4,0.14)',
  yellowBorder:  'rgba(202,138,4,0.30)',
  amber:         '#D97706',
  amberAlpha:    'rgba(217,119,6,0.12)',
  amberBorder:   'rgba(217,119,6,0.28)',
  green:         '#059669',
  greenAlpha:    'rgba(5,150,105,0.12)',
  greenBorder:   'rgba(5,150,105,0.28)',
  blue:          '#2563EB',
  blueAlpha:     'rgba(37,99,235,0.12)',
  blueBorder:    'rgba(37,99,235,0.30)',
  purple:        '#7C3AED',
  purpleAlpha:   'rgba(124,58,237,0.12)',
  purpleBorder:  'rgba(124,58,237,0.30)',
  maroon:        '#9F1239',
  maroonAlpha:   'rgba(159,18,57,0.12)',
  maroonBorder:  'rgba(159,18,57,0.30)',
  glass:         'rgba(255,255,255,0.60)',
  glassBorder:   'rgba(255,255,255,0.80)',
  glassShadow:   '0 4px 16px rgba(180,140,160,0.10)',
  text:          '#1a1220',
  muted:         '#7a6880',
  hint:          '#b0a0b8',
};

/* ─── Gauge helpers ──────────────────────────────────────────── */
const GAUGE_PARAMS: Record<string, { max: number; marker: number }> = {
  'PM2.5': { max: 150, marker: 12.4 },
  'PM10':  { max: 250, marker: 30   },
  'O3':    { max: 200, marker: 54   },
  'NO2':   { max: 200, marker: 21   },
  'SO2':   { max: 100, marker: 8    },
  'CO':    { max: 15,  marker: 4.4  },
  '氣溫':  { max: 45,  marker: 36   },
  '風速':  { max: 20,  marker: 7.9  },
  '1小時雨量': { max: 80, marker: 10 },
};

function parameterColor(parameter: string, value: number): string {
  const aqiItems = aqiRangeItems(parameter);
  if (aqiItems.length > 0) {
    return (aqiItems.find(item => value <= item.upper) ?? aqiItems[aqiItems.length - 1]).color;
  }

  const weatherStatus = parameterWeatherStatus(parameter, value);
  if (weatherStatus) return weatherStatus.color;

  if (parameter === 'PM2.5') return value <= 15.4 ? C.primary : value <= 35.4 ? C.amber : C.red;
  if (parameter === 'PM10')  return value <= 50   ? C.primary : value <= 100  ? C.amber : C.red;
  if (parameter === 'O3')    return value <= 54   ? C.primary : value <= 70   ? C.amber : C.red;
  if (parameter === 'NO2')   return value <= 53   ? C.primary : value <= 100  ? C.amber : C.red;
  if (parameter === 'SO2')   return value <= 35   ? C.primary : value <= 75   ? C.amber : C.red;
  if (parameter === 'CO')    return value <= 4.4  ? C.primary : value <= 9.4  ? C.amber : C.red;
  return C.primary;
}

type ParameterStatus = {
  label: string;
  color: string;
  alpha: string;
  border: string;
};

type DetailRangeItem = ParameterStatus & {
  range: string;
  upper: number;
};

// AQI 背板顏色設定：這裡控制「分級說明」每一列的文字、邊框、淡底色。
// 如果之後想微調成更接近設計稿，只改 C 裡的色碼或這個順序即可。
// 順序要和 AQI_LABELS、AQI_RANGES 的每一列一致。
const AQI_COLORS = [
  statusColors(C.green),
  statusColors(C.yellow),
  statusColors(C.orange),
  statusColors(C.red),
  statusColors(C.purple),
  statusColors(C.maroon),
];

const AQI_LABELS = [
  '良好',
  '普通',
  '對敏感族群不健康',
  '對所有族群不健康',
  '非常不健康',
  '危害',
];

// 空氣品質官方級距：
// - 畫面上採六列呈現，和背板設計一致。
// - 官方 AQI 表格中「危害」有 301-400、401-500 兩列；這裡合併成同一列，
//   讓卡片背面維持簡潔，範圍則涵蓋兩列完整數值。
// - O3、CO 使用 ppm；PM2.5、PM10 使用 μg/m³；SO2、NO2 使用 ppb。
const AQI_RANGES: Record<string, Array<{ upper: number; display: string }>> = {
  O3: [
    { upper: 54, display: '0.000-0.054 ppm' },
    { upper: 70, display: '0.055-0.070 ppm' },
    { upper: 85, display: '0.071-0.085 ppm' },
    { upper: 105, display: '0.086-0.105 ppm' },
    { upper: 200, display: '0.106-0.200 ppm' },
    { upper: 604, display: '0.405-0.604 ppm（小時值）' },
  ],
  'PM2.5': [
    { upper: 12.4, display: '0.0-12.4 μg/m³' },
    { upper: 30.4, display: '12.5-30.4 μg/m³' },
    { upper: 50.4, display: '30.5-50.4 μg/m³' },
    { upper: 125.4, display: '50.5-125.4 μg/m³' },
    { upper: 225.4, display: '125.5-225.4 μg/m³' },
    { upper: 500.4, display: '225.5-500.4 μg/m³' },
  ],
  PM10: [
    { upper: 30, display: '0-30 μg/m³' },
    { upper: 75, display: '31-75 μg/m³' },
    { upper: 190, display: '76-190 μg/m³' },
    { upper: 354, display: '191-354 μg/m³' },
    { upper: 424, display: '355-424 μg/m³' },
    { upper: 604, display: '425-604 μg/m³' },
  ],
  CO: [
    { upper: 4.4, display: '0-4.4 ppm' },
    { upper: 9.4, display: '4.5-9.4 ppm' },
    { upper: 12.4, display: '9.5-12.4 ppm' },
    { upper: 15.4, display: '12.5-15.4 ppm' },
    { upper: 30.4, display: '15.5-30.4 ppm' },
    { upper: 50.4, display: '30.5-50.4 ppm' },
  ],
  SO2: [
    { upper: 8, display: '0-8 ppb' },
    { upper: 65, display: '9-65 ppb' },
    { upper: 160, display: '66-160 ppb' },
    { upper: 304, display: '161-304 ppb' },
    { upper: 604, display: '305-604 ppb' },
    { upper: 1004, display: '605-1004 ppb' },
  ],
  NO2: [
    { upper: 21, display: '0-21 ppb' },
    { upper: 100, display: '22-100 ppb' },
    { upper: 360, display: '101-360 ppb' },
    { upper: 649, display: '361-649 ppb' },
    { upper: 1249, display: '650-1249 ppb' },
    { upper: 2049, display: '1250-2049 ppb' },
  ],
};

function aqiRangeItems(parameter: string): DetailRangeItem[] {
  const ranges = AQI_RANGES[parameter];
  if (!ranges) return [];

  return ranges.map((range, index) => ({
    label: AQI_LABELS[index],
    range: range.display,
    upper: range.upper,
    ...AQI_COLORS[index],
  }));
}

function statusColors(color: string): Pick<ParameterStatus, 'color' | 'alpha' | 'border'> {
  if (color === C.green) return { color: C.green, alpha: C.greenAlpha, border: C.greenBorder };
  if (color === C.amber) return { color: C.amber, alpha: C.amberAlpha, border: C.amberBorder };
  if (color === C.red) return { color: C.red, alpha: C.redAlpha, border: C.redBorder };
  if (color === C.orange) return { color: C.orange, alpha: C.orangeAlpha, border: C.orangeBorder };
  if (color === C.yellow) return { color: C.yellow, alpha: C.yellowAlpha, border: C.yellowBorder };
  if (color === C.purple) return { color: C.purple, alpha: C.purpleAlpha, border: C.purpleBorder };
  if (color === C.maroon) return { color: C.maroon, alpha: C.maroonAlpha, border: C.maroonBorder };
  return { color: C.primary, alpha: C.primaryAlpha, border: C.primaryBorder };
}

function detailItem(label: string, range: string, color: string, upper = Number.POSITIVE_INFINITY): DetailRangeItem {
  return {
    label,
    range,
    upper,
    ...statusColors(color),
  };
}

function parameterWeatherStatus(parameter: string, value: number): ParameterStatus | null {
  const ranges = detailRangeItems(parameter, '');
  if (!['氣溫', '風速', '1小時雨量'].includes(parameter) || ranges.length === 0) return null;

  const active = ranges.find(item => value <= item.upper) ?? ranges[ranges.length - 1];
  return {
    label: active.label,
    color: active.color,
    alpha: active.alpha,
    border: active.border,
  };
}

function parameterStatus(parameter: string, value: number): ParameterStatus {
  const aqiItems = aqiRangeItems(parameter);
  if (aqiItems.length > 0) {
    const active = aqiItems.find(item => value <= item.upper) ?? aqiItems[aqiItems.length - 1];
    return {
      label: active.label,
      color: active.color,
      alpha: active.alpha,
      border: active.border,
    };
  }

  const weatherStatus = parameterWeatherStatus(parameter, value);
  if (weatherStatus) return weatherStatus;

  const color = parameterColor(parameter, value);
  const colors = statusColors(color);
  if (color === C.red) return { label: '異常', ...colors };
  if (color === C.amber) return { label: '注意', ...colors };
  return { label: '正常', ...colors };
}

function detailRangeItems(parameter: string, unit: string): DetailRangeItem[] {
  const aqiItems = aqiRangeItems(parameter);
  if (aqiItems.length > 0) return aqiItems;

  switch (parameter) {
   case '氣溫':
    return [
      detailItem('非常寒冷', `6 ${unit} 以下`, C.orange, 6),
      detailItem('寒冷', `6–10 ${unit}`, C.yellow, 10),
      detailItem('一般', `10–36 ${unit}`, C.green, 36),
      detailItem('高溫黃燈', `36–38 ${unit}`, C.yellow, 38),
      detailItem('高溫橙燈', `38 ${unit} 以上`, C.orange),
    ];
    case '1小時雨量':
    return [
      detailItem('無雨', `0 ${unit}`, C.green, 0),
      detailItem('有雨', `0-10 ${unit}`, C.yellow, 10),
      detailItem('大雨', `10-40 ${unit}`, C.orange, 40),
      detailItem('豪雨', `40 ${unit} 以上`, C.maroon),
    ];
    case '風速':
      return [
        detailItem('0級', `0.0-0.2 ${unit}`, C.green, 0.2),
        detailItem('1級', `0.2-1.5 ${unit}`, C.green, 1.5),
        detailItem('2級', `1.5-3.3 ${unit}`, C.green, 3.3),
        detailItem('3級', `3.3-5.4 ${unit}`, C.green, 5.4),
        detailItem('4級', `5.4-7.9 ${unit}`, C.green, 7.9),
        detailItem('5級', `7.9-10.7 ${unit}`, C.green, 10.7),
        detailItem('6級', `10.7-13.8 ${unit}`, C.yellow, 13.8),
        detailItem('7級', `13.8-17.1 ${unit}`, C.yellow, 17.1),
        detailItem('8級', `17.1-20.7 ${unit}`, C.yellow, 20.7),
        detailItem('9級', `20.7-24.4 ${unit}`, C.yellow, 24.4),
        detailItem('10級', `24.4-28.4 ${unit}`, C.red, 28.4),
        detailItem('11級', `28.4-32.6 ${unit}`, C.red, 32.6),
        detailItem('12級', `32.6 ${unit} 以上`, C.maroon),
      ];
    default:
      return [];
  }
}

// 風速背面補充說明：點選各級風時，在同一張卡片內顯示簡短描述。
const WIND_LEVEL_INFO: Record<string, string> = {
  '0級': '無風。',
  '1級': '煙會動，人較無感。',
  '2級': '感覺有微風，樹葉飄起，旗幟揚起。',
  '3級': '感覺有微風，樹葉飄起，旗幟揚起。',
  '4級': '明顯有風，枝葉擺動，水面有波紋。',
  '5級': '明顯有風，枝葉擺動，水面有波紋。',
  '6級': '感覺風大，戶外行動略不便，行人張傘困難。',
  '7級': '感覺風大，戶外行動略不便，行人張傘困難。',
  '8級': '風力強勁，物品易被吹倒，迎風前進困難。',
  '9級': '風力強勁，物品易被吹倒，迎風前進困難。',
  '10級': '盡量避免戶外活動，戶外大型物品易吹落傾倒、樹木枝幹斷裂。',
  '11級': '盡量避免戶外活動，戶外大型物品易吹落傾倒、樹木枝幹斷裂。',
  '12級': '極危險！易致災！勿出門！',
};

const ARC_R = 45, ARC_CX = 55, ARC_CY = 58, ARC_LEN = Math.PI * ARC_R;

function polarToXY(deg: number) {
  const rad = (Math.PI * (180 - deg)) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(rad), y: ARC_CY - ARC_R * Math.sin(rad) };
}

// Keep SVG attributes stable between server render and browser hydration.
function svgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function GaugeArc({ value, parameter, unit }: { value: number; parameter: string; unit: string }) {
  const gaugeConfig = GAUGE_PARAMS[parameter] ?? { max: 200, marker: 100 };
  const color = parameterColor(parameter, value);
  const isAqi = parameter in AQI_RANGES;

  // AQI 參數：動態顯示目前級別起往後 3 個門檻
  // 氣象參數：顯示目前所在級別的 upper（即下一級的起始門檻）
  const markers: number[] = [];
  if (isAqi) {
    const ranges = detailRangeItems(parameter, unit);
    const currentLevelIndex = ranges.findIndex(item => value <= item.upper);
    if (currentLevelIndex >= 0) {
      for (let i = currentLevelIndex; i < ranges.length && markers.length < 3; i++) {
        if (Number.isFinite(ranges[i].upper)) {
          markers.push(ranges[i].upper);
        }
      }
    }
    if (markers.length === 0) markers.push(gaugeConfig.marker);
  } else {
    const ranges = detailRangeItems(parameter, unit);
    const currentLevelIndex = ranges.findIndex(item => value <= item.upper);
    if (currentLevelIndex >= 0 && Number.isFinite(ranges[currentLevelIndex].upper)) {
      markers.push(ranges[currentLevelIndex].upper);
    } else {
      const last = [...ranges].reverse().find(item => Number.isFinite(item.upper));
      markers.push(last ? last.upper : gaugeConfig.marker);
    }
  }

  const dashOffset = ARC_LEN * (1 - Math.min(value / gaugeConfig.max, 1));

  return (
    <svg
      viewBox="-10 0 120 75"
      style={{ display: 'block', width: '100%', maxWidth: 190, margin: '0 auto', overflow: 'visible' }}
    >
      <path d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={7} strokeLinecap="round" />
      <path
        d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`}
        fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={svgNumber(ARC_LEN)} strokeDashoffset={svgNumber(dashOffset)}
      />
      {markers.map((m, idx) => {
        const markerAngle = Math.min(m / gaugeConfig.max, 1) * 180;
        const mp = polarToXY(markerAngle);
        const rad = (Math.PI * (180 - markerAngle)) / 180;
        const lx = ARC_CX + (ARC_R + 14) * Math.cos(rad);
        const ly = ARC_CY - (ARC_R + 14) * Math.sin(rad);
        return (
          <g key={`marker-${idx}`}>
            <line x1={svgNumber(mp.x)} y1={svgNumber(mp.y)} x2={svgNumber(lx)} y2={svgNumber(ly)} stroke="rgba(0,0,0,0.22)" strokeWidth={1.5} strokeLinecap="round" />
            <text x={svgNumber(lx)} y={svgNumber(ly - 3)} fontSize={9} fill="#bbb" textAnchor="middle">{m}</text>
          </g>
        );
      })}
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
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : id); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
          maxWidth: '100%',
          backgroundColor: isActive ? C.primaryAlpha : C.glass,
          border: `1px solid ${isActive ? C.primaryBorder : C.glassBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: isActive ? 700 : 500,
          color: isActive ? C.primary : C.muted,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderOption ? renderOption(value) : value}
        </span>
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

/* ─── Data model ─────────────────────────────────────────────── */
interface StationData {
  id: number | string;
  district: string;
  station: string;
  time: string;
  passed: boolean;
  parameter: string;
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
  { id: 9001, district: '蘆竹工業區', station: 'Micro-Sensor A04', time: '13:45', passed: false, parameter: 'PM2.5', value: 48, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '蘆竹區', trend: '上升中', aqi: 128, temperature: 28, humidity: 72 },
  { id: 9002, district: '桃園市區', station: 'Micro-Sensor B12', time: '11:15', passed: false, parameter: 'PM2.5', value: 35, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '桃園區', trend: '上升中', aqi: 112, temperature: 29, humidity: 62 },
  { id: 9003, district: '觀音工業區', station: 'Micro-Sensor B07', time: '昨日 23:30', passed: false, parameter: 'PM2.5', value: 52, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '觀音區', trend: '上升中', aqi: 140, temperature: 23, humidity: 80 },
  { id: 9004, district: '中壢工業區', station: 'Micro-Sensor D05', time: '昨日 18:45', passed: true, parameter: 'PM2.5', value: 28, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 76, temperature: 27, humidity: 66 },
  { id: 9005, district: '中壢市中心', station: 'Micro-Sensor G02', time: '6天前 09:45', passed: true, parameter: 'PM2.5', value: 12, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 48, temperature: 24, humidity: 72 },
  { id: 9006, district: '大園住宅區', station: 'Micro-Sensor H09', time: '5天前 12:10', passed: true, parameter: 'PM2.5', value: 18, unit: 'μg/m³', source: '微感測器', version: '模擬資料', region: '大園區', trend: '下降中', aqi: 62, temperature: 26, humidity: 69 },
];

// Temporary stand-in until NAQO schema/import/API are implemented.
const NAQO_MOCK_DATA: StationData[] = [
  { id: 'naqo-1', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'PM2.5', value: 16, unit: 'μg/m³', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 58, temperature: 27, humidity: 70 },
  { id: 'naqo-2', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'O3', value: 42, unit: 'ppb', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '下降中', aqi: 52, temperature: 27, humidity: 70 },
  { id: 'naqo-3', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'CO', value: 0.4, unit: 'ppm', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 20, temperature: 27, humidity: 70 },
  { id: 'naqo-4', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'PM10', value: 6, unit: 'μg/m³', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 20, temperature: 27, humidity: 70 },
  { id: 'naqo-5', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'NO2', value: 20, unit: 'ppb', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 20, temperature: 27, humidity: 70 },
  { id: 'naqo-6', district: '中大空品站', station: 'NAQO 中大空品站', time: '目前觀測', passed: true, parameter: 'SO2', value: 10, unit: 'ppb', source: '中大空品站', version: '模擬資料', region: '中壢區', trend: '穩定中', aqi: 20, temperature: 27, humidity: 70 },
];

const TIME_TABS = ['近24小時', '近3天', '近7天'] as const;

/* ─── Filter settings ───────────────────────────────────────── */
const DEFAULT_PARAMETER = '全部量測參數';
const DEFAULT_SOURCE = '全部來源';
const DEFAULT_REGION = '所有區域';

const PARAMETER_OPTIONS = ['全部量測參數', 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO', '氣溫', '風速', '1小時雨量'];

// 新增資料來源時，請同步補上該來源可查詢的量測參數。
const SOURCE_PARAMETER_OPTIONS: Record<string, string[]> = {
  [DEFAULT_SOURCE]: PARAMETER_OPTIONS,
  環境部: [DEFAULT_PARAMETER, 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO'],
  桃園市環保局: [DEFAULT_PARAMETER, 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO'],
  氣象署: [DEFAULT_PARAMETER, '氣溫', '風速', '1小時雨量'],
  微感測器: [DEFAULT_PARAMETER, 'PM2.5'],
  中大空品站: [DEFAULT_PARAMETER, 'PM2.5', 'PM10', 'O3', 'NO2', 'SO2', 'CO'],
};

const REGIONS    = [DEFAULT_REGION, '桃園區', '中壢區', '平鎮區', '龍潭區', '大園區', '觀音區', '蘆竹區', '龜山區', '新屋區', '楊梅區','復興區', '八德區',];
const SOURCES    = [DEFAULT_SOURCE, '環境部', '桃園市環保局', '氣象署', '微感測器', '中大空品站'];
const CWA_REGION_OPTIONS = [
  DEFAULT_REGION,
  '新屋區',
  '楊梅區',
  '復興區',
  '觀音區',
  '大園區',
  '大溪區',
  '中壢區',
  '龜山區',
  '龍潭區',
  '平鎮區',
  '蘆竹區',
  '八德區',
];

// 區域下拉選單也要跟著資料來源收斂，避免環境部出現沒有測站的行政區。
const SOURCE_REGION_OPTIONS: Record<string, string[]> = {
  [DEFAULT_SOURCE]: REGIONS,
  環境部: [DEFAULT_REGION, '桃園區', '中壢區', '平鎮區', '龍潭區', '大園區', '觀音區'],
  桃園市環保局: [DEFAULT_REGION, '蘆竹區', '中壢區', '龜山區', '觀音區'],
  // 氣象署依 cwa_stations_schema.sql 的 address 欄位取出有測站的行政區。
  氣象署: CWA_REGION_OPTIONS,
  微感測器: [DEFAULT_REGION, '桃園區', '中壢區', '大園區', '觀音區', '蘆竹區'],
  中大空品站: [DEFAULT_REGION, '中壢區'],
};

const MOE_REGION_MAP: Record<string, string> = {
  桃園: '桃園區',
  中壢: '中壢區',
  平鎮: '平鎮區',
  龍潭: '龍潭區',
  大園: '大園區',
  觀音: '觀音區',
};

const MOE_PARAMETERS: Array<{
  id: string;
  unit: string;
  value: (station: MoeStationData) => number;
}> = [
  { id: 'PM2.5', unit: 'μg/m³', value: station => station.pm25 },
  { id: 'PM10', unit: 'μg/m³', value: station => station.pm10 },
  { id: 'O3', unit: 'ppb', value: station => station.o3 },
  { id: 'NO2', unit: 'ppb', value: station => station.no2 },
  { id: 'SO2', unit: 'ppb', value: station => station.so2 },
  { id: 'CO', unit: 'ppm', value: station => station.co },
];

const CWA_PARAMETERS: Array<{
  id: string;
  unit: string;
  value: (weather: ExplorerCwaWeatherBundle) => number;
  passed: (value: number) => boolean;
}> = [
  { id: '氣溫', unit: '°C', value: weather => Number(weather.current.temperature), passed: value => value <= 38 },
  { id: '風速', unit: 'm/s', value: weather => Number(weather.current.windSpeed), passed: value => value <= 15 },
  { id: '1小時雨量', unit: 'mm', value: weather => Number(weather.past1hrRain), passed: value => value <= 40 },
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
    MOE_PARAMETERS.map((parameter, parameterIndex) => ({
      id: 1000 + stationIndex * 100 + parameterIndex,
      district: `${station.sitename}測站`,
      station: `環境部 ${station.sitename}`,
      time: formatObservationTime(station.datacreationdate),
      passed: station.aqi <= 100,
      parameter: parameter.id,
      value: parameter.value(station),
      unit: parameter.unit,
      source: '環境部',
      version: '即時 API',
      region: MOE_REGION_MAP[station.sitename] ?? `${station.sitename}區`,
      trend: '穩定中' as const,
      aqi: station.aqi,
    }))
  );
}

function buildCwaCards(weather: ExplorerCwaWeatherBundle, region: string): StationData[] {
  const temperature = Number(weather.current.temperature);
  const humidity = Number(weather.current.humidity);
  const stationLabel = `${weather.current.stationName ?? region}${weather.current.stationType ?? ''}`;

  return CWA_PARAMETERS.map(parameter => {
    const value = parameter.value(weather);

    return {
      id: `cwa-${region}-${parameter.id}`,
      district: region,
      station: `氣象署 · ${weather.current.stationName ?? weather.current.weather}`,
      time: '目前觀測',
      passed: Number.isFinite(value) ? parameter.passed(value) : false,
      parameter: parameter.id,
      value: Number.isFinite(value) ? value : 0,
      unit: parameter.unit,
      source: '氣象署',
      version: weather.isFallback ? '模擬資料' : `即時 API · ${stationLabel}`,
      region,
      trend: '穩定中',
      aqi: 0,
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      humidity: Number.isFinite(humidity) ? humidity : undefined,
    };
  });
}

function getParameterDisplay(parameter: string): React.ReactNode {
  switch (parameter) {
    case 'PM2.5': return <>PM<sub className="text-xs">2.5</sub></>;
    case 'O3': return <>O<sub className="text-xs">3</sub></>;
    case 'NO2': return <>NO<sub className="text-xs">2</sub></>;
    case 'SO2': return <>SO<sub className="text-xs">2</sub></>;
    default: return parameter;
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
  const [showDetails, setShowDetails] = useState(false);
  const [selectedWindLabel, setSelectedWindLabel] = useState<string | null>(null);
  const pColor  = parameterColor(station.parameter, station.value);
  const status = parameterStatus(station.parameter, station.value);
  const detailItems = detailRangeItems(station.parameter, station.unit);
  const isWindDetail = station.parameter === '風速';
  const isWeather = station.source === '氣象署';
  const sColor  = status.color;
  const sAlpha  = status.alpha;
  const sBorder = status.border;
  const activeWindItem = isWindDetail
    ? detailItems.find(item => item.label === selectedWindLabel)
      ?? detailItems.find(item => item.label === status.label)
      ?? detailItems[0]
    : null;

  const TrendIcon  = station.trend === '上升中' ? TrendingUp : station.trend === '下降中' ? TrendingDown : Minus;
  const tColor  = station.trend === '上升中' ? C.red   : station.trend === '下降中' ? C.green : C.hint;
  const tAlpha  = station.trend === '上升中' ? C.redAlpha   : station.trend === '下降中' ? C.greenAlpha : 'rgba(180,160,200,0.10)';
  const tBorder = station.trend === '上升中' ? C.redBorder  : station.trend === '下降中' ? C.greenBorder : 'rgba(180,160,200,0.20)';

  return (
    <div style={{
      position: 'relative',
      backgroundColor: 'rgba(255,255,255,0.94)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 20,
      boxShadow: '0 4px 16px rgba(180,140,160,0.10)',
      height: 440,
      overflow: 'hidden',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {showDetails ? (
        <div style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(255,255,255,0.98)',
          height: 440,
          boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 18, fontWeight: 950, color: C.text, lineHeight: 1.1 }}>
                {station.parameter}｜分級說明
              </p>
              <p style={{ fontSize: 11, color: C.muted, fontWeight: 800, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {station.station}
              </p>
            </div>
            <span style={{
              flexShrink: 0,
              padding: '5px 11px',
              borderRadius: 99,
              backgroundColor: status.alpha,
              border: `1px solid ${status.border}`,
              color: status.color,
              fontSize: 12,
              fontWeight: 900,
            }}>
              {status.label}
            </span>
          </div>

          <div style={{
            padding: '8px 11px',
            borderRadius: 15,
            backgroundColor: status.alpha,
            border: `1px solid ${status.border}`,
            marginBottom: 8,
          }}>
            <p style={{ fontSize: 11, color: C.muted, fontWeight: 850, marginBottom: 2 }}>目前值</p>
            <p style={{ fontSize: 26, lineHeight: 1, color: pColor, fontWeight: 950 }}>
              {station.value}
              <span style={{ fontSize: 13, color: C.muted, marginLeft: 6 }}>{station.unit}</span>
            </p>
          </div>

          {isWindDetail ? (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 4,
                marginBottom: 6,
              }}>
                {detailItems.map(item => {
                  const isActive = item.label === (activeWindItem?.label ?? status.label);
                  return (
                    <button
                      type="button"
                      key={`${station.id}-${item.label}`}
                      onClick={() => setSelectedWindLabel(item.label)}
                      style={{
                        minWidth: 0,
                        minHeight: 26,
                        padding: '4px 5px',
                        borderRadius: 10,
                        backgroundColor: isActive ? item.alpha : 'rgba(255,255,255,0.62)',
                        border: `1px solid ${isActive ? item.border : 'rgba(0,0,0,0.06)'}`,
                        color: isActive ? item.color : C.muted,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 900,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        lineHeight: 1.05,
                      }}
                    >
                      <span>{item.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{item.range}</span>
                    </button>
                  );
                })}
              </div>
              {activeWindItem && (
                <div style={{
                  padding: '7px 9px',
                  borderRadius: 12,
                  backgroundColor: activeWindItem.alpha,
                  border: `1px solid ${activeWindItem.border}`,
                  color: C.text,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  marginBottom: 5,
                }}>
                  <span style={{ color: activeWindItem.color, fontWeight: 950 }}>
                    {activeWindItem.label}：
                  </span>
                  {WIND_LEVEL_INFO[activeWindItem.label] ?? '此風級說明待補。'}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gap: 5, marginBottom: 6 }}>
              {detailItems.map(item => {
                const isActive = item.label === status.label;
                return (
                  <div
                    key={`${station.id}-${item.label}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: 28,
                      padding: '5px 10px',
                      borderRadius: 12,
                      backgroundColor: isActive ? item.alpha : 'rgba(255,255,255,0.58)',
                      border: `1px solid ${isActive ? item.border : 'rgba(0,0,0,0.05)'}`,
                      fontSize: 12,
                      fontWeight: 850,
                      lineHeight: 1.15,
                    }}
                  >
                    <span style={{ color: item.color }}>{item.label}</span>
                    <span style={{ color: C.muted, textAlign: 'right', minWidth: 0 }}>{item.range}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 8, display: 'grid', gap: 7 }}>
            <p style={{ fontSize: 11, color: C.hint, fontWeight: 800, textAlign: 'center', lineHeight: 1.4 }}>
              資料來源：{station.source}・{station.version}{!isWeather && `・${station.time}`}
            </p>
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              style={{
                width: '100%',
                padding: '6px 0',
                borderRadius: 12,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: 15,
                fontWeight: 900,
                color: C.primary,
              }}
            >
              返回卡片
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* Header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }}>
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
            {status.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Clock size={11} color={C.hint} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.hint, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{station.time}</span>
          <span style={{ fontSize: 11, color: C.hint, flexShrink: 0 }}>·</span>
          <span style={{
            fontSize: 11, color: C.primary, fontWeight: 700,
            padding: '2px 8px', borderRadius: 99, backgroundColor: C.primaryAlpha,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {station.source}
          </span>
          <span style={{
            fontSize: 11, color: C.hint, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
          }}>{station.version}</span>
        </div>
      </div>

      {/* Gauge section */}
      <div style={{ padding: '16px 20px 12px', textAlign: 'center', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 13, fontWeight: 800, color: pColor,
            padding: '3px 12px', borderRadius: 99,
            backgroundColor: `${pColor}18`, border: `1px solid ${pColor}40`,
          }}>
            {getParameterDisplay(station.parameter)}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: C.muted,
            padding: '3px 10px', borderRadius: 99,
            backgroundColor: 'rgba(180,160,200,0.10)', border: '1px solid rgba(180,160,200,0.15)',
          }}>
            {isWeather ? '氣象觀測' : `AQI ${station.aqi}`}
          </span>
        </div>
        <GaugeArc value={station.value} parameter={station.parameter} unit={station.unit} />
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }}>
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
        <button
          type="button"
          onClick={() => {
            setSelectedWindLabel(null);
            setShowDetails(true);
          }}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 12, cursor: 'pointer',
            backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
            fontSize: 13, fontWeight: 700, color: C.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <MapPin size={14} strokeWidth={2} />
          查看詳細資料
        </button>
      </div>
      </>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function ExplorerPage() {
  const [searchText, setSearchText]           = useState('');
  const [activeTime, setActiveTime]           = useState<typeof TIME_TABS[number]>('近24小時');
  const [selectedParameter, setSelectedParameter] = useState(PARAMETER_OPTIONS[0]);
  const [selectedRegion, setSelectedRegion]   = useState(DEFAULT_REGION);
  const [selectedSource, setSelectedSource]   = useState(SOURCES[0]);
  const [openId, setOpenId]                   = useState<string | null>(null);
  const [isMobile, setIsMobile]               = useState(false);
  const [moeStations, setMoeStations]         = useState<MoeStationData[]>([]);
  const [cwaCards, setCwaCards]               = useState<StationData[]>([]);
  const [historyData, setHistoryData]         = useState<StationData[]>([]);
  const [moeLoading, setMoeLoading]           = useState(true);
  const [cwaLoading, setCwaLoading]           = useState(true);
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [historyLatestAt, setHistoryLatestAt] = useState<Record<string, string>>({});
  const [moeError, setMoeError]               = useState('');
  const [cwaError, setCwaError]               = useState('');
  const [historyError, setHistoryError]       = useState('');

  const parameterOptions = SOURCE_PARAMETER_OPTIONS[selectedSource] ?? PARAMETER_OPTIONS;
  const regionOptions = SOURCE_REGION_OPTIONS[selectedSource] ?? REGIONS;

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

    const loadCwaCards = async () => {
      // The CWA API route accepts one district at a time, so "all regions"
      // fan out to the visible Taoyuan districts instead of defaulting to Zhongli.
      const districts = selectedRegion === DEFAULT_REGION ? regionOptions.slice(1) : [selectedRegion];

      setCwaLoading(true);
      try {
        const results = await Promise.all(
          districts.map(async district => {
            const response = await fetch(`/api/cwa?district=${encodeURIComponent(district)}`, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return {
              district,
              payload: await response.json() as CwaApiResponse,
            };
          })
        );

        if (controller.signal.aborted) return;
        setCwaCards(
          results
            .filter(({ payload }) => !payload.isFallback)
            .flatMap(({ district, payload }) => buildCwaCards({
              ...payload.data,
              isFallback: payload.isFallback,
            }, district))
        );
        setCwaError(results.some(({ payload }) => payload.isFallback)
          ? '氣象署 API 金鑰尚未設定或部分測站無資料，目前未顯示 fallback 氣象資料。'
          : '');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCwaCards([]);
        setCwaError('氣象署資料載入失敗，請稍後再試。');
      } finally {
        if (!controller.signal.aborted) setCwaLoading(false);
      }
    };

    void loadCwaCards();

    return () => controller.abort();
  }, [selectedRegion, regionOptions]);

  useEffect(() => {
    if (activeTime === '近24小時') {
      return;
    }

    const days = activeTime === '近7天' ? 7 : 3;
    const controller = new AbortController();

    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/explorer/history?days=${days}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as ExplorerHistoryResponse;

        if (controller.signal.aborted) return;
        setHistoryData(data.data);
        setHistoryLatestAt(data.latestAt ?? {});
        setHistoryError(data.error ? '歷史資料庫查詢失敗，請確認後端與資料庫連線。' : '');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHistoryError('歷史資料庫尚未連線，請確認 FastAPI 後端與 PostgreSQL 已啟動。');
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    };

    void loadHistory();

    return () => controller.abort();
  }, [activeTime]);

  const closeDropdown = useCallback(() => setOpenId(null), []);

  const handleSourceSelect = useCallback((source: string) => {
    const nextOptions = SOURCE_PARAMETER_OPTIONS[source] ?? PARAMETER_OPTIONS;
    const nextRegionOptions = SOURCE_REGION_OPTIONS[source] ?? REGIONS;

    // 切換來源時，同步校正參數與區域；例如環境部只保留六個官方測站所在區。
    setSelectedSource(source);
    setSelectedParameter(current =>
      nextOptions.includes(current) ? current : nextOptions[0]
    );
    setSelectedRegion(current =>
      nextRegionOptions.includes(current) ? current : nextRegionOptions[0]
    );
  }, []);

  const allMonitoringData = useMemo(() => {
    const moeCards = buildMoeCards(moeStations);

    // 資料顯示規則：
    // 1. 即時 API 資料在所有時間分頁都顯示，方便使用者看到最新狀態。
    // 2. 歷史資料只在近 3 天 / 近 7 天分頁補上，避免近 24 小時重複顯示。
    const moeHistory = historyData.filter(d => d.source === '環境部');
    const cwaHistory = historyData.filter(d => d.source === '氣象署');
    const tydepSource = historyData.filter(d => d.source === '桃園市環保局');
    const historySource = activeTime === '近24小時' ? [] : [...tydepSource, ...moeHistory, ...cwaHistory];

    return [...moeCards, ...cwaCards, ...historySource, ...NAQO_MOCK_DATA, ...MICRO_SENSOR_MOCK_DATA];
  }, [activeTime, historyData, moeStations, cwaCards]);

  const filtered = useMemo(() => allMonitoringData.filter(item => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!item.district.toLowerCase().includes(q) && !item.station.toLowerCase().includes(q)) return false;
    }
    if (selectedParameter !== parameterOptions[0] && item.parameter !== selectedParameter) return false;
    if (selectedRegion    !== DEFAULT_REGION && item.region    !== selectedRegion)    return false;
    if (selectedSource    !== SOURCES[0]    && item.source    !== selectedSource)    return false;
    return true;
  }), [allMonitoringData, searchText, selectedParameter, selectedRegion, selectedSource, parameterOptions]);

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
      : selectedSource === '中大空品站'
        ? '中大空品站資料庫尚未建立，目前顯示的是介面測試用模擬資料。'
      : activeTime !== '近24小時' && historyError
        ? historyError
      : selectedSource === '環境部' && moeError
        ? moeError
        : selectedSource === '氣象署' && cwaError
          ? cwaError
          : '';

  return (
    <AuthGuard>
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-gradient)',
        paddingBottom: 60,
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}
      onClick={closeDropdown}
    >
      <div style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        padding: isMobile ? '16px 16px 0' : '28px 40px 0',
      }}>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
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
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            <Dropdown id="parameter" value={selectedParameter} options={parameterOptions} onSelect={setSelectedParameter} openId={openId} setOpenId={setOpenId} renderOption={getParameterDisplay} />
            <Dropdown id="region"    value={selectedRegion}    options={regionOptions}    onSelect={setSelectedRegion}    openId={openId} setOpenId={setOpenId} />
            <Dropdown id="source"    value={selectedSource}    options={SOURCES}    onSelect={handleSourceSelect}    openId={openId} setOpenId={setOpenId} />
          </div>

          <span style={{ marginLeft: 'auto', fontSize: 13, color: C.muted, fontWeight: 600, minWidth: 0 }}>
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
                : '嘗試調整時間、量測參數、區域或來源篩選條件'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
            gap: 20,
            // 防止某張卡片內容變長時，CSS grid 把同一列其他卡片一起拉高。
            alignItems: 'start',
            width: '100%',
            maxWidth: '100%',
            paddingBottom: 60,
          }}>
            {filtered.map(station => <StationCard key={station.id} station={station} />)}
          </div>
        )}
      </div>
    </div>
    </AuthGuard>
  );
}
