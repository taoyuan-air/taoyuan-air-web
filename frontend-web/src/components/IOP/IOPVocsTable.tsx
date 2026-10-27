'use client';

/**
 * IOPVocsTable — VOCs 採樣資料表
 *
 * 功能：
 * - 左側固定欄（sticky）：測站、採樣時間、批次（UAV）、高度（UAV）、罐號
 * - 右側物種欄：水平可捲動，固定高度垂直可捲動
 * - 右上角「顯示欄位」panel：59 種物種，可勾選
 * - 測站篩選（Guanyin / Dayuan / 全部）
 * - 下載 CSV 按鈕
 * - 超出 IOP 日期的列：淡灰色背景（完全不透明，不與右側捲動欄重疊）
 */

import { useEffect, useRef, useState } from 'react';
import { Download, SlidersHorizontal, X, Check } from 'lucide-react';
import {
  fetchVOCs,
  getVocsCSVUrl,
  type VOCsSample,
  type VOCsVariable,
} from '@/lib/iopApi';

const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glass:       'rgba(255,255,255,0.90)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
  text:        '#0F1D3A',
  // 完全不透明的 sticky 欄背景（避免右側捲動內容透出來）
  stickyBg:       '#FFFFFF',
  stickyBgOdd:    '#F8FAFE',    // 正常列（偶數行變色方案備用）
  stickyBgOut:    '#F2F4F7',    // 超出 IOP 期間的列（灰色，完全不透明）
  rowBgOut:       '#F5F6F8',    // 超出列的非 sticky 欄背景
};

// 預設顯示物種（常見 VOCs）
const DEFAULT_SHOWN_IDS = new Set([1, 2, 3, 4, 5, 6, 10, 12, 20, 25, 34, 38, 39, 41, 56, 57]);

type SamplingTab = 'trigger' | 'uav';
type SiteFilter = 'all' | 'Guanyin' | 'Dayuan';

interface Props {
  iopId: string;
  iopStart: string;
  iopEnd: string;
  defaultTab?: SamplingTab;
}

function isOutside(sampleTime: string, start: string, end: string): boolean {
  const d = sampleTime.slice(0, 10);
  return d < start || d > end;
}

// ── 欄位選擇 Panel ────────────────────────────────────────────────────────────
function ColumnPanel({
  variables,
  shownIds,
  onChange,
  onClose,
}: {
  variables: VOCsVariable[];
  shownIds: Set<number>;
  onChange: (id: number, shown: boolean) => void;
  onClose: () => void;
}) {
  const allChecked  = variables.every((v) => shownIds.has(v.variables_id));
  const noneChecked = variables.every((v) => !shownIds.has(v.variables_id));

  return (
    <div
      style={{
        position: 'absolute', top: 0, right: 0, zIndex: 600,
        width: 300,
        background: '#fff',
        border: `1px solid ${C.roseBorder}`,
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(30,58,95,0.18)',
        display: 'flex', flexDirection: 'column',
        maxHeight: 480,
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label="選擇顯示欄位"
    >
      {/* 標頭 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(30,58,95,0.08)',
          flexShrink: 0,
          background: '#fff',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>顯示物種欄位</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => variables.forEach((v) => onChange(v.variables_id, true))}
            style={{
              fontSize: 11, fontWeight: 700, color: allChecked ? C.hint : C.rose,
              background: 'none', border: 'none', cursor: allChecked ? 'default' : 'pointer',
              padding: '2px 6px', fontFamily: 'inherit',
            }}
            disabled={allChecked}
          >
            全選
          </button>
          <button
            onClick={() => variables.forEach((v) => onChange(v.variables_id, false))}
            style={{
              fontSize: 11, fontWeight: 700, color: noneChecked ? C.hint : C.muted,
              background: 'none', border: 'none', cursor: noneChecked ? 'default' : 'pointer',
              padding: '2px 6px', fontFamily: 'inherit',
            }}
            disabled={noneChecked}
          >
            全不選
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.hint, display: 'flex', alignItems: 'center', padding: 4,
            }}
            aria-label="關閉"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 物種列表 */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0', background: '#fff' }}>
        {variables.map((v) => {
          const checked = shownIds.has(v.variables_id);
          return (
            <label
              key={v.variables_id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 18px', cursor: 'pointer',
                background: checked ? C.roseAlpha : 'transparent',
                transition: 'background-color 0.1s',
              }}
            >
              <div
                style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${checked ? C.rose : 'rgba(30,58,95,0.25)'}`,
                  background: checked ? C.rose : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}
              >
                {checked && <Check size={11} color="#fff" strokeWidth={3} />}
              </div>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(v.variables_id, e.target.checked)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
                {v.variables_id}. {v.variables_name}
              </span>
              <span style={{ fontSize: 11, color: C.hint }}>{v.unit}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function IOPVocsTable({ iopId, iopStart, iopEnd, defaultTab = 'trigger' }: Props) {
  const [activeTab, setActiveTab] = useState<SamplingTab>(defaultTab);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all');
  const [variables, setVariables]   = useState<VOCsVariable[]>([]);
  const [samples, setSamples]       = useState<VOCsSample[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [shownIds, setShownIds]     = useState<Set<number>>(DEFAULT_SHOWN_IDS);
  const [panelOpen, setPanelOpen]   = useState(false);
  const mountedRef = useRef(true);
  const panelRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 點外部關閉 panel
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  // 載入資料
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchVOCs(iopId, activeTab, siteFilter === 'all' ? undefined : siteFilter)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setVariables(data.variables);
        setSamples(data.samples);
        setShownIds((prev) => {
          const next = new Set(prev);
          data.variables.forEach((v) => {
            if (DEFAULT_SHOWN_IDS.has(v.variables_id)) next.add(v.variables_id);
          });
          return next;
        });
      })
      .catch((err: Error) => {
        if (cancelled || !mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [iopId, activeTab, siteFilter]);

  const shownVars = variables.filter((v) => shownIds.has(v.variables_id));
  const isUAV = activeTab === 'uav';

  const csvUrl = getVocsCSVUrl(
    iopId,
    activeTab,
    siteFilter === 'all' ? undefined : siteFilter,
  );

  const allSites = Array.from(new Set(samples.map((s) => s.site))).sort();

  const handleColumnChange = (id: number, shown: boolean) => {
    setShownIds((prev) => {
      const next = new Set(prev);
      if (shown) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // sticky 欄的左偏移量（非 UAV 和 UAV 模式不同）
  // trigger: 測站(0) 採樣時間(80) 罐號(210)
  // uav:     測站(0) 採樣時間(80) 批次(210) 高度(270) 罐號(340)
  const COL_LEFT = {
    site:       0,
    time:       80,
    batch:      210,
    height:     270,
    canister:   isUAV ? 340 : 210,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── 採樣類型 tab ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            display: 'flex', gap: 6, padding: '5px',
            background: 'rgba(255,255,255,0.70)',
            borderRadius: 999,
            border: `1px solid ${C.roseBorder}`,
            boxShadow: C.glassShadow,
          }}
        >
          {(['trigger', 'uav'] as SamplingTab[]).map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSiteFilter('all'); }}
                style={{
                  padding: '7px 18px', borderRadius: 999, border: 'none',
                  cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 800 : 600,
                  color: isActive ? '#fff' : C.muted,
                  background: isActive ? C.rose : 'transparent',
                  boxShadow: isActive ? '0 2px 10px rgba(72,149,236,0.30)' : 'none',
                  transition: 'all 0.15s', fontFamily: 'inherit',
                }}
                aria-pressed={isActive}
              >
                {tab === 'trigger' ? '觸發採樣 (Trigger)' : '無人機採樣 (UAV VOCs)'}
              </button>
            );
          })}
        </div>

        {/* 右側控制 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 測站篩選 */}
          {allSites.length > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.hint }}>測站</span>
              {(['all', ...allSites] as (SiteFilter | string)[]).map((s) => {
                const isActive = siteFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSiteFilter(s as SiteFilter)}
                    style={{
                      padding: '5px 12px', borderRadius: 999,
                      border: `1px solid ${isActive ? C.rose : 'rgba(72,149,236,0.20)'}`,
                      background: isActive ? C.roseAlpha : 'transparent',
                      color: isActive ? C.rose : C.muted,
                      fontSize: 11, fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.12s',
                    }}
                    aria-pressed={isActive}
                  >
                    {s === 'all' ? '全部' : s}
                  </button>
                );
              })}
            </div>
          )}

          {/* 欄位選擇 */}
          <div style={{ position: 'relative' }} ref={panelRef}>
            <button
              onClick={() => setPanelOpen((o) => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 999,
                border: `1px solid ${panelOpen ? C.rose : C.roseBorder}`,
                background: panelOpen ? C.roseAlpha : '#fff',
                color: panelOpen ? C.rose : C.muted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                boxShadow: C.glassShadow, fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              aria-expanded={panelOpen}
            >
              <SlidersHorizontal size={13} strokeWidth={2.2} />
              顯示欄位 ({shownIds.size})
            </button>
            {panelOpen && (
              <ColumnPanel
                variables={variables}
                shownIds={shownIds}
                onChange={handleColumnChange}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </div>

          {/* 下載 CSV */}
          <a
            href={csvUrl}
            download
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 999,
              border: `1px solid ${C.roseBorder}`,
              background: '#fff',
              color: C.muted,
              fontSize: 12, fontWeight: 700,
              textDecoration: 'none',
              boxShadow: C.glassShadow,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            title="下載 CSV（UTF-8 BOM，Excel 可直接開啟）"
          >
            <Download size={13} strokeWidth={2.2} />
            下載 CSV
          </a>
        </div>
      </div>

      {/* ── 資料表 ── */}
      {loading ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: C.hint,
          background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
          fontSize: 14, fontWeight: 600, border: '1px solid rgba(72,149,236,0.08)' }}>
          載入中…
        </div>
      ) : error ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: '#c0392b',
          background: 'rgba(192,57,43,0.07)', borderRadius: 16,
          fontSize: 14, fontWeight: 600 }}>
          ⚠ {error}
        </div>
      ) : samples.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: C.hint,
          background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
          fontSize: 14, fontWeight: 600, border: '1px solid rgba(72,149,236,0.08)' }}>
          {siteFilter !== 'all'
            ? `${siteFilter} 站無 ${activeTab === 'trigger' ? '觸發採樣' : '無人機採樣'} 資料`
            : '目前無資料'}
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid rgba(72,149,236,0.08)',
            borderRadius: 16,
            boxShadow: C.glassShadow,
            overflow: 'hidden',
          }}
        >
          {/* 說明列 */}
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid rgba(30,58,95,0.07)',
            fontSize: 12, color: C.hint, fontWeight: 500,
            display: 'flex', gap: 16, alignItems: 'center',
            background: '#fff',
          }}>
            <span>共 {samples.length} 筆採樣</span>
            {samples.some((s) => isOutside(s.sample_time, iopStart, iopEnd)) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  background: C.stickyBgOut, border: '1px solid #C8D4E0',
                  borderRadius: 2,
                }} />
                灰底列為超出 IOP 官方期間的延伸資料
              </span>
            )}
          </div>

          {/* 捲動容器 */}
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <table
              style={{
                borderCollapse: 'separate', borderSpacing: 0,
                width: 'max-content', minWidth: '100%',
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle(true, COL_LEFT.site)}>測站</th>
                  <th style={thStyle(true, COL_LEFT.time)}>採樣時間</th>
                  {isUAV && <th style={thStyle(true, COL_LEFT.batch)}>批次</th>}
                  {isUAV && <th style={thStyle(true, COL_LEFT.height)}>高度 (m)</th>}
                  <th style={thStyle(true, COL_LEFT.canister)}>罐號</th>
                  {shownVars.map((v) => (
                    <th key={v.variables_id} style={thStyle(false)}>
                      <div style={{ whiteSpace: 'nowrap' }}>{v.variables_name}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: C.hint }}>{v.unit}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples
                  .slice()
                  .sort((a, b) => a.sample_time.localeCompare(b.sample_time))
                  .map((s) => {
                    const outside = isOutside(s.sample_time, iopStart, iopEnd);
                    const stickyBg = outside ? C.stickyBgOut : C.stickyBg;
                    const rowBg    = outside ? C.rowBgOut    : C.stickyBg;
                    return (
                      <tr
                        key={s.sample_id}
                        title={outside ? `${s.sample_time.slice(0, 10)} 超出 IOP 官方期間` : undefined}
                      >
                        <td style={tdStyle(true,  COL_LEFT.site,     outside, false, stickyBg)}>{s.site}</td>
                        <td style={tdStyle(true,  COL_LEFT.time,     outside, false, stickyBg)}>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {s.sample_time}
                          </span>
                        </td>
                        {isUAV && (
                          <td style={tdStyle(true, COL_LEFT.batch,   outside, false, stickyBg)}>
                            {s.batch ?? '—'}
                          </td>
                        )}
                        {isUAV && (
                          <td style={tdStyle(true, COL_LEFT.height,  outside, false, stickyBg)}>
                            {s.height_m != null ? s.height_m : '—'}
                          </td>
                        )}
                        <td style={tdStyle(true,  COL_LEFT.canister, outside, false, stickyBg)}>
                          {s.canister_no}
                        </td>
                        {shownVars.map((v) => {
                          const val = s.values[String(v.variables_id)];
                          const isND = val === 'N.D.' || val === null || val === undefined;
                          return (
                            <td key={v.variables_id} style={tdStyle(false, 0, outside, true, rowBg)}>
                              <span style={{ color: isND ? '#B0BECF' : outside ? C.muted : C.text }}>
                                {isND ? 'N.D.' : typeof val === 'number' ? val.toFixed(3) : String(val)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table style helpers ───────────────────────────────────────────────────────
// 背景色傳入，確保完全不透明（sticky 欄不會被右側捲動內容透出）

function thStyle(sticky: boolean, left = 0): React.CSSProperties {
  return {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 800,
    color: C.muted,
    background: '#FFFFFF',           // 完全不透明
    borderBottom: '2px solid rgba(72,149,236,0.12)',
    whiteSpace: 'nowrap',
    ...(sticky ? {
      position: 'sticky',
      left,
      zIndex: 10,
      boxShadow: '2px 0 6px rgba(30,58,95,0.08)',
    } : {}),
  };
}

function tdStyle(
  sticky: boolean,
  left = 0,
  outside = false,
  numeric = false,
  bg = '#FFFFFF',
): React.CSSProperties {
  return {
    padding: '9px 14px',
    borderBottom: '1px solid rgba(30,58,95,0.06)',
    fontSize: 12,
    color: outside ? C.hint : C.text,
    background: bg,                  // 傳入完全不透明色
    textAlign: numeric ? 'right' : 'left',
    fontVariantNumeric: numeric ? 'tabular-nums' : 'normal',
    whiteSpace: 'nowrap',
    ...(sticky ? {
      position: 'sticky',
      left,
      zIndex: 5,
      boxShadow: '2px 0 6px rgba(30,58,95,0.08)',
    } : {}),
  };
}
