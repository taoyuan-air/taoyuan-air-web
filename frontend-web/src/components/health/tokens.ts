import type { CSSProperties } from 'react';

/**
 * 健康與防護頁共用設計 token(同 dashboard:primary #4895EC、玻璃擬態)。
 * 集中定義避免各元件重複;色碼來源見 shared/src/constants/airHealth.ts。
 */
export const C = {
  primary: '#4895EC',
  primaryAlpha: 'rgba(72,149,236,0.12)',
  primaryBorder: 'rgba(72,149,236,0.30)',
  glass: 'rgba(255,255,255,0.52)',
  glassBorder: 'rgba(255,255,255,0.72)',
  glassShadow: '0 4px 16px rgba(30,58,95,0.10)',
  text: '#0F1D3A',
  muted: '#4A6080',
  hint: '#7A9AC0',
} as const;

export const card: CSSProperties = {
  backgroundColor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 20,
  boxShadow: C.glassShadow,
};
