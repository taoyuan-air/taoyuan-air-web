'use client';

/**
 * AQI 圓環儀表(從 dashboard/page.tsx 拆出共用)。
 * 色碼邏輯與 dashboard 完全相同,保持全站一致。
 */

const GAUGE_SIZE = 158;
const STROKE_W = 9;

const COLORS = {
  good:               '#4caf50',
  moderate:           '#edbb05',
  unhealthySensitive: '#ff9800',
  unhealthy:          '#f44336',
  veryUnhealthy:      '#9c27b0',
  hazardous:          '#7E0023',
};

export function getAqiColor(aqi: number): string {
  if (aqi <= 50)  return COLORS.good;
  if (aqi <= 100) return COLORS.moderate;
  if (aqi <= 150) return COLORS.unhealthySensitive;
  if (aqi <= 200) return COLORS.unhealthy;
  if (aqi <= 300) return COLORS.veryUnhealthy;
  return COLORS.hazardous;
}

export function getAqiStatus(aqi: number): string {
  if (aqi <= 50)  return '良好';
  if (aqi <= 100) return '普通';
  if (aqi <= 150) return '敏感族群';
  if (aqi <= 200) return '不健康';
  if (aqi <= 300) return '非常不健康';
  return '危害';
}

interface AqiGaugeProps {
  aqi: number;
  /** 用於 React key，切換地區時觸發動畫重播 */
  animationKey: string;
  size?: number;
}

export function AqiGauge({ aqi, animationKey, size = GAUGE_SIZE }: AqiGaugeProps) {
  const color   = getAqiColor(aqi);
  const strokeW = STROKE_W * (size / GAUGE_SIZE);
  const r       = (size - strokeW) / 2;
  const circ    = 2 * Math.PI * r;
  const pct     = Math.min(Math.max(aqi / 200, 0), 1);
  const offset  = circ * (1 - pct);
  const center  = size / 2;
  const innerSz = size - 46 * (size / GAUGE_SIZE);

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    }}>
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <linearGradient id={`aqi-ring-grad-${animationKey}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={`${color}99`} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {/* track */}
        <circle cx={center} cy={center} r={r}
          stroke={color} strokeOpacity={0.25} strokeWidth={strokeW} fill="none" />

        {/* progress */}
        <circle
          key={`ring-${animationKey}-${aqi}`}
          cx={center} cy={center} r={r}
          stroke={`url(#aqi-ring-grad-${animationKey})`}
          strokeWidth={strokeW}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          strokeLinecap="round"
          transform={`rotate(-90, ${center}, ${center})`}
        >
          <animate
            attributeName="stroke-dashoffset"
            from={circ}
            to={offset}
            dur="1.2s"
            fill="freeze"
            calcMode="linear"
          />
        </circle>
      </svg>

      {/* inner circle */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: innerSz,
        height: innerSz,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.80)',
        border: '1px solid rgba(255,255,255,0.90)',
        boxShadow: '0 3px 12px rgba(30,58,95,0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#7A9AC0', fontFamily: 'monospace', fontSize: 8 * (size / GAUGE_SIZE), letterSpacing: 1.5 }}>
          AQI
        </span>
        <strong style={{ color, fontSize: 32 * (size / GAUGE_SIZE), lineHeight: 1.05, fontWeight: 900 }}>
          {aqi}
        </strong>
        <span style={{
          marginTop: 4,
          padding: '2px 8px',
          border: `1.2px solid ${color}55`,
          borderRadius: 999,
          fontSize: 10 * (size / GAUGE_SIZE),
          fontWeight: 800,
          color,
          backgroundColor: `${color}33`,
        }}>
          {getAqiStatus(aqi)}
        </span>
      </div>
    </div>
  );
}
