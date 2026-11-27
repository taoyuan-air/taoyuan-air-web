'use client';

import Link from 'next/link';
import { DISTRICTS, type District, type MoeStation } from '@/lib/health/districtStations';
import { C } from './tokens';

interface StationPickerProps {
  district: string;
  onDistrictChange: (d: District) => void;
  refStation: MoeStation;
  /** 使用者未設定預設行政區時顯示「可至設定頁儲存預設行政區」提示 */
  showStoreHint: boolean;
}

/**
 * 行政區選擇 + 參考測站標示。選擇僅影響本頁顯示,不寫回資料庫。
 * 13 行政區只有 6 個環境部測站,畫面標示「參考測站:XX 站」,
 * 不寫成「該行政區的空氣品質」。
 */
export function StationPicker({ district, onDistrictChange, refStation, showStoreHint }: StationPickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>行政區</span>
          <select
            value={district}
            onChange={(e) => onDistrictChange(e.target.value as District)}
            aria-label="選擇行政區"
            style={{
              padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.7)',
              fontSize: 14, color: C.text, fontFamily: 'inherit', outline: 'none', minWidth: 140,
            }}
          >
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, paddingBottom: 11 }}>
          參考測站:<span style={{ color: C.primary }}>{refStation} 站</span>
        </span>
      </div>
      {showStoreHint && (
        <span style={{ fontSize: 11, color: C.hint }}>
          可至
          <Link href="/settings" style={{ color: C.primary, fontWeight: 600, textDecoration: 'none', margin: '0 2px' }}>
            設定頁
          </Link>
          儲存預設行政區
        </span>
      )}
    </div>
  );
}
