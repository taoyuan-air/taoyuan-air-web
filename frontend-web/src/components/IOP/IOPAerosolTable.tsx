'use client';

/**
 * IOPAerosolTable — 氣膠化學分析資料表
 *
 * 功能：
 * - 左側固定欄（sticky）：測站、粒徑、採樣日期
 * - 右側化學成分欄：水平可捲動
 * - pm_size 篩選（PM2.5 / PM1 / 全部）
 * - 測站篩選（動態從資料取得）
 * - 欄位選擇 panel
 * - 下載 CSV 按鈕
 * - 標記值（NA / ND / NQ / N/A）以灰色顯示
 */

import { useEffect, useRef, useState } from 'react';
import { Download, SlidersHorizontal, X, Check } from 'lucide-react';
import {
  fetchAerosol,
  getAerosolCSVUrl,
  type AerosolSample,
  type AerosolVariable,
} from '@/lib/iopApi';

const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
  text:        '#0F1D3A',
  stickyBg:    '#FFFFFF',
};

// 可能的標記值（非數值）
const FLAG_VALUES = new Set(['NA', 'ND', 'NQ', 'N/A', 'N.D.']);

function isFlag(val: number | string | null | undefined): boolean {
  return val === null || val === undefined || (typeof val === 'string' && FLAG_VALUES.has(val));
}

type PmFilter = 'all' | 'PM2.5' | 'PM1';

interface Props {
  iopId: string;
  iopStart: string;
  iopEnd: string;
}

// ── 欄位選擇 Panel ────────────────────────────────────────────────────────────
function ColumnPanel({
  variables,
  shownIds,
  onChange,
  onClose,
}: {
  variables: AerosolVariable[];
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
        width: 280,
        background: '#fff',
        border: `1px solid ${C.roseBorder}`,
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(30,58,95,0.18)',
        display: 'flex', flexDirection: 'column',
        maxHeight: 420,
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
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>顯示化學成分欄位</span>
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

      {/* 成分列表 */}
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
                {v.variables_name}
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
export default function IOPAerosolTable({ iopId }: Props) {
  const [pmFilter, setPmFilter]     = useState<PmFilter>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [variables, setVariables]   = useState<AerosolVariable[]>([]);
  const [samples, setSamples]       = useState<AerosolSample[]>([]);
  // 「所有測站」清單獨立保存，不隨篩選結果縮減
  const [allSites, setAllSites]     = useState<string[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [shownIds, setShownIds]     = useState<Set<number>>(new Set());
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

    fetchAerosol(
      iopId,
      pmFilter === 'all' ? undefined : pmFilter,
      siteFilter === 'all' ? undefined : siteFilter,
    )
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setVariables(data.variables);
        setSamples(data.samples);
        // 只在「全部站」時更新測站清單，避免篩選後清單縮減
        if (siteFilter === 'all') {
          setAllSites(Array.from(new Set(data.samples.map((s) => s.site))).sort());
        }
        // 首次載入時預設全選所有欄位（氣膠成分數量少，不需要預設篩選）
        setShownIds((prev) => {
          if (prev.size === 0) {
            return new Set(data.variables.map((v) => v.variables_id));
          }
          return prev;
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
  }, [iopId, pmFilter, siteFilter]);

  const shownVars = variables.filter((v) => shownIds.has(v.variables_id));

  const csvUrl = getAerosolCSVUrl(
    iopId,
    pmFilter === 'all' ? undefined : pmFilter,
    siteFilter === 'all' ? undefined : siteFilter,
  );

  const handleColumnChange = (id: number, shown: boolean) => {
    setShownIds((prev) => {
      const next = new Set(prev);
      if (shown) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // sticky 欄寬與左偏移
  // 測站: 90px  粒徑: 72px  採樣日期: 108px
  const COL = {
    site:    { left: 0,   width: 90  },
    pm_size: { left: 90,  width: 72  },
    date:    { left: 162, width: 108 },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── 篩選列 ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* 左側：粒徑篩選 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex', gap: 6, padding: '5px',
              background: 'rgba(255,255,255,0.70)',
              borderRadius: 999,
              border: `1px solid ${C.roseBorder}`,
              boxShadow: C.glassShadow,
            }}
          >
            {(['all', 'PM2.5', 'PM1'] as PmFilter[]).map((pm) => {
              const isActive = pm === pmFilter;
              return (
                <button
                  key={pm}
                  onClick={() => { setPmFilter(pm); setSiteFilter('all'); }}
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
                  {pm === 'all' ? '全部粒徑' : pm}
                </button>
              );
            })}
          </div>

          {/* 測站篩選（動態，有多站時才顯示） */}
          {allSites.length > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, marginLeft: 15, marginRight: 10 }}>測站</span>
              {(['all', ...allSites]).map((s) => {
                const isActive = siteFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSiteFilter(s)}
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
        </div>

        {/* 右側：欄位選擇 + 下載 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          目前無資料
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
            background: '#fff', flexWrap: 'wrap',
          }}>
            <span>共 {samples.length} 筆濾紙採樣</span>
            <span style={{ color: '#B0BECF' }}>
              NA／ND／NQ 為標記值（未分析／未檢出／未定量）
            </span>
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
                  <th style={thStyle(true,  COL.site.left,    COL.site.width)}>測站</th>
                  <th style={thStyle(true,  COL.pm_size.left,  COL.pm_size.width)}>粒徑</th>
                  <th style={thStyle(true,  COL.date.left,     COL.date.width)}>採樣日期</th>
                  {shownVars.map((v) => (
                    <th key={v.variables_id} style={thStyle(false)}>
                      <div style={{ whiteSpace: 'nowrap' }}>{v.variables_name}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: C.hint }}>{v.unit}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((s, idx) => {
                  const isOdd = idx % 2 === 1;
                  const rowBg = isOdd ? '#F8FAFE' : '#FFFFFF';
                  return (
                    <tr key={s.sample_id}>
                      <td style={tdStyle(true,  COL.site.left,    COL.site.width,    false, rowBg)}>{s.site}</td>
                      <td style={tdStyle(true,  COL.pm_size.left,  COL.pm_size.width, false, rowBg)}>
                        <span
                          style={{
                            padding: '2px 8px', borderRadius: 999,
                            background: s.pm_size === 'PM1'
                              ? 'rgba(72,149,236,0.10)'
                              : 'rgba(72,149,236,0.05)',
                            border: `1px solid ${s.pm_size === 'PM1'
                              ? 'rgba(72,149,236,0.30)'
                              : 'rgba(72,149,236,0.15)'}`,
                            fontSize: 11, fontWeight: 700,
                            color: C.rose,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.pm_size}
                        </span>
                      </td>
                      <td style={tdStyle(true,  COL.date.left,    COL.date.width,    false, rowBg)}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.sample_date}
                        </span>
                      </td>
                      {shownVars.map((v) => {
                        const val = s.values[String(v.variables_id)];
                        const flagged = isFlag(val);
                        return (
                          <td key={v.variables_id} style={tdStyle(false, 0, undefined, true, rowBg)}>
                            <span style={{ color: flagged ? '#B0BECF' : C.text }}>
                              {flagged
                                ? (val === null || val === undefined ? '—' : String(val))
                                : typeof val === 'number'
                                  ? val.toFixed(3)
                                  : String(val)}
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
function thStyle(sticky: boolean, left = 0, width?: number): React.CSSProperties {
  return {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 800,
    color: '#4A6080',
    background: '#FFFFFF',
    borderBottom: '2px solid rgba(72,149,236,0.12)',
    whiteSpace: 'nowrap',
    ...(width !== undefined ? { width, minWidth: width, maxWidth: width } : {}),
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
  width?: number,
  numeric = false,
  bg = '#FFFFFF',
): React.CSSProperties {
  return {
    padding: '9px 14px',
    borderBottom: '1px solid rgba(30,58,95,0.06)',
    fontSize: 12,
    color: '#0F1D3A',
    background: bg,
    textAlign: numeric ? 'right' : 'left',
    fontVariantNumeric: numeric ? 'tabular-nums' : 'normal',
    whiteSpace: 'nowrap',
    ...(width !== undefined ? { width, minWidth: width, maxWidth: width } : {}),
    ...(sticky ? {
      position: 'sticky',
      left,
      zIndex: 5,
      boxShadow: '2px 0 6px rgba(30,58,95,0.08)',
    } : {}),
  };
}
