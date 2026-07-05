'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
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
  wind_speed:     '水平風速',
  wind_direction: '風向',
  turbulence:     '亂流強度',
  cnr:            '訊號強度',
};

const ALL_PANELS: PanelKey[] = ['wind_speed', 'wind_direction', 'turbulence', 'cnr'];

// ── 高度上限選項 ──────────────────────────────────────────────────────────────
const HEIGHT_OPTIONS = [0.5, 1.0, 1.5, 2.0];

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

// ── 日期下拉選單 ──────────────────────────────────────────────────────────────
function DateDropdown({
  dates,
  selected,
  onSelect,
  disabled,
}: {
  dates: string[];
  selected: string;
  onSelect: (d: string) => void;
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

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 400,
            background: '#fff',
            border: `1px solid ${C.roseBorder}`,
            borderRadius: 12, boxShadow: '0 8px 32px rgba(180,140,160,0.18)',
            minWidth: 160, maxHeight: 260, overflowY: 'auto',
          }}
        >
          {dates.map((d, i) => (
            <button
              key={d}
              onClick={() => { onSelect(d); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 16px',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: selected === d ? 700 : 500,
                color: selected === d ? C.rose : C.text,
                background: selected === d ? C.roseAlpha : 'transparent',
                borderBottom: i < dates.length - 1 ? '1px solid rgba(180,140,160,0.06)' : 'none',
              }}
            >
              {d}
            </button>
          ))}
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
        <DateDropdown
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
