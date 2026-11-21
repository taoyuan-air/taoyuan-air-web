'use client';

import { useEffect, useState } from 'react';
import {
  AQI_LEVELS,
  POLLUTANT_BREAKPOINTS,
  POLLUTANT_UNITS,
  type Pollutant,
} from '@shared/constants/airHealth';
import { getAqiLevel } from '@/lib/health/aqiUtils';
import { C, card } from './tokens';
import { OfficialAdviceColumns } from './OfficialAdviceColumns';

const POLL_ROWS: { key: Pollutant; label: string }[] = [
  { key: 'PM2.5', label: 'PM2.5 24h' },
  { key: 'PM10', label: 'PM10 24h' },
  { key: 'O3_8h', label: 'O₃ 8h' },
  { key: 'O3_1h', label: 'O₃ 1h' },
  { key: 'CO_8h', label: 'CO 8h' },
  { key: 'SO2_1h', label: 'SO₂ 1h' },
  { key: 'NO2_1h', label: 'NO₂ 1h' },
];

function fmtRange(r: [number, number] | null, unit: string): string {
  if (!r) return '—';
  return `${r[0]}–${r[1]} ${unit}`;
}

/**
 * M1:AQI 級距互動尺(純前端常數,不呼叫 API)。
 * 橫向 0–500 色帶(六段依 AQI 區間比例著色)+ 可拖曳滑桿;
 * 下方即時顯示該 AQI 之級別、官方活動建議、對應污染物濃度區間。
 * currentAqi 有值時,色帶上以 ▼「目前」標出位置,滑桿初始值設為目前 AQI(無資料則 50)。
 */
export function AqiScrubber({
  currentAqi,
  sensitivity,
}: {
  currentAqi?: number;
  sensitivity: string;
}) {
  const initial = Number.isFinite(currentAqi as number) && (currentAqi as number) > 0 ? Math.round(currentAqi as number) : 50;
  const [value, setValue] = useState(initial);

  // 當外部 currentAqi 變動(切換測站)時同步初始值
  useEffect(() => {
    const apply = () => {
      if (Number.isFinite(currentAqi as number) && (currentAqi as number) > 0) {
        setValue(Math.round(currentAqi as number));
      }
    };
    apply();
  }, [currentAqi]);

  const level = getAqiLevel(value);
  const levelIndex = level ? level.id - 1 : 0;
  const pct = (value / 500) * 100;
  const currentPct =
    Number.isFinite(currentAqi as number) && (currentAqi as number) > 0
      ? (Math.round(currentAqi as number) / 500) * 100
      : null;

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>AQI 級距互動尺</p>
        <p style={{ fontSize: 11, color: C.hint, margin: 0 }}>拖曳或以鍵盤方向鍵調整數值,查看各級對應資訊</p>
      </div>

      {/* 色帶 + 滑桿 */}
      <div style={{ position: 'relative', paddingTop: 18 }}>
        {/* 目前 AQI 標記 */}
        {currentPct != null && (
          <div
            style={{
              position: 'absolute', top: 0, left: `${currentPct}%`, transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' }}>目前</span>
            <span style={{ fontSize: 11, lineHeight: 1, color: C.primary }}>▼</span>
          </div>
        )}

        {/* 六段色帶(依 AQI 區間比例) */}
        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden' }}>
          {AQI_LEVELS.map((l) => (
            <div key={l.id} style={{ flex: l.max - l.min + 1, backgroundColor: l.hex }} />
          ))}
        </div>

        {/* 滑桿容器 */}
        <div style={{ position: 'relative', height: 22, marginTop: 4, display: 'flex', alignItems: 'center' }}>
          {/* 自訂 thumb 視覺 */}
          <div
            style={{
              position: 'absolute', width: 16, height: 16, borderRadius: '50%',
              backgroundColor: '#fff', border: `2.5px solid ${level?.hex ?? C.primary}`,
              boxShadow: '0 2px 8px rgba(30,58,95,0.25)',
              left: `calc(${pct}% - 8px)`, pointerEvents: 'none', zIndex: 1,
              transition: 'left 0.05s',
            }}
          />
          {/* 原生 range input 透明疊加 */}
          <input
            type="range"
            min={0}
            max={500}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            aria-label="AQI 數值"
            aria-valuetext={`${value},${level?.label ?? ''}`}
            style={{
              position: 'absolute', width: '100%', opacity: 0,
              cursor: 'pointer', height: 22, margin: 0, zIndex: 2,
            }}
          />
        </div>
      </div>

      {/* 級別快捷鈕 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {AQI_LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => setValue(l.min)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '5px 10px', borderRadius: 99,
              backgroundColor: level?.id === l.id ? C.primaryAlpha : 'rgba(255,255,255,0.6)',
              border: `1px solid ${level?.id === l.id ? C.primaryBorder : C.glassBorder}`,
              fontSize: 11, fontWeight: 700, color: C.text,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: l.hex }} />
            {l.label}
          </button>
        ))}
      </div>

      {/* 結果區(aria-live) */}
      <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: level?.hex ?? C.text }}>{value}</span>
          {level && (
            <span
              style={{
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                backgroundColor: level.hex, color: level.darkText ? C.text : '#fff',
              }}
            >
              {level.label}
            </span>
          )}
        </div>

        {/* 官方活動建議(同 M2) */}
        <OfficialAdviceColumns level={level} sensitive={sensitivity === '敏感族群'} />

        {/* 這一級對應的污染物濃度區間 */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
            這一級對應的污染物濃度區間
          </p>
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
              padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.55)',
              border: `1px solid ${C.glassBorder}`,
            }}
          >
            {POLL_ROWS.map(({ key, label }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: C.hint }}>{label}</span>
                <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>
                  {fmtRange(POLLUTANT_BREAKPOINTS[key][levelIndex], POLLUTANT_UNITS[key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
