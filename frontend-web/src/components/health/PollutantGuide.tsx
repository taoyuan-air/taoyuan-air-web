'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AIR_STANDARDS } from '@shared/constants/airHealth';
import { OFFICIAL_POLLUTANT_INTRO } from '@shared/constants/officialText';
import { C, card } from './tokens';

const ITEMS: { key: keyof typeof OFFICIAL_POLLUTANT_INTRO; zh: string; en: string; stdKeys: string[] }[] = [
  { key: 'PM2.5', zh: 'PM2.5', en: 'Fine Particulate Matter', stdKeys: ['pm25_24h', 'pm25_year'] },
  { key: 'PM10', zh: 'PM10', en: 'Particulate Matter', stdKeys: ['pm10_24h', 'pm10_year'] },
  { key: 'O3', zh: 'O₃', en: 'Ozone', stdKeys: ['o3_8h', 'o3_1h'] },
  { key: 'NO2', zh: 'NO₂', en: 'Nitrogen Dioxide', stdKeys: ['no2_1h', 'no2_year'] },
  { key: 'SO2', zh: 'SO₂', en: 'Sulfur Dioxide', stdKeys: ['so2_1h', 'so2_year'] },
  { key: 'CO', zh: 'CO', en: 'Carbon Monoxide', stdKeys: ['co_8h', 'co_1h'] },
];

export function PollutantGuide() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>污染物小百科</p>
      <p style={{ fontSize: 11, color: C.hint, margin: '0 0 6px' }}>
        介紹文字取自環境部污染物特性頁;尚未填入時提供外連結,內容以官方公告為準
      </p>

      {ITEMS.map((it) => {
        const intro = OFFICIAL_POLLUTANT_INTRO[it.key];
        const isOpen = !!open[it.key];
        return (
          <div
            key={it.key}
            style={{
              borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          >
            <button
              onClick={() => toggle(it.key)}
              aria-expanded={isOpen}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', cursor: 'pointer', border: 'none', background: 'transparent',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{it.zh}</span>
                <span style={{ fontSize: 11, color: C.hint }}>{it.en}</span>
              </span>
              <ChevronDown
                size={16}
                color={C.hint}
                style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>

            {isOpen && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 官方介紹文字(逐字);未填入時只放外連結,不得自行代寫(R1) */}
                {intro.text ? (
                  <p style={{ fontSize: 12, lineHeight: 1.7, color: C.text, margin: 0 }}>{intro.text}</p>
                ) : (
                  <a
                    href={intro.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: C.primary, fontWeight: 600, textDecoration: 'none' }}
                  >
                    前往環境部原文 ↗
                  </a>
                )}

                {/* 法定標準值(從 AIR_STANDARDS 讀,不在元件內寫死) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {it.stdKeys.map((k) => {
                    const s = AIR_STANDARDS[k];
                    if (!s) return null;
                    return (
                      <span key={k} style={{ fontSize: 11, color: C.muted }}>
                        {s.period}標準:{s.value} {s.unit}
                      </span>
                    );
                  })}
                </div>

                <a
                  href={intro.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: C.primary, fontWeight: 600, textDecoration: 'none' }}
                >
                  前往環境部原文 ↗
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
