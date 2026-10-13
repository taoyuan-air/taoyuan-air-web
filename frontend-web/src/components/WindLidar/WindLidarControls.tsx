'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PanelKey, StationInfo } from '@/lib/windLidarApi';

// ── Design tokens（與 events/page.tsx 一致） ──────────────────────────────────
const C = {
  rose:       '#D4567A',
  roseAlpha:  'rgba(212,86,122,0.10)',
  roseBorder: 'rgba(212,86,122,0.28)',
  glass:      'rgba(255,255,255,0.90)',
  glassShadow:'0 4px 20px rgba(180,140,160,0.12)',
  text:       '#1a1220',
  muted:      '#7a6880',
  hint:       '#b0a0b8',
};

// ── 面板中文標籤 ──────────────────────────────────────────────────────────────
export const PANEL_LABELS: Record<PanelKey, string> = {
  wind_direction: '水平風向',
  vertical_wind:  '垂直風向',
  wind_speed:     '水平風速',
  turbulence:     '亂流強度',
  cnr:            '訊號強度',
};

const ALL_PANELS: PanelKey[] = ['wind_direction', 'vertical_wind', 'wind_speed', 'turbulence', 'cnr'];

// ── 高度上限選項 ──────────────────────────────────────────────────────────────
const HEIGHT_OPTIONS = [0.5, 1.0, 1.5];

// ── Props ─────────────────────────────────────────────────────────────────────
export interface WindLidarControlsProps {
  stations: StationInfo[];
  selectedStation: string;
  selectedDate: string;
  heightMax: number;
  panelVisibility: Record<PanelKey, boolean>;
  loading: boolean;
  onStationChange: (station: string) => void;
  onDateChange: (date: string) => void;
  onHeightMaxChange: (km: number) => void;
  onPanelVisibilityChange: (panel: PanelKey, visible: boolean) => void;
}

// ── 測站下拉選單（與 FlightDropdown 相同風格） ────────────────────────────────
function StationDropdown({
  stations,
  selected,
  onSelect,
  disabled,
}: {
  stations: StationInfo[];
  selected: string;
  onSelect: (s: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
          background: C.glass,
          border: `1px solid ${C.roseBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: 700, color: C.rose,
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        {selected || '選擇測站'}
        <ChevronDown
          size={14}
          strokeWidth={2.5}
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 400,
            background: '#fff',
            border: `1px solid ${C.roseBorder}`,
            borderRadius: 12, boxShadow: '0 8px 32px rgba(180,140,160,0.18)',
            minWidth: 180, overflow: 'hidden',
          }}
        >
          {stations.map((s, i) => (
            <button
              key={s.station}
              onClick={() => { onSelect(s.station); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 16px',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: selected === s.station ? 700 : 500,
                color: selected === s.station ? C.rose : C.text,
                background: selected === s.station ? C.roseAlpha : 'transparent',
                borderBottom: i < stations.length - 1 ? '1px solid rgba(180,140,160,0.08)' : 'none',
              }}
            >
              {s.station}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 日期月曆選擇器 ────────────────────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 從 YYYY-MM-DD 字串取出 { year, month(1-12), day } */
function parseDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return { year: y, month: m, day };
}

/** 產生某年某月的日曆格子（含前後補位），每格 null 表示空白 */
function buildCalendarGrid(year: number, month: number): (number | null)[] {
  if (!year || !month || isNaN(year) || isNaN(month)) return [];
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // 補尾到 7 的倍數
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DateCalendar({
  dates,
  selected,
  onSelect,
  disabled,
}: {
  dates: string[];     // YYYY-MM-DD，降冪排序（最新在前）
  selected: string;
  onSelect: (d: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 有資料的日期 Set（快速查詢）
  const dateSet = new Set(dates);

  // 從 dates 推算可瀏覽的月份範圍
  const months = Array.from(
    new Set(dates.map((d) => d.slice(0, 7)))
  ).sort(); // 升冪，e.g. ['2026-03', '2026-04']

  // 目前顯示的月份，預設為選取日期所在月份（或最新月份）
  const defaultMonth = selected ? selected.slice(0, 7) : (months[months.length - 1] ?? '');
  const [viewMonth, setViewMonth] = useState(defaultMonth);

  // 當 selected 或 dates 改變時，同步 viewMonth
  useEffect(() => {
    const target = selected ? selected.slice(0, 7) : (months[months.length - 1] ?? '');
    if (target) setViewMonth(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, dates.join(',')]);

  // 點選外部關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const parts = viewMonth ? viewMonth.split('-').map(Number) : [];
  const [viewYear, viewMonthNum] = parts.length === 2 ? parts : [NaN, NaN];
  const cells = (viewYear && viewMonthNum) ? buildCalendarGrid(viewYear, viewMonthNum) : [];

  const monthIdx = months.indexOf(viewMonth);
  const canPrev = monthIdx > 0;
  const canNext = monthIdx < months.length - 1;

  const handlePrev = () => { if (canPrev) setViewMonth(months[monthIdx - 1]); };
  const handleNext = () => { if (canNext) setViewMonth(months[monthIdx + 1]); };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* 觸發按鈕 */}
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: C.glass,
          border: `1px solid ${C.roseBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: 700, color: C.rose,
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s',
          minWidth: 130,
        }}
      >
        {selected || '選擇日期'}
        <ChevronDown
          size={14}
          strokeWidth={2.5}
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {/* 月曆彈出層 */}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 400,
            background: '#fff',
            border: `1px solid ${C.roseBorder}`,
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(180,140,160,0.18)',
            padding: '14px 16px 16px',
            width: 252,
          }}
        >
          {/* 月份導航列 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <button
              onClick={handlePrev}
              disabled={!canPrev}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: `1px solid ${canPrev ? C.roseBorder : 'rgba(180,140,160,0.12)'}`,
                background: 'transparent',
                color: canPrev ? C.rose : C.hint,
                cursor: canPrev ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexShrink: 0,
              }}
              aria-label="上個月"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>

            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {viewYear} 年 {String(viewMonthNum).padStart(2, '0')} 月
            </span>

            <button
              onClick={handleNext}
              disabled={!canNext}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: `1px solid ${canNext ? C.roseBorder : 'rgba(180,140,160,0.12)'}`,
                background: 'transparent',
                color: canNext ? C.rose : C.hint,
                cursor: canNext ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexShrink: 0,
              }}
              aria-label="下個月"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* 星期標頭 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            marginBottom: 4,
          }}>
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 700,
                  color: C.hint, padding: '2px 0 6px',
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 日期格子 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, i) => {
              if (day === null) {
                return <div key={`empty-${i}`} />;
              }

              const dateStr = `${viewYear}-${String(viewMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasData = dateSet.has(dateStr);
              const isSelected = selected === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!hasData) return;
                    onSelect(dateStr);
                    setOpen(false);
                  }}
                  disabled={!hasData}
                  title={hasData ? dateStr : '無資料'}
                  style={{
                    width: '100%', aspectRatio: '1',
                    borderRadius: 8,
                    border: isSelected
                      ? `1.5px solid ${C.rose}`
                      : '1.5px solid transparent',
                    background: isSelected ? C.rose : 'transparent',
                    color: isSelected
                      ? '#fff'
                      : hasData ? C.text : 'rgba(180,160,170,0.45)',
                    fontSize: 12,
                    fontWeight: isSelected ? 800 : hasData ? 600 : 400,
                    cursor: hasData ? 'pointer' : 'default',
                    transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (hasData && !isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = C.roseAlpha;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-disabled={!hasData}
                >
                  {day}
                  {/* 有資料的日期底部加小圓點 */}
                  {hasData && !isSelected && (
                    <span style={{
                      position: 'absolute', bottom: 3, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 4, height: 4, borderRadius: '50%',
                      background: C.rose,
                      opacity: 0.6,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function WindLidarControls({
  stations,
  selectedStation,
  selectedDate,
  heightMax,
  panelVisibility,
  loading,
  onStationChange,
  onDateChange,
  onHeightMaxChange,
  onPanelVisibilityChange,
}: WindLidarControlsProps) {
  const currentStation = stations.find((s) => s.station === selectedStation);
  const dates = currentStation?.dates ?? [];

  return (
    <div
      style={{
        margin: '0 0 0',
        background: C.glass,
        border: '1px solid rgba(212,86,122,0.08)',
        borderRadius: 16,
        boxShadow: C.glassShadow,
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 第一列：測站 + 日期 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>測站</span>
        <StationDropdown
          stations={stations}
          selected={selectedStation}
          onSelect={onStationChange}
          disabled={loading || stations.length === 0}
        />
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>日期</span>
        <DateCalendar
          dates={dates}
          selected={selectedDate}
          onSelect={onDateChange}
          disabled={loading || dates.length === 0}
        />
      </div>

      {/* 分隔線 */}
      <div style={{ height: 1, background: 'rgba(180,140,160,0.10)' }} />

      {/* 第二列：高度上限 + 面板顯示 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* 高度上限 */}
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, whiteSpace: 'nowrap' }}>
          高度上限
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {HEIGHT_OPTIONS.map((km) => {
            const active = heightMax === km;
            return (
              <button
                key={km}
                onClick={() => onHeightMaxChange(km)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1.5px solid ${active ? C.rose : C.roseBorder}`,
                  background: active ? C.rose : 'transparent',
                  color: active ? '#fff' : C.rose,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {km} km
              </button>
            );
          })}
        </div>

        {/* 小分隔 */}
        <div style={{ width: 1, height: 24, background: 'rgba(180,140,160,0.20)', margin: '0 4px' }} />

        {/* 面板顯示勾選 */}
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, whiteSpace: 'nowrap' }}>
          顯示面板
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ALL_PANELS.map((key) => {
            const active = panelVisibility[key];
            return (
              <button
                key={key}
                onClick={() => onPanelVisibilityChange(key, !active)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1.5px solid ${active ? C.rose : C.roseBorder}`,
                  background: active ? C.roseAlpha : 'transparent',
                  color: active ? C.rose : C.muted,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                aria-pressed={active}
              >
                {/* 小圓點指示 */}
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: active ? C.rose : 'rgba(180,140,160,0.4)',
                }} />
                {PANEL_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
