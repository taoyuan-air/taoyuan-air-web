'use client';

import { C } from './tokens';

/**
 * 免責聲明(R6)。固定文案(規格指定,逐字使用):
 * 「本頁資訊轉載自環境部、衛生福利部國民健康署等官方公開資料,
 *   不構成醫療建議。如有健康疑慮請洽醫療專業人員。」
 * variant=short:頁首一行精簡版;variant=full:頁尾完整版 + 官方出處列表。
 */
const DISCLAIMER_TEXT =
  '本頁資訊轉載自環境部官方公開資料，不構成醫療建議。如有健康疑慮請洽醫療專業人員。';

const SOURCES = [
  {
    name: '環境部空氣品質監測網-空氣品質指標',
    url: 'https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx',
  },
];

export function Disclaimer({ variant }: { variant: 'short' | 'full' }) {
  if (variant === 'short') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 12,
          backgroundColor: 'rgba(72,149,236,0.06)',
          border: `1px solid ${C.primaryBorder}`,
        }}
      >
        <span style={{ fontSize: 12, lineHeight: 1.6, color: C.muted }}>{DISCLAIMER_TEXT}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 12,
          backgroundColor: 'rgba(72,149,236,0.06)',
          border: `1px solid ${C.primaryBorder}`,
        }}
      >
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.muted, margin: 0 }}>{DISCLAIMER_TEXT}</p>
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.hint, letterSpacing: 0.4, marginBottom: 8 }}>官方出處</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SOURCES.map((s) => (
            <div key={s.url} style={{ display: 'flex', flexDirection: 'column' }}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.primary, textDecoration: 'none', fontWeight: 600 }}
              >
                {s.name}
              </a>
              <span style={{ fontSize: 11, color: C.hint }}>資料核對日 2026-11-21</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
