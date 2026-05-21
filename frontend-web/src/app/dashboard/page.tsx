'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronsRight, Frown, MapPin, Meh, Smile, TrendingDown } from 'lucide-react';
import type { MoeStationData } from '@shared/api/moe';

const fetchMoeStations = (): Promise<MoeStationData[]> =>
  fetch('/api/moe').then(r => r.json());
import {
  DISTRICT_STATIC_AQ,
  EPA_STATION_TO_DISTRICT,
  findNearestDistrict,
} from '@shared/constants/districts';
import TaoyuanSVGMap from '@/components/map/TaoyuanSVGMap';

const C = {
  rose: '#D4567A',
  roseLt: 'rgba(212,86,122,0.12)',
  roseBorder: 'rgba(212,86,122,0.30)',
  glass: 'rgba(255,255,255,0.52)',
  glassInner: 'rgba(255,255,255,0.80)',
  glassShadow: 'rgba(180,140,160,0.14)',
  text: '#1a1220',
  muted: '#7a6880',
  hint: '#b0a0b8',
};

const COLORS = {
  good: '#4caf50',
  moderate: '#edbb05',
  unhealthySensitive: '#ff9800',
  unhealthy: '#f44336',
  veryUnhealthy: '#9c27b0',
  hazardous: '#1a0028',
};

const DISTRICT_EXTENDED: Record<string, { no2: number; so2: number; co: number; pm10: number }> = {
  桃園區: { no2: 15, so2: 2.5, co: 0.45, pm10: 45 },
  中壢區: { no2: 15, so2: 1.3, co: 0.41, pm10: 44 },
  八德區: { no2: 12, so2: 2.1, co: 0.38, pm10: 38 },
  龜山區: { no2: 18, so2: 3.2, co: 0.55, pm10: 52 },
  蘆竹區: { no2: 11, so2: 2.0, co: 0.35, pm10: 32 },
  大園區: { no2: 10, so2: 2.8, co: 0.30, pm10: 30 },
  大溪區: { no2: 9, so2: 1.8, co: 0.28, pm10: 28 },
  平鎮區: { no2: 13, so2: 2.2, co: 0.40, pm10: 36 },
  楊梅區: { no2: 12, so2: 2.0, co: 0.36, pm10: 34 },
  龍潭區: { no2: 10, so2: 1.9, co: 0.36, pm10: 33 },
  觀音區: { no2: 16, so2: 3.5, co: 0.48, pm10: 50 },
  新屋區: { no2: 14, so2: 3.0, co: 0.46, pm10: 48 },
  復興區: { no2: 5, so2: 1.2, co: 0.20, pm10: 20 },
};

const TREND_DATA = [
  0.3, 0.2, 0.3, 0.5, 0.58, 0.47, 0.48, 0.52, 0.65, 0.42, 0.38,
  0.35, 0.3, 0.28, 0.4, 0.55, 0.6, 0.52, 0.45, 0.38, 0.3,
  0.25, 0.28, 0.32, 0.38, 0.42, 0.48, 0.5, 0.45, 0.4,
  0.38, 0.35, 0.33, 0.3, 0.28, 0.32, 0.35, 0.38,
];

const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return COLORS.good;
  if (aqi <= 100) return COLORS.moderate;
  if (aqi <= 150) return COLORS.unhealthySensitive;
  if (aqi <= 200) return COLORS.unhealthy;
  if (aqi <= 300) return COLORS.veryUnhealthy;
  return COLORS.hazardous;
};

const getAQIStatus = (aqi: number) => {
  if (aqi <= 50) return '良好';
  if (aqi <= 100) return '普通';
  if (aqi <= 150) return '敏感族群';
  if (aqi <= 200) return '不健康';
  if (aqi <= 300) return '非常不健康';
  return '危害';
};

const getPM25Color = (v: number) => {
  if (v <= 15.4) return '#E76595';
  if (v <= 35.4) return COLORS.moderate;
  if (v <= 54.4) return COLORS.unhealthySensitive;
  if (v <= 150.4) return COLORS.unhealthy;
  if (v <= 250.4) return COLORS.veryUnhealthy;
  return COLORS.hazardous;
};

const getO3Color = (v: number) => {
  if (v <= 54) return '#E76595';
  if (v <= 70) return COLORS.moderate;
  if (v <= 85) return COLORS.unhealthySensitive;
  if (v <= 105) return COLORS.unhealthy;
  if (v <= 200) return COLORS.veryUnhealthy;
  return COLORS.hazardous;
};

const getActivityInfo = (aqi: number) => {
  if (aqi <= 50) {
    return { icon: Smile, color: '#E76595', advice: '正常戶外活動，無須特別注意。' };
  }
  if (aqi <= 100) {
    return { icon: Meh, color: COLORS.moderate, advice: '正常戶外活動。' };
  }
  if (aqi <= 150) {
    return {
      icon: Frown,
      color: COLORS.unhealthySensitive,
      advice: '若感不適，考慮減少戶外活動；學生建議減少長時間劇烈運動。',
    };
  }
  if (aqi <= 200) {
    return {
      icon: Frown,
      color: COLORS.unhealthy,
      advice: '若感不適，減少體力消耗；學生避免長時間劇烈運動並增加休息。',
    };
  }
  return {
    icon: Frown,
    color: aqi <= 300 ? COLORS.veryUnhealthy : COLORS.hazardous,
    advice: '減少或避免戶外活動；學生應停止戶外活動，課程調整至室內進行。',
  };
};

function SecLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="dash-section-label">
      <div className="dash-section-dot" />
      <span>{title}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const GAUGE_SIZE = 158;
const STROKE_W = 9;
const GAUGE_R = (GAUGE_SIZE - STROKE_W) / 2;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

function AQIGauge({ aqi, animationKey }: { aqi: number; animationKey: string }) {
  const color = getAQIColor(aqi);
  const pct = Math.min(Math.max(aqi / 200, 0), 1);
  const offset = GAUGE_CIRC * (1 - pct);
  const center = GAUGE_SIZE / 2;

  return (
    <div className="aqi-gauge">
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} aria-hidden="true">
        <defs>
          <linearGradient id="aqi-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${color}99`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={GAUGE_R}
          stroke={color}
          strokeOpacity={0.25}
          strokeWidth={STROKE_W}
          fill="none"
        />
        <circle
          key={`aqi-ring-${animationKey}-${aqi}`}
          cx={center}
          cy={center}
          r={GAUGE_R}
          stroke="url(#aqi-ring-gradient)"
          strokeWidth={STROKE_W}
          fill="none"
          strokeDasharray={GAUGE_CIRC}
          strokeDashoffset={GAUGE_CIRC}
          strokeLinecap="round"
          transform={`rotate(-90, ${center}, ${center})`}
        >
          <animate
            attributeName="stroke-dashoffset"
            from={GAUGE_CIRC}
            to={offset}
            dur="1.2s"
            fill="freeze"
            calcMode="linear"
          />
        </circle>
      </svg>
      <div className="aqi-gauge-inner">
        <span className="aqi-label">AQI</span>
        <strong style={{ color }}>{aqi}</strong>
        <span className="aqi-pill" style={{ color, backgroundColor: `${color}33`, borderColor: `${color}55` }}>
          {getAQIStatus(aqi)}
        </span>
      </div>
    </div>
  );
}

const ARC_R = 45;
const ARC_CX = 55;
const ARC_CY = 58;
const ARC_LEN = Math.PI * ARC_R;

function polarToXY(angleDeg: number) {
  const rad = (Math.PI * (180 - angleDeg)) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(rad), y: ARC_CY - ARC_R * Math.sin(rad) };
}

function GaugeArc({
  value,
  max,
  markerVal,
  color,
  unit,
  animationKey,
}: {
  value: number;
  max: number;
  markerVal: number;
  color: string;
  unit: string;
  animationKey: string;
}) {
  const dashOffset = ARC_LEN * (1 - Math.min(value / max, 1));
  const markerAngle = Math.min(markerVal / max, 1) * 180;
  const mp = polarToXY(markerAngle);
  const rad = (Math.PI * (180 - markerAngle)) / 180;
  const lx = ARC_CX + (ARC_R + 14) * Math.cos(rad);
  const ly = ARC_CY - (ARC_R + 14) * Math.sin(rad);

  return (
    <svg width={190} height={90} viewBox="-10 0 120 68" className="mini-arc" aria-hidden="true">
      <path d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={7} strokeLinecap="round" />
      <path
        key={`mini-arc-${animationKey}-${value}-${unit}`}
        d={`M 10 58 A ${ARC_R} ${ARC_R} 0 0 1 100 58`}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={ARC_LEN}
        strokeDashoffset={ARC_LEN}
      >
        <animate
          attributeName="stroke-dashoffset"
          from={ARC_LEN}
          to={dashOffset}
          dur="0.8s"
          fill="freeze"
          calcMode="linear"
        />
      </path>
      <line x1={mp.x} y1={mp.y} x2={lx} y2={ly} stroke="rgba(0,0,0,0.28)" strokeWidth={1.5} strokeLinecap="round" />
      <text x={lx} y={ly - 3} fontSize={9} fill="#aaa" textAnchor="middle">{markerVal}</text>
      <text x={ARC_CX} y={52} fontSize={20} fontWeight={700} fill={color} textAnchor="middle">{value}</text>
      <text x={ARC_CX} y={63} fontSize={9} fill="#aaa" textAnchor="middle">{unit}</text>
    </svg>
  );
}

function TrendBars() {
  const BAR_W = 12;
  const BAR_GAP = 8;
  const MAX_H = 74;
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  const slots = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const items: { hour: number; date: Date; isPrediction: boolean; isNow: boolean }[] = [];

    for (let i = 5; i >= 1; i -= 1) {
      const d = new Date(now);
      d.setHours(currentHour - i, 0, 0, 0);
      items.push({ hour: d.getHours(), date: d, isPrediction: false, isNow: false });
    }

    items.push({ hour: currentHour, date: new Date(now), isPrediction: false, isNow: true });

    for (let i = 1; i <= 32; i += 1) {
      const d = new Date(now);
      d.setHours(currentHour + i, 0, 0, 0);
      items.push({ hour: d.getHours(), date: d, isPrediction: true, isNow: false });
    }

    return items;
  }, []);

  const data = TREND_DATA.slice(0, 38);
  const totalWidth = data.length * (BAR_W + BAR_GAP) - BAR_GAP;
  const pastWidth = 5 * (BAR_W + BAR_GAP);
  const nowOffset = pastWidth + BAR_W / 2;

  const barColor = (value: number, isPrediction: boolean) => {
    if (isPrediction) {
      if (value <= 0.3) return '#D9D9D9';
      if (value <= 0.5) return '#C4C4C4';
      if (value <= 0.7) return '#999999';
      return '#7B7B7B';
    }
    if (value <= 0.3) return `${COLORS.good}cc`;
    if (value <= 0.5) return `${COLORS.moderate}cc`;
    if (value <= 0.7) return `${COLORS.unhealthy}cc`;
    return `${COLORS.veryUnhealthy}cc`;
  };

  const dateLabel = (index: number) => {
    if (index === 0) return null;
    const curr = slots[index];
    const prev = slots[index - 1];
    if (!curr || !prev || curr.date.getDate() === prev.date.getDate()) return null;
    return `${curr.date.getMonth() + 1}/${curr.date.getDate()}(${WEEK[curr.date.getDay()]})`;
  };

  return (
    <div className="trend-scroll">
      <div className="trend-inner" style={{ width: totalWidth }}>
        <div className="trend-date-row">
          {data.map((_, index) => {
            const label = dateLabel(index);
            if (!label) return null;
            return (
              <span key={index} className="trend-date-label" style={{ left: index * (BAR_W + BAR_GAP) - 10 }}>
                {label}
              </span>
            );
          })}
        </div>

        <div className="trend-bars" style={{ gap: BAR_GAP }}>
          {data.map((value, index) => {
            const slot = slots[index] ?? { isPrediction: false, isNow: false };
            const label = dateLabel(index);
            return (
              <div key={index} className="trend-bar-wrap" style={{ width: BAR_W }}>
                {label && <span className="trend-day-line" />}
                <span
                  className="trend-bar"
                  style={{
                    height: Math.max(5, value * MAX_H),
                    width: BAR_W,
                    backgroundColor: barColor(value, slot.isPrediction),
                    borderColor: slot.isNow ? '#FBA7BC' : 'transparent',
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="trend-hour-row">
          {data.map((_, index) => {
            const slot = slots[index];
            if (!slot) return null;
            return (
              <span
                key={index}
                className={`trend-hour${slot.isNow ? ' now' : ''}${slot.isPrediction ? ' prediction' : ''}`}
                style={{ left: index * (BAR_W + BAR_GAP) - 5 }}
              >
                {String(slot.hour).padStart(2, '0')}
              </span>
            );
          })}
        </div>

        <div className="trend-footer">
          <span>過去 5h</span>
          <strong style={{ left: nowOffset - 14 }}>NOW</strong>
          <span>未來 32h</span>
        </div>
      </div>
    </div>
  );
}

function DashboardStyles() {
  return (
    <style>{`
      .dashboard-page {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        min-height: calc(100vh - 80px);
        padding: 28px 40px 32px;
        display: grid;
        grid-template-columns: minmax(380px, 36%) minmax(760px, 1fr);
        gap: 22px;
        overflow-x: hidden;
      }

      .dashboard-map-pane {
        position: relative;
        min-height: calc(100vh - 124px);
        min-width: 0;
        padding: 58px 18px 42px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .dashboard-map-wrap {
        width: min(100%, 560px);
        height: min(68vh, 610px);
      }

      .dashboard-map-action {
        position: absolute;
        left: 32px;
        bottom: 28px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #d4567a;
        border-radius: 999px;
        padding: 10px 18px;
        background: #f7e9ec;
        color: #d4567a;
        font-size: 15px;
        font-weight: 800;
        white-space: nowrap;
      }

      .dashboard-panel {
        height: auto;
        min-height: 0;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        align-self: start;
        margin-top: 28px;
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid rgba(231, 101, 149, 0.08);
        border-radius: 20px;
        box-shadow: 0 4px 32px rgba(231, 101, 149, 0.08);
        padding: 26px 36px 24px;
        display: flex;
        flex-direction: column;
      }

      .district-heading {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #d4567a;
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 0;
        flex: 0 0 auto;
        line-height: 1;
      }

      .district-heading h1 {
        margin: 0;
        font-size: inherit;
        line-height: 1;
      }

      .dash-divider {
        height: 1px;
        background: rgba(0, 0, 0, 0.06);
        margin: 14px 0 18px;
        flex: 0 0 auto;
      }

      .dashboard-first-row,
      .dashboard-second-row,
      .dashboard-lower-row {
        display: grid;
        gap: 20px;
        min-width: 0;
      }

      .dashboard-first-row {
        grid-template-columns: minmax(190px, 0.78fr) minmax(430px, 1.9fr);
        align-items: start;
        gap: 30px;
        min-height: 0;
        flex: 0 0 auto;
      }

      .dashboard-second-row {
        grid-template-columns: minmax(310px, 1fr) 1px minmax(360px, 1.12fr);
        align-items: start;
        margin-top: 14px;
        min-height: 0;
        flex: 0 0 auto;
      }

      .dashboard-lower-row {
        grid-template-columns: minmax(220px, 2fr) minmax(360px, 3fr);
        align-items: stretch;
        gap: 30px;
        margin-top: 24px;
        min-height: 0;
        flex: 0 0 auto;
      }

      .dashboard-side-stack {
        display: flex;
        flex-direction: column;
        gap: 22px;
        height: 100%;
        min-width: 0;
      }

      .dashboard-first-row > *,
      .dashboard-second-row > *,
      .dashboard-lower-row > * {
        min-width: 0;
      }

      .dash-section-label {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 16px;
        margin-bottom: 16px;
        color: ${C.text};
        font-size: 12px;
        font-weight: 800;
      }

      .dash-section-dot {
        width: 3px;
        height: 14px;
        flex-shrink: 0;
        border-radius: 2px;
        background: ${C.rose};
        box-shadow: 0 0 8px ${C.roseBorder};
      }

      .dash-section-label small {
        color: #aaa;
        font-size: 11px;
        font-weight: 600;
      }

      .aqi-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 6px;
      }

      .aqi-gauge {
        position: relative;
        width: ${GAUGE_SIZE}px;
        height: ${GAUGE_SIZE}px;
        display: grid;
        place-items: center;
      }

      .aqi-gauge svg {
        position: absolute;
        inset: 0;
      }

      .aqi-gauge circle {
        transition: stroke 0.18s ease;
      }

      .aqi-gauge-inner {
        position: relative;
        z-index: 1;
        width: ${GAUGE_SIZE - 46}px;
        height: ${GAUGE_SIZE - 46}px;
        border-radius: 50%;
        background: ${C.glass};
        border: 1px solid ${C.glassInner};
        box-shadow: 0 3px 12px ${C.glassShadow};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .aqi-label {
        color: ${C.hint};
        font-family: monospace;
        font-size: 8px;
        letter-spacing: 1.5px;
      }

      .aqi-gauge-inner strong {
        font-size: 32px;
        line-height: 34px;
        font-weight: 900;
      }

      .aqi-pill {
        margin-top: 4px;
        padding: 2px 8px;
        border: 1.2px solid;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
      }

      .aqi-hint {
        margin-top: 12px;
        color: ${C.hint};
        font-size: 10px;
        font-weight: 600;
      }

      .pollutant-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .mini-gauge-row,
      .mini-pollut-strip {
        display: grid;
      }

      .mini-gauge-row {
        grid-template-columns: 1fr 1px 1fr;
        gap: 0 18px;
        margin-bottom: 18px;
      }

      .mini-gauge-card {
        min-width: 0;
        padding: 6px 4px 2px;
        text-align: center;
      }

      .mini-gauge-card h3 {
        margin: 0;
        color: #444;
        font-size: 17px;
        line-height: 1;
        font-weight: 800;
      }

      .mini-gauge-card p {
        margin: 6px 0 4px;
        color: ${C.muted};
        font-size: 9px;
        font-weight: 600;
      }

      .mini-gauge-card small {
        display: block;
        margin-bottom: 4px;
        color: #aaa;
        font-size: 8px;
      }

      .mini-divider,
      .metric-divider,
      .row-divider {
        background: rgba(0, 0, 0, 0.08);
      }

      .mini-divider {
        margin: 8px 0;
      }

      .mini-arc {
        display: block;
        margin: 0 auto;
        overflow: visible;
        width: 152px;
        height: 72px;
      }

      .mini-arc path,
      .mini-arc text {
        transition: fill 0.18s ease;
      }

      .mini-pollut-strip {
        grid-template-columns: repeat(7, auto);
        gap: 0 10px;
      }

      .mini-pollut-card {
        min-width: 0;
        padding: 10px 12px;
        text-align: center;
      }

      .metric-divider {
        width: 1px;
        margin: 8px 0;
      }

      .mini-pollut-card h4 {
        margin: 0;
        color: #555;
        font-size: 15px;
        line-height: 1.1;
        font-weight: 800;
      }

      .mini-pollut-card p {
        margin: 6px 0 9px;
        color: ${C.muted};
        font-size: 9px;
        font-weight: 600;
      }

      .mini-pollut-value {
        display: inline-flex;
        align-items: baseline;
        justify-content: center;
        gap: 7px;
      }

      .mini-pollut-value strong {
        color: #e76595;
        font-size: 16px;
        line-height: 1;
        font-weight: 800;
      }

      .mini-pollut-value small {
        color: #aaa;
        font-size: 9px;
        font-weight: 700;
      }

      .advice-card,
      .insight-card {
        display: flex;
        align-items: center;
        gap: 14px;
        border-radius: 12px;
        padding: 16px 18px;
        min-width: 0;
      }

      .advice-icon,
      .insight-icon {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
      }

      .advice-icon {
        border: 1px solid;
      }

      .advice-card p,
      .insight-card p {
        margin: 0;
      }

      .advice-card p {
        color: ${C.muted};
        font-size: 13px;
        line-height: 1.5;
        font-weight: 700;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .row-divider {
        width: 1px;
        align-self: stretch;
      }

      .insight-card {
        background: ${C.roseLt};
        border: 1px solid ${C.roseBorder};
      }

      .insight-icon {
        background: rgba(212, 86, 122, 0.16);
        color: ${C.rose};
      }

      .insight-copy {
        flex: 1;
        min-width: 0;
      }

      .insight-copy strong {
        display: block;
        color: ${C.rose};
        font-size: 13px;
        font-weight: 800;
        overflow-wrap: anywhere;
      }

      .insight-copy span {
        display: block;
        margin-top: 6px;
        color: ${C.muted};
        font-size: 11px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .insight-chip {
        flex: 0 0 auto;
        border: 1px solid ${C.roseBorder};
        border-radius: 999px;
        padding: 5px 11px;
        background: rgba(212, 86, 122, 0.14);
        color: ${C.rose};
        font-size: 13px;
        font-weight: 800;
      }

      .trend-section {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        margin-top: 0;
        min-height: 0;
        min-width: 0;
        max-width: 100%;
      }

      .trend-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        height: 22px;
      }

      .scroll-hint {
        display: none;
        align-items: center;
        gap: 4px;
        border: 1px solid ${C.roseBorder};
        border-radius: 999px;
        padding: 4px 10px;
        background: rgba(212, 86, 122, 0.10);
        color: ${C.rose};
        font-size: 11px;
        font-weight: 800;
      }

      .trend-scroll {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0 0 8px 0;
        overscroll-behavior-inline: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: rgba(212, 86, 122, 0.28) transparent;
      }

      .trend-scroll::-webkit-scrollbar {
        height: 3px;
      }

      .trend-scroll::-webkit-scrollbar-track {
        background: transparent;
      }

      .trend-scroll::-webkit-scrollbar-thumb {
        background: rgba(212, 86, 122, 0.28);
        border-radius: 99px;
      }

      .trend-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(212, 86, 122, 0.55);
      }

      .trend-inner {
        min-width: max-content;
      }

      .trend-date-row {
        position: relative;
        height: 32px;
        margin-bottom: 0;
      }

      .trend-date-label {
        position: absolute;
        top: 0;
        color: ${C.rose};
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .trend-bars {
        height: 80px;
        display: flex;
        align-items: flex-end;
      }

      .trend-bar-wrap {
        position: relative;
        height: 80px;
        flex-shrink: 0;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }

      .trend-day-line {
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 1.5px;
        height: 76px;
        transform: translateX(-50%);
        background: ${C.rose};
      }

      .trend-bar {
        position: relative;
        z-index: 1;
        display: block;
        border: 1px solid transparent;
        border-radius: 4px;
      }

      .trend-hour-row {
        position: relative;
        height: 22px;
        margin-top: 6px;
      }

      .trend-hour {
        position: absolute;
        top: 2px;
        width: 20px;
        text-align: center;
        color: rgba(93, 115, 137, 0.6);
        font-size: 9px;
        font-weight: 700;
      }

      .trend-hour.now {
        color: ${C.rose};
        font-size: 9px;
        font-weight: 900;
      }

      .trend-hour.prediction {
        color: rgba(93, 115, 137, 0.4);
        font-style: italic;
      }

      .trend-footer {
        position: relative;
        height: 22px;
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        color: ${C.hint};
        font-size: 11px;
        font-weight: 800;
      }

      .trend-footer strong {
        position: absolute;
        top: 0;
        color: ${C.rose};
        font-size: 11px;
        font-weight: 900;
      }

      @media (max-width: 1280px) {
        .dashboard-page {
          grid-template-columns: 1fr;
          height: auto;
        }

        .dashboard-map-pane {
          min-height: auto;
          height: auto;
          max-height: none;
          padding: 20px 0 16px;
        }

        .dashboard-panel {
          min-height: auto;
          height: auto;
          max-height: none;
          margin-top: 0;
        }

        .dashboard-map-wrap {
          height: min(52vh, 520px);
          width: min(100%, 520px);
        }

        .dashboard-map-action {
          position: static;
          margin-top: 14px;
          align-self: flex-start;
        }
      }

      @media (max-width: 820px) {
        .dashboard-page {
          padding: 16px 20px 28px;
        }

        .dashboard-panel {
          padding: 20px 18px;
        }

        .dashboard-map-wrap {
          height: min(44vh, 420px);
        }

        .dashboard-first-row {
          grid-template-columns: 1fr;
          gap: 16px;
        }

        .dashboard-second-row,
        .dashboard-lower-row {
          grid-template-columns: 1fr;
        }

        .dashboard-lower-row {
          align-items: start;
        }

        .insight-card {
          align-items: flex-start;
        }

        .row-divider {
          display: none;
        }

        .mini-gauge-row {
          grid-template-columns: 1fr 1px 1fr;
        }

        .mini-pollut-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px 12px;
        }

        .metric-divider {
          display: none;
        }

        .trend-heading .scroll-hint {
          display: inline-flex;
        }
      }

      @media (max-width: 480px) {
        .dashboard-page {
          padding: 12px 16px 24px;
        }

        .dashboard-panel {
          padding: 18px 14px;
          border-radius: 16px;
        }

        .dashboard-map-wrap {
          height: min(38vh, 320px);
        }

        .dashboard-first-row {
          gap: 12px;
        }

        .mini-gauge-row {
          grid-template-columns: 1fr;
          gap: 16px;
        }

        .mini-divider {
          display: none;
        }

        .insight-card {
          flex-wrap: wrap;
        }

        .insight-chip {
          margin-left: 48px;
        }

        .aqi-block {
          padding-top: 0;
        }

        .dashboard-lower-row {
          gap: 16px;
        }

        .dashboard-side-stack {
          gap: 14px;
        }
      }

      @media (max-height: 760px) and (min-width: 1281px) {
        .dashboard-page {
          overflow: auto;
          padding-top: 8px;
          padding-bottom: 14px;
        }

        .dashboard-map-pane {
          padding-top: 34px;
          padding-bottom: 24px;
        }

        .dashboard-map-wrap {
          height: min(60vh, 540px);
        }

        .dashboard-panel {
          margin-top: 12px;
          padding: 14px 24px 12px;
        }

        .dash-divider {
          margin: 9px 0 11px;
        }

        .dashboard-first-row {
          gap: 16px;
        }

        .dashboard-lower-row {
          gap: 16px;
          margin-top: 12px;
        }

        .dash-section-label {
          margin-bottom: 8px;
        }

        .mini-gauge-row {
          margin-bottom: 8px;
        }

        .mini-pollut-card {
          padding-top: 6px;
          padding-bottom: 6px;
        }

        .advice-card,
        .insight-card {
          padding: 10px 13px;
        }

        .trend-date-row {
          height: 22px;
        }

        .trend-bars,
        .trend-bar-wrap {
          height: 62px;
        }

        .trend-day-line {
          height: 58px;
        }

        .trend-footer {
          margin-top: 5px;
        }
      }
    `}</style>
  );
}

export default function DashboardPage() {
  const [district, setDistrict] = useState('中壢區');
  const [remoteMetrics, setRemoteMetrics] = useState<{
    district: string;
    aqi: number;
    pm25: number;
    pm10: number;
    o3: number;
    no2: number;
    so2: number;
    co: number;
  } | null>(null);

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
    let alive = true;
    const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ.中壢區;

    fetchMoeStations()
      .then((stations) => {
        const sitename = Object.entries(EPA_STATION_TO_DISTRICT).find(([, d]) => d === district)?.[0];
        if (!sitename || !alive) return;
        const station = stations.find((s) => s.sitename === sitename);
        if (!station || !alive) return;

        setRemoteMetrics({
          district,
          aqi:  station.aqi  || base.aqi,
          pm25: station.pm25 || base.pm25,
          pm10: station.pm10,
          o3:   station.o3   || base.o3,
          no2:  station.no2,
          so2:  station.so2,
          co:   station.co,
        });
      })
      .catch(console.warn);

    return () => {
      alive = false;
    };
  }, [district]);

  const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ.中壢區;
  const ext = DISTRICT_EXTENDED[district] ?? DISTRICT_EXTENDED.中壢區;
  const live = remoteMetrics?.district === district ? remoteMetrics : null;
  const aqi = live?.aqi ?? base.aqi;
  const pm25 = live?.pm25 ?? base.pm25;
  const o3 = live?.o3 ?? base.o3;
  const no2  = live?.no2  ?? ext.no2;
  const so2  = live?.so2  ?? ext.so2;
  const co   = live?.co   ?? ext.co;
  const pm10 = live?.pm10 ?? ext.pm10;
  const activity = getActivityInfo(aqi);
  const ActivityIcon = activity.icon;

  const pollutants = [
    { name: 'NO₂', sub: '二氧化氮', value: no2, unit: 'ppb' },
    { name: 'SO₂', sub: '二氧化硫', value: so2, unit: 'ppb' },
    { name: 'CO', sub: '一氧化碳', value: co.toFixed(2), unit: 'ppm' },
    { name: 'PM10', sub: '懸浮微粒', value: pm10, unit: 'μg/m³' },
  ];

  return (
    <>
      <DashboardStyles />
      <main className="dashboard-page">
        <section className="dashboard-map-pane" aria-label="桃園行政區地圖">
          <div className="dashboard-map-wrap">
            <TaoyuanSVGMap selectedDistrict={district} onSelectDistrict={setDistrict} />
          </div>
          <button className="dashboard-map-action" type="button">
            點選查看區域詳情
            <MapPin size={15} />
            {district}
          </button>
        </section>

        <section className="dashboard-panel" aria-label={`${district} 空氣品質儀表板`}>
          <header className="district-heading">
            <MapPin size={31} strokeWidth={2.3} />
            <h1>{district}</h1>
          </header>

          <div className="dash-divider" />

          <div className="dashboard-first-row">
            <div>
              <SecLabel title="AQI 空氣品質指標" />
              <div className="aqi-block">
                <AQIGauge key={`aqi-${district}-${aqi}`} aqi={aqi} animationKey={`${district}-${aqi}`} />
                <span className="aqi-hint">數值範圍 0-200，越低越好</span>
              </div>
            </div>

            <div>
              <div className="pollutant-title-row">
                <SecLabel title="污染物詳情" sub="（每小時）" />
              </div>

              <div className="mini-gauge-row">
                <div className="mini-gauge-card">
                  <h3>PM2.5</h3>
                  <p>細懸浮微粒</p>
                  <small>標準日均值為 15.4 μg/m³</small>
                  <GaugeArc
                    key={`pm25-${district}-${pm25}`}
                    value={pm25}
                    max={150}
                    markerVal={15.4}
                    color={getPM25Color(pm25)}
                    unit="μg/m³"
                    animationKey={`${district}-pm25-${pm25}`}
                  />
                </div>
                <div className="mini-divider" />
                <div className="mini-gauge-card">
                  <h3>O₃</h3>
                  <p>臭氧</p>
                  <small>標準8小時均值為 54 ppb</small>
                  <GaugeArc
                    key={`o3-${district}-${o3}`}
                    value={o3}
                    max={200}
                    markerVal={54}
                    color={getO3Color(o3)}
                    unit="ppb"
                    animationKey={`${district}-o3-${o3}`}
                  />
                </div>
              </div>

              <div className="mini-pollut-strip">
                {pollutants.map((item, index) => (
                  <React.Fragment key={item.name}>
                    {index > 0 && <div className="metric-divider" />}
                    <div className="mini-pollut-card">
                      <h4>{item.name}</h4>
                      <p>{item.sub}</p>
                      <span className="mini-pollut-value">
                        <strong>{item.value}</strong>
                        <small>{item.unit}</small>
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-lower-row">
            <div className="dashboard-side-stack">
              <div>
                <SecLabel title="活動建議" />
                <div className="advice-card" style={{ backgroundColor: `${activity.color}18`, border: `1px solid ${activity.color}55` }}>
                  <span className="advice-icon" style={{ backgroundColor: `${activity.color}28`, borderColor: `${activity.color}88` }}>
                    <ActivityIcon size={18} color={activity.color} />
                  </span>
                  <p>{activity.advice}</p>
                </div>
              </div>

              <div>
                <SecLabel title="AI 趨勢分析" />
                <div className="insight-card">
                  <span className="insight-icon">
                    <TrendingDown size={16} />
                  </span>
                  <p className="insight-copy">
                    <strong>PM2.5 濃度預計下降</strong>
                    <span>未來 3 小時因海風輻合影響</span>
                  </p>
                  <span className="insight-chip">-12%</span>
                </div>
              </div>
            </div>

            <section className="trend-section">
              <div className="trend-heading">
                <SecLabel title="PM2.5 趨勢" />
                <span className="scroll-hint">
                  <ChevronsRight size={13} />
                  左右滑動查看
                </span>
              </div>
              <TrendBars />
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
