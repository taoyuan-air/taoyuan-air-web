'use client';

/**
 * IOPDateSlider — 日期滑桿元件
 *
 * 刻度只顯示「日」數字，月份改變時插入月份標籤。
 * IOP 官方日期範圍內：正常藍色；超出範圍：灰色虛線。
 * 小螢幕顯示左右滑動提醒（scroll-hint）。
 * 選中日期文字標籤已移除（不再顯示底部日期字串）。
 */

import { useState } from 'react';
import { ChevronsRight } from 'lucide-react';

interface Props {
  dates: string[];
  selected: string;
  onChange: (date: string) => void;
  iopStart: string;
  iopEnd: string;
}

const C = {
  rose:        '#4895EC',
  roseBorder:  'rgba(72,149,236,0.28)',
  roseAlpha:   'rgba(72,149,236,0.15)',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
  glass:       'rgba(255,255,255,0.90)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
};

const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function isOutside(date: string, start: string, end: string): boolean {
  return date < start || date > end;
}

export default function IOPDateSlider({ dates, selected, onChange, iopStart, iopEnd }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (dates.length === 0) return null;

  // 找出月份變化點
  const monthBreaks: Record<number, string> = {};
  let lastMonth = '';
  dates.forEach((d, i) => {
    const m = d.slice(0, 7);
    if (m !== lastMonth) {
      monthBreaks[i] = MONTH_ZH[parseInt(d.slice(5, 7), 10) - 1];
      lastMonth = m;
    }
  });

  const outsideCount = dates.filter((d) => isOutside(d, iopStart, iopEnd)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* 說明列 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        flexWrap: 'wrap', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>觀測日期</span>
          {outsideCount > 0 && (
            <span style={{ fontSize: 11, color: C.hint }}>
              灰色刻度（{outsideCount} 天）為超出 IOP 官方期間的延伸資料
            </span>
          )}
        </div>

        {/* 小螢幕才顯示的左右滑動提醒 */}
        <span className="iop-slider-scroll-hint">
          <ChevronsRight size={13} />
          左右滑動查看
        </span>
      </div>

      {/* 滑桿主體 */}
      <div
        style={{
          position: 'relative',
          background: C.glass,
          border: '1px solid rgba(72,149,236,0.12)',
          borderRadius: 14,
          padding: '16px 20px 12px',
          boxShadow: C.glassShadow,
          overflowX: 'auto',
          overscrollBehaviorInline: 'contain',
        }}
      >
        {/* 月份標籤行 */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 4, minWidth: dates.length * 44 }}>
          {dates.map((d, i) => (
            <div
              key={d}
              style={{
                width: 44, flexShrink: 0,
                fontSize: 10, fontWeight: 700,
                color: monthBreaks[i] ? C.rose : 'transparent',
                textAlign: 'center', userSelect: 'none', whiteSpace: 'nowrap',
              }}
            >
              {monthBreaks[i] ?? ''}
            </div>
          ))}
        </div>

        {/* 刻度點擊行 */}
        <div style={{ display: 'flex', gap: 0, minWidth: dates.length * 44, alignItems: 'flex-end' }}>
          {dates.map((d) => {
            const outside    = isOutside(d, iopStart, iopEnd);
            const isSelected = d === selected;
            const isHovered  = d === hovered;
            const dayNum     = parseInt(d.slice(8, 10), 10);

            return (
              <div
                key={d}
                style={{
                  width: 44, flexShrink: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 4,
                  position: 'relative', cursor: 'pointer',
                }}
                onClick={() => onChange(d)}
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                title={outside ? `${d}（超出 IOP 官方期間）` : d}
                role="button"
                aria-label={`選擇日期 ${d}${outside ? '（超出 IOP 期間）' : ''}`}
                aria-pressed={isSelected}
              >
                {/* 選中連接線（僅 IOP 官方期間內顯示，outside 不顯示避免藍色透出）*/}
                {isSelected && !outside && (
                  <div style={{
                    position: 'absolute', bottom: 22, left: '50%',
                    transform: 'translateX(-50%)',
                    width: 2, height: 8, background: C.rose, borderRadius: 1,
                  }} />
                )}

                {/* 日期圓圈（outside 用不透明灰色，不用 opacity 降透明）*/}
                <div
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: isSelected ? 900 : outside ? 500 : 700,
                    color: outside
                      ? (isSelected ? '#8A9AB8' : isHovered ? '#8A9AB8' : '#B0BECF')
                      : (isSelected ? '#fff' : isHovered ? C.rose : C.muted),
                    background: outside
                      ? (isSelected ? '#E8ECF2' : isHovered ? '#F0F2F6' : 'transparent')
                      : (isSelected ? C.rose : isHovered ? C.roseAlpha : 'transparent'),
                    border: outside
                      ? (isSelected ? '1.5px dashed #A8B4C8' : '1.5px dashed #C8D4E0')
                      : (isSelected
                          ? `2px solid ${C.rose}`
                          : isHovered
                            ? `1.5px solid ${C.rose}`
                            : '1.5px solid rgba(72,149,236,0.20)'),
                    transition: 'all 0.15s',
                    boxShadow: isSelected && !outside ? '0 2px 8px rgba(72,149,236,0.35)' : 'none',
                    userSelect: 'none',
                  }}
                >
                  {dayNum}
                </div>

                {/* 超出標記 */}
                {outside && (
                  <div style={{
                    fontSize: 9, color: '#B0BECF', fontWeight: 600,
                    lineHeight: 1.2, whiteSpace: 'nowrap',
                  }}>
                    延伸
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* scroll-hint CSS（只在小螢幕顯示）*/}
      <style>{`
        .iop-slider-scroll-hint {
          display: none;
          align-items: center;
          gap: 4px;
          border: 1px solid ${C.roseBorder};
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(72,149,236,0.10);
          color: ${C.rose};
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          flex-shrink: 0;
        }
        @media (max-width: 1024px) {
          .iop-slider-scroll-hint {
            display: inline-flex;
          }
        }
      `}</style>
    </div>
  );
}
