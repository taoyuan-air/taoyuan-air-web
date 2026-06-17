'use client';

interface PentagonRadarProps {
  data?: number[];
  labels?: string[];
  size?: number;
}

export function PentagonRadar({ data = [0.8, 0.6, 0.7, 0.9, 0.5], labels = ['化學', '粉塵', '生物', '氣體', '氣候'], size = 100 }: PentagonRadarProps) {
  const vb = size * 1.6;
  const center = vb / 2;
  const radius = size * 0.4;

  const getPoint = (index: number, scale = 1) => {
    const angle = (index * 72 - 90) * (Math.PI / 180);
    return { x: center + radius * scale * Math.cos(angle), y: center + radius * scale * Math.sin(angle) };
  };

  const pentagon = (scale: number) =>
    Array.from({ length: 5 }, (_, i) => getPoint(i, scale)).map(p => `${p.x},${p.y}`).join(' ');

  const dataPolygon = () =>
    Array.from({ length: 5 }, (_, i) => getPoint(i, data[i] ?? 0.5)).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={vb} height={vb} viewBox={`0 0 ${vb} ${vb}`}>
      <polygon points={pentagon(1)} fill="none" stroke="rgba(231,101,149,0.2)" strokeWidth="1" />
      <polygon points={pentagon(0.7)} fill="none" stroke="rgba(231,101,149,0.25)" strokeWidth="1" />
      <polygon points={pentagon(0.4)} fill="none" stroke="rgba(231,101,149,0.3)" strokeWidth="1" />
      {Array.from({ length: 5 }, (_, i) => {
        const p = getPoint(i);
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgba(231,101,149,0.3)" strokeWidth="1" />;
      })}
      <polygon points={dataPolygon()} fill="rgba(251,167,188,0.35)" stroke="rgba(231,101,149,0.8)" strokeWidth="2" />
      <circle cx={center} cy={center} r="2" fill="#E76595" />
      {labels.map((label, i) => {
        const p = getPoint(i, 1.35);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="600" fill="#7F5A6A">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
