'use client';

/**
 * IOPLcsTable — 微型感測器（LCS）逐時資料表
 *
 * 功能：
 * - 左側固定欄（sticky）：測站、時間
 * - 右側量測項目欄：水平可捲動
 * - 測站篩選、日期篩選
 * - 欄位選擇 panel
 * - 下載 CSV 按鈕
 * - QC 剔除以灰色「QC」顯示，缺值顯示「—」
 */

import { useEffect, useRef, useState } from 'react';
import { Download, SlidersHorizontal, X, Check, MapPin } from 'lucide-react';
import {
  fetchLCS,
  getLCSCSVUrl,
  type LCSSite,
  type LCSTable,
  type LCSVariable,
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
  variables: LCSVariable[];
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
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>顯示量測項目</span>
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
export default function IOPLcsTable({ iopId }: Props) {
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [dayFilter, setDayFilter]   = useState<string>('all');
  // 以「IOP＋測站」為 key 記錄已載入的結果，載入中 = 結果的 key 跟目前的不一樣
  const [result, setResult] = useState<{ key: string; table?: LCSTable; error?: string } | null>(null);
  // 「所有測站」清單獨立保存，不隨篩選結果縮減
  const [allSites, setAllSites] = useState<LCSSite[]>([]);
  // null = 全部顯示
  const [shownIds, setShownIds] = useState<Set<number> | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const site = siteFilter === 'all' ? undefined : siteFilter;
  const key = `${iopId}|${site ?? 'all'}`;

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
    fetchLCS(iopId, site)
      .then((table) => {
        if (cancelled) return;
        setResult({ key, table });
        if (!site) setAllSites(table.sites);
      })
      .catch((err: Error) => {
        if (!cancelled) setResult({ key, error: err.message });
      });
    return () => { cancelled = true; };
  }, [iopId, site, key]);

  const loading   = result?.key !== key;
  const table     = loading ? undefined : result?.table;
  const error     = loading ? undefined : result?.error;
  const variables = table?.variables ?? [];
  const allRows   = table?.rows ?? [];
  const days      = Array.from(new Set(allRows.map((r) => r.obs_time.slice(0, 10)))).sort();
  const rows      = dayFilter === 'all' ? allRows : allRows.filter((r) => r.obs_time.startsWith(dayFilter));
  const shownVars = variables.filter((v) => !shownIds || shownIds.has(v.variables_id));
  const qcCount   = rows.reduce(
    (n, r) => n + Object.values(r.values).filter((v) => v === 'QC').length, 0);

  const csvUrl = getLCSCSVUrl(iopId, site);

  const handleColumnChange = (id: number, shown: boolean) => {
    setShownIds((prev) => {
      const next = new Set(prev ?? variables.map((v) => v.variables_id));
      if (shown) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // sticky 欄寬與左偏移　測站: 90px　時間: 140px
  const COL = {
    site: { left: 0,  width: 90  },
    time: { left: 90, width: 140 },
  };

  const siteInfo = (allSites.length ? allSites : table?.sites ?? [])
    .filter((s) => !site || s.site === site);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── 篩選列 ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 測站篩選 */}
          <div
            style={{
              display: 'flex', gap: 6, padding: '5px',
              background: 'rgba(255,255,255,0.70)',
              borderRadius: 999,
              border: `1px solid ${C.roseBorder}`,
              boxShadow: C.glassShadow,
            }}
          >
            {(['all', ...allSites.map((s) => s.site)]).map((s) => {
              const isActive = s === siteFilter;
              return (
                <button
                  key={s}
                  onClick={() => { setSiteFilter(s); setDayFilter('all'); }}
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
                  {s === 'all' ? '全部測站' : s}
                </button>
              );
            })}
          </div>

          {/* 日期篩選 */}
          {days.length > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, marginLeft: 15, marginRight: 10 }}>日期</span>
              {(['all', ...days]).map((d) => {
                const isActive = dayFilter === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDayFilter(d)}
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
                    {d === 'all' ? '全部' : d.slice(5).replace('-', '/')}
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
              顯示欄位 ({shownVars.length})
            </button>
            {panelOpen && (
              <ColumnPanel
                variables={variables}
                shownIds={shownIds ?? new Set(variables.map((v) => v.variables_id))}
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
      ) : rows.length === 0 ? (
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
            <span>共 {rows.length} 筆逐時資料</span>
            {siteInfo.map((s) => (
              <span key={s.site} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} strokeWidth={2} />
                {s.site}
                {s.latitude !== null && s.longitude !== null && (
                  <span style={{ color: '#B0BECF' }}>
                    （{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}）
                  </span>
                )}
              </span>
            ))}
            <span style={{ color: '#B0BECF' }}>
              時間為該小時開始；— 為缺值{qcCount > 0 ? '、QC 為品管剔除' : ''}
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
                  <th style={thStyle(true, COL.site.left, COL.site.width)}>測站</th>
                  <th style={thStyle(true, COL.time.left, COL.time.width)}>時間</th>
                  {shownVars.map((v) => (
                    <th key={v.variables_id} style={thStyle(false)}>
                      <div style={{ whiteSpace: 'nowrap' }}>{v.variables_name}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, color: C.hint }}>{v.unit}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const rowBg = idx % 2 === 1 ? '#F8FAFE' : '#FFFFFF';
                  return (
                    <tr key={`${r.site}-${r.obs_time}`}>
                      <td style={tdStyle(true, COL.site.left, COL.site.width, false, rowBg)}>{r.site}</td>
                      <td style={tdStyle(true, COL.time.left, COL.time.width, false, rowBg)}>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.obs_time}</span>
                      </td>
                      {shownVars.map((v) => {
                        const val = r.values[String(v.variables_id)];
                        const isNumber = typeof val === 'number';
                        return (
                          <td key={v.variables_id} style={tdStyle(false, 0, undefined, true, rowBg)}>
                            <span style={{ color: isNumber ? C.text : '#B0BECF' }}>
                              {isNumber ? val.toFixed(v.unit === 'ppm' ? 3 : 1) : (val ?? '—')}
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
