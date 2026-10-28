'use client';

/**
 * IOPView — IOP 密集觀測主視圖
 *
 * 結構：
 * 1. IOP 選擇畫面（橫向卡片）
 * 2. 點選卡片 → expand 動畫展開詳細內容（wind-lidar / vocs sub-tab）
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Wind, FlaskConical, Microscope, Calendar, MapPin, BarChart3 } from 'lucide-react';
import { fetchIOPs, type IOPSummary } from '@/lib/iopApi';
import { fetchStations, type StationInfo } from '@/lib/windLidarApi';
import IOPWindLidar from './IOPWindLidar';
import IOPVocsTable from './IOPVocsTable';

const C = {
  rose:        '#4895EC',
  roseAlpha:   'rgba(72,149,236,0.10)',
  roseBorder:  'rgba(72,149,236,0.28)',
  glass:       'rgba(255,255,255,0.90)',
  glassBorder: 'rgba(255,255,255,0.72)',
  glassShadow: '0 4px 20px rgba(30,58,95,0.12)',
  text:        '#0F1D3A',
  muted:       '#4A6080',
  hint:        '#7A9AC0',
};

const MONTH_ZH = [
  '1月','2月','3月','4月','5月','6月',
  '7月','8月','9月','10月','11月','12月',
];

function formatDateZH(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${MONTH_ZH[parseInt(m, 10) - 1]}${parseInt(d, 10)}日`;
}

/** 計算 IOP 官方觀測天數 */
function calcDays(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
  ) + 1;
}

/** 從風光達 dates 計算屬於此 IOP 的天數（含延伸） */
function calcWindDays(dates: string[], iopStart: string): number {
  return dates.filter((d) => {
    const diff = (new Date(d).getTime() - new Date(iopStart).getTime()) / 86400000;
    return diff >= -5 && diff <= 60;
  }).length;
}

type IOPSubTab = 'wind-lidar' | 'vocs';

// ── IOP 選擇卡片（橫向） ─────────────────────────────────────────────────────
function IOPCard({
  iop,
  windDays,
  onClick,
}: {
  iop: IOPSummary;
  windDays: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasVocsData = iop.trigger_samples > 0 || iop.uav_samples > 0;
  const officialDays = calcDays(iop.start_date, iop.end_date);
  const startZH = formatDateZH(iop.start_date);
  const endZH   = formatDateZH(iop.end_date);

  // IOP 序號（IOP1 → 1）
  const iopNum = iop.iop_id.replace('IOP', '');

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 0,
        padding: 0,
        background: hovered ? 'rgba(72,149,236,0.04)' : '#fff',
        border: `2px solid ${hovered ? C.rose : C.roseBorder}`,
        borderRadius: 20,
        boxShadow: hovered
          ? '0 10px 36px rgba(72,149,236,0.20)'
          : C.glassShadow,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        fontFamily: 'inherit',
        overflow: 'hidden',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
      aria-label={`進入 ${iop.iop_name}`}
    >
      {/* 左側色塊 */}
      <div
        style={{
          width: 6,
          background: C.rose,
          flexShrink: 0,
          borderRadius: '18px 0 0 18px',
          opacity: hovered ? 1 : 0.45,
          transition: 'opacity 0.22s',
        }}
      />

      {/* 內容區 */}
      <div style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

        {/* 第一行：badge + 標題 + 描述 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: hovered ? C.rose : C.roseAlpha,
              border: `1.5px solid ${hovered ? C.rose : C.roseBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.22s',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 900,
              color: hovered ? '#fff' : C.rose,
              letterSpacing: '-0.3px',
            }}>
              IOP{iopNum}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: hovered ? C.rose : C.text, transition: 'color 0.2s' }}>
              {iop.iop_name}
            </div>
            <div style={{ fontSize: 12, color: C.hint, fontWeight: 500, marginTop: 2 }}>
              {iop.description}
            </div>
          </div>
        </div>

        {/* 第二行：日期 + 天數 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={13} strokeWidth={2} color={C.hint} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: hovered ? C.rose : C.muted, transition: 'color 0.2s' }}>
            {startZH} – {endZH}
          </span>
          <span
            style={{
              padding: '2px 9px', borderRadius: 999,
              background: hovered ? C.roseAlpha : 'rgba(72,149,236,0.06)',
              fontSize: 11, fontWeight: 700, color: C.rose,
              border: `1px solid ${hovered ? C.roseBorder : 'transparent'}`,
              transition: 'all 0.2s',
            }}
          >
            {officialDays} 天
          </span>
        </div>

        {/* 第三行：統計資訊格子 */}
        <div className="iop-stat-grid">
          {/* 風光達資料天數 */}
          <StatCell
            icon={<Wind size={13} strokeWidth={2} color={C.rose} />}
            label="風光達資料"
            value={windDays > 0 ? `${windDays} 天` : '—'}
            hovered={hovered}
          />
          {/* 觸發採樣 */}
          <StatCell
            icon={<BarChart3 size={13} strokeWidth={2} color={C.rose} />}
            label="觸發採樣"
            value={iop.trigger_samples > 0 ? `${iop.trigger_samples} 筆` : '—'}
            hovered={hovered}
          />
          {/* 無人機採樣 */}
          <StatCell
            icon={<MapPin size={13} strokeWidth={2} color={C.rose} />}
            label="無人機採樣"
            value={iop.uav_samples > 0 ? `${iop.uav_samples} 筆` : '—'}
            hovered={hovered}
          />
        </div>

        <style>{`
          .iop-stat-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          @media (max-width: 480px) {
            .iop-stat-grid {
              grid-template-columns: repeat(3, 1fr);
              gap: 6px;
            }
          }
        `}</style>

        {/* 第四行：VOCs 狀態 + 箭頭 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {!hasVocsData && (
            <span
              style={{
                padding: '4px 11px', borderRadius: 999,
                background: 'rgba(180,190,200,0.15)',
                fontSize: 11, fontWeight: 600, color: C.hint,
              }}
            >
              VOCs 資料整備中
            </span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12, fontWeight: 700,
              color: hovered ? C.rose : C.hint,
              transition: 'color 0.2s, transform 0.2s',
              transform: hovered ? 'translateX(3px)' : 'none',
            }}
          >
            查看觀測資料 →
          </span>
        </div>

      </div>
    </button>
  );
}

// 小格統計元件
function StatCell({
  icon,
  label,
  value,
  hovered,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hovered: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '10px 14px',
        borderRadius: 12,
        background: hovered ? 'rgba(72,149,236,0.07)' : 'rgba(72,149,236,0.04)',
        border: `1px solid ${hovered ? C.roseBorder : 'transparent'}`,
        transition: 'all 0.2s',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {icon}
        <span className="iop-stat-label">{label}</span>
      </div>
      <span className="iop-stat-value" style={{ color: value === '—' ? '#C8D4E0' : C.text }}>
        {value}
      </span>

      <style>{`
        .iop-stat-label {
          font-size: 10px;
          font-weight: 700;
          color: ${C.hint};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .iop-stat-value {
          font-size: 15px;
          font-weight: 900;
        }
        @media (max-width: 480px) {
          .iop-stat-label { font-size: 9px; }
          .iop-stat-value { font-size: 13px; }
        }
      `}</style>
    </div>
  );
}

// ── IOP 內部 sub-tab 列 ───────────────────────────────────────────────────────
function IOPSubTabBar({
  active,
  onChange,
}: {
  active: IOPSubTab;
  onChange: (t: IOPSubTab) => void;
}) {
  const tabs: { id: IOPSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'wind-lidar', label: 'Wind Lidar 風光達', icon: <Wind size={14} strokeWidth={2} /> },
    { id: 'vocs',       label: 'VOCs 採樣',          icon: <FlaskConical size={14} strokeWidth={2} /> },
  ];

  return (
    <div
      style={{
        display: 'flex', gap: 6, padding: '5px',
        background: 'rgba(255,255,255,0.70)',
        borderRadius: 999,
        border: `1px solid ${C.roseBorder}`,
        boxShadow: C.glassShadow,
        width: 'fit-content',
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 18px', borderRadius: 999, border: 'none',
              cursor: 'pointer', fontSize: 12,
              fontWeight: isActive ? 800 : 600,
              color: isActive ? '#fff' : C.muted,
              background: isActive ? C.rose : 'transparent',
              boxShadow: isActive ? '0 2px 10px rgba(72,149,236,0.30)' : 'none',
              transition: 'all 0.18s', fontFamily: 'inherit',
            }}
            aria-pressed={isActive}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Expand 動畫容器 ───────────────────────────────────────────────────────────
// 使用 CSS keyframes via <style> + className，避免 JS 動畫庫依賴
function ExpandPanel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes iop-expand {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(12px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .iop-expand-panel {
          animation: iop-expand 0.32s cubic-bezier(0.34, 1.40, 0.64, 1) both;
          transform-origin: top center;
        }
      `}</style>
      <div className="iop-expand-panel">{children}</div>
    </>
  );
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function IOPView() {
  const [iops, setIops]               = useState<IOPSummary[]>([]);
  const [stations, setStations]       = useState<StationInfo[]>([]);
  const [selectedIop, setSelectedIop] = useState<IOPSummary | null>(null);
  const [subTab, setSubTab]           = useState<IOPSubTab>('wind-lidar');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchIOPs(), fetchStations()])
      .then(([iopData, stationData]) => {
        if (!mountedRef.current) return;
        setIops(iopData);
        setStations(stationData);
      })
      .catch((err: Error) => {
        if (!mountedRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  const handleSelectIop = (iop: IOPSummary) => {
    setSelectedIop(iop);
    setSubTab('wind-lidar');
  };

  const handleBack = () => {
    setSelectedIop(null);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: C.hint,
        fontSize: 14, fontWeight: 600, background: '#fff', borderRadius: 16,
        boxShadow: C.glassShadow }}>
        載入中…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: '#c0392b',
        background: 'rgba(192,57,43,0.07)', borderRadius: 16, fontSize: 14, fontWeight: 600 }}>
        ⚠ {error}
      </div>
    );
  }

  const stationInfo = stations[0] ?? null;

  // ── IOP 選擇層 ─────────────────────────────────────────────────────────────
  if (!selectedIop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* 標題（統一樣式：圖標 + 大標 + 副標） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Microscope size={20} color={C.rose} strokeWidth={2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.rose, lineHeight: 1.2 }}>
              IOP 密集觀測
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: C.hint }}>
              選擇觀測期間，查看風光達與 VOCs 採樣資料
            </p>
          </div>
        </div>

        {/* IOP 卡片（一行兩欄，橫向；小螢幕單欄）*/}
        <div className="iop-card-grid">
          {iops.map((iop) => (
            <IOPCard
              key={iop.iop_id}
              iop={iop}
              windDays={stationInfo ? calcWindDays(stationInfo.dates, iop.start_date) : 0}
              onClick={() => handleSelectIop(iop)}
            />
          ))}
        </div>

        <style>{`
          .iop-card-grid {
            display: flex;
            gap: 20px;
            flex-wrap: nowrap;
          }
          /* 橫向時等分寬度 */
          .iop-card-grid > * {
            flex: 1 1 0;
            min-width: 0;
            width: 0;          /* 強制等分，防止內容撐開 */
          }
          @media (max-width: 780px) {
            .iop-card-grid {
              flex-direction: column;
            }
            /* 縱向時自然高度，佔滿寬度 */
            .iop-card-grid > * {
              flex: none;
              width: 100%;
            }
          }
        `}</style>
      </div>
    );
  }

  // ── IOP 詳細層（expand 動畫） ──────────────────────────────────────────────
  const startZH = formatDateZH(selectedIop.start_date);
  const endZH   = formatDateZH(selectedIop.end_date);

  return (
    <ExpandPanel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* 返回 + 標題列（統一樣式） */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <button
            onClick={handleBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 999,
              border: `1px solid ${C.roseBorder}`,
              background: '#fff',
              color: C.muted, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: C.glassShadow, transition: 'all 0.15s',
              flexShrink: 0, marginTop: 2,
            }}
            aria-label="返回 IOP 選擇"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            返回
          </button>

          {/* 圖標 + 標題（選擇頁有圖標，詳細頁簡化只保留文字） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.rose, lineHeight: 1.2 }}>
                  {selectedIop.iop_name}
                </h1>
                <span
                  style={{
                    fontSize: 12, fontWeight: 700, color: C.hint,
                    padding: '3px 10px', borderRadius: 999,
                    background: C.roseAlpha, border: `1px solid ${C.roseBorder}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {startZH} – {endZH}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: C.hint }}>
                {selectedIop.description}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tab 切換 */}
        <IOPSubTabBar active={subTab} onChange={setSubTab} />

        {/* Sub-tab 內容 */}
        <div>
          {subTab === 'wind-lidar' && (
            stationInfo ? (
              <IOPWindLidar
                stationInfo={stationInfo}
                iopStart={selectedIop.start_date}
                iopEnd={selectedIop.end_date}
              />
            ) : (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: C.hint,
                background: '#fff', borderRadius: 16, boxShadow: C.glassShadow,
                fontSize: 14, fontWeight: 600 }}>
                目前無可用風光達測站資料
              </div>
            )
          )}
          {subTab === 'vocs' && (
            <IOPVocsTable
              iopId={selectedIop.iop_id}
              iopStart={selectedIop.start_date}
              iopEnd={selectedIop.end_date}
            />
          )}
        </div>
      </div>
    </ExpandPanel>
  );
}
