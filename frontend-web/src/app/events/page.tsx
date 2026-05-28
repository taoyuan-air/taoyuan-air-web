'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, Car,
  ChevronDown, Clock, Factory, MapPin,
  Minus, TrendingDown, TrendingUp, Users,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:       '#D4567A',
  primaryAlpha:  'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)',
  red:           '#E94C78',
  redAlpha:      'rgba(233,76,120,0.12)',
  redBorder:     'rgba(233,76,120,0.30)',
  amber:         '#D97706',
  amberAlpha:    'rgba(217,119,6,0.12)',
  amberBorder:   'rgba(217,119,6,0.28)',
  green:         '#059669',
  greenAlpha:    'rgba(5,150,105,0.12)',
  greenBorder:   'rgba(5,150,105,0.28)',
  glass:         'rgba(255,255,255,0.52)',
  glassBorder:   'rgba(255,255,255,0.72)',
  glassShadow:   '0 4px 16px rgba(180,140,160,0.10)',
  text:          '#1a1220',
  muted:         '#7a6880',
  hint:          '#b0a0b8',
};

const glassCard: React.CSSProperties = {
  backgroundColor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 20,
  boxShadow: C.glassShadow,
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  '工業聚集區': Factory,
  '大氣流入':   AlertTriangle,
  '交通排放':   Car,
  '區域性事件': AlertCircle,
};

const SEVERITY: Record<string, { color: string; alpha: string; border: string }> = {
  '高風險':  { color: C.red,   alpha: C.redAlpha,   border: C.redBorder   },
  '中等風險':{ color: C.amber, alpha: C.amberAlpha, border: C.amberBorder },
  '低風險':  { color: C.green, alpha: C.greenAlpha,  border: C.greenBorder },
};

/* 桃園各區中心座標 */
const LOCATION_COORDS: Record<string, { lat: number; lon: number; zoom?: number }> = {
  '觀音區': { lat: 25.017, lon: 121.103 },
  '蘆竹區': { lat: 25.072, lon: 121.262 },
  '中壢區': { lat: 24.969, lon: 121.224 },
  '大園區': { lat: 25.063, lon: 121.167 },
  '桃園區': { lat: 24.993, lon: 121.301 },
};

function buildMapUrl(location: string): string {
  const coord = LOCATION_COORDS[location];
  if (!coord) return 'https://www.openstreetmap.org/export/embed.html?bbox=121.15,24.95,121.35,25.05&layer=mapnik';
  const { lat, lon } = coord;
  const delta = 0.035;
  const bbox  = `${(lon - delta).toFixed(4)},${(lat - delta).toFixed(4)},${(lon + delta).toFixed(4)},${(lat + delta).toFixed(4)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

type FilterTab = '活躍事件' | '歷史事件' | '已解決事件';
const TABS: FilterTab[] = ['活躍事件', '歷史事件', '已解決事件'];
const DISTRICTS = ['所有區域', '蘆竹區', '觀音區', '中壢區', '桃園區', '大園區'];
const SEVERITIES = ['嚴重度', '高風險', '中等風險', '低風險'];

interface EventData {
  id: number;
  category: string;
  title: React.ReactNode;
  description: React.ReactNode;
  severity: string;
  status: string;
  trend: string;
  exposure: string;
  duration: string;
  location: string;
  isActive: boolean;
  isResolved: boolean;
  confidence?: string;
  healthIndex?: string;
}

const allEventData: EventData[] = [
  { id: 1, category: '工業聚集區', title: '觀音中心排放',     description: <>在工業區範圍內檢測到局部 SO<sub className="text-xs">2</sub> 尖峰，建議附近居民減少戶外活動。</>,         severity: '中等風險', status: '固定站',  trend: '穩定中', exposure: '~1.2k 人', duration: '45 分鐘',        location: '觀音區', healthIndex: '敏感警告', isActive: true,  isResolved: false },
  { id: 2, category: '大氣流入',   title: <>重度 PM<sub className="text-xs">2.5</sub> 流入</>, description: '跨境污染物透過東北風持續流入，影響北部住宅區域，濃度持續上升。',           severity: '高風險',   status: 'AI 識別', trend: '上升中', exposure: '~3.5k 人', duration: '2 小時 15 分鐘', location: '蘆竹區', confidence: '98.4%',    isActive: true,  isResolved: false },
  { id: 3, category: '交通排放',   title: '中壢交流道壅塞',   description: <>尖峰時段車流導致 NO<sub className="text-xs">x</sub> 濃度升高，預計 1 小時後隨車流疏散改善。</>,          severity: '低風險',   status: '固定站',  trend: '下降中', exposure: '~800 人',  duration: '1 小時 30 分鐘', location: '中壢區', healthIndex: '良好',     isActive: true,  isResolved: false },
  { id: 4, category: '工業聚集區', title: '大園工業區異常',   description: '檢測到 VOCs 濃度異常升高，來源已定位，工廠已停工排查。',                  severity: '中等風險', status: 'AI 識別', trend: '已穩定', exposure: '~2.1k 人', duration: '已解決',          location: '大園區', confidence: '92.1%',    isActive: false, isResolved: true  },
  { id: 5, category: '區域性事件', title: <>桃園市區空品惡化</>, description: <>多個測站同時檢測到 PM<sub className="text-xs">2.5</sub> 升高，低壓系統造成污染物堆積，影響範圍持續擴大。</>, severity: '高風險',   status: '固定站',  trend: '持平',   exposure: '~5.8k 人', duration: '3 小時',          location: '桃園區', healthIndex: '不健康',   isActive: true,  isResolved: false },
];

/* ─── Dropdown ───────────────────────────────────────────────── */
interface DropdownProps {
  id: string; value: string; options: string[];
  onSelect: (v: string) => void;
  openId: string | null; setOpenId: (v: string | null) => void;
}
function Dropdown({ id, value, options, onSelect, openId, setOpenId }: DropdownProps) {
  const isOpen = openId === id;
  const isFiltered = value !== options[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : id); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
          backgroundColor: isFiltered ? C.primaryAlpha : C.glass,
          border: `1px solid ${isFiltered ? C.primaryBorder : C.glassBorder}`,
          boxShadow: C.glassShadow,
          fontSize: 13, fontWeight: isFiltered ? 700 : 500,
          color: isFiltered ? C.primary : C.muted,
          transition: 'all 0.15s',
        }}
      >
        {value}
        <ChevronDown
          size={14} strokeWidth={2.5}
          style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 200, ...glassCard, minWidth: 160, overflow: 'hidden' }}
        >
          {options.map((opt, i) => (
            <button key={opt} onClick={() => { onSelect(opt); setOpenId(null); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '12px 16px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: value === opt ? 700 : 500,
              color: value === opt ? C.primary : C.text,
              backgroundColor: value === opt ? C.primaryAlpha : 'transparent',
              borderBottom: i < options.length - 1 ? '1px solid rgba(180,140,160,0.10)' : 'none',
              transition: 'background-color 0.12s',
            }}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Trend inline ───────────────────────────────────────────── */
function TrendInline({ trend }: { trend: string }) {
  const isUp   = trend === '上升中';
  const isDown = trend === '下降中';
  const Icon   = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color  = isUp ? C.red : isDown ? C.green : C.hint;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon size={15} color={color} strokeWidth={2.5} />
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{trend}</span>
    </div>
  );
}

/* ─── Meta cell (2×2 grid item) ──────────────────────────────── */
function MetaCell({ IconComp, label, value, valueColor, isTrend }: {
  IconComp: React.ElementType; label: string; value?: string;
  valueColor?: string; isTrend?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        backgroundColor: 'rgba(180,140,160,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconComp size={19} color={C.muted} strokeWidth={1.8} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4 }}>{label}</p>
        {isTrend
          ? <TrendInline trend={value ?? ''} />
          : <p style={{ fontSize: 15, fontWeight: 700, color: valueColor ?? C.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
        }
      </div>
    </div>
  );
}

/* ─── Event card ─────────────────────────────────────────────── */
function EventCard({ event }: { event: EventData }) {
  const sev  = SEVERITY[event.severity] ?? SEVERITY['中等風險'];
  const Icon = CATEGORY_ICON[event.category] ?? AlertCircle;
  const hasConfidence = !!event.confidence;
  const mapUrl = buildMapUrl(event.location);

  return (
    <div style={{ ...glassCard, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ── Map thumbnail: extend iframe by 4px on all sides to kill edge gaps */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', flexShrink: 0, overflow: 'hidden', backgroundColor: 'rgba(240,235,245,0.6)' }}>
        <iframe
          src={mapUrl}
          style={{ position: 'absolute', top: -2, left: -2, width: 'calc(100% + 4px)', height: 'calc(100% + 4px)', border: 'none', display: 'block' }}
          title={`地圖 - ${event.location}`}
          loading="lazy"
        />
        {/* Severity + status badges */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <span style={{
            padding: '5px 12px', borderRadius: 99,
            backgroundColor: sev.color, color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
          }}>{event.severity}</span>
          <span style={{
            padding: '5px 12px', borderRadius: 99,
            backgroundColor: 'rgba(255,255,255,0.92)', color: C.text,
            fontSize: 12, fontWeight: 600,
          }}>{event.status}</span>
        </div>
        {/* Location badge */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 99,
          backgroundColor: 'rgba(255,255,255,0.92)',
        }}>
          <MapPin size={13} color={C.primary} strokeWidth={2.5} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{event.location}</span>
        </div>
      </div>

      {/* ── Card content ─────────────────────────────────── */}
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>

        {/* Header: icon + category + title */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            backgroundColor: sev.alpha, border: `1px solid ${sev.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={20} color={sev.color} strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: C.hint, letterSpacing: 0.6, marginBottom: 4 }}>{event.category}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{event.title}</p>
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>{event.description}</p>

        {/* Meta 2×2 grid — row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', paddingBottom: 16, borderBottom: '1px solid rgba(180,140,160,0.10)', marginBottom: 16 }}>
          <MetaCell IconComp={Clock}    label="持續時間" value={event.duration} />
          <MetaCell IconComp={Users}    label="暴露人口" value={event.exposure} />
          <MetaCell IconComp={Activity} label="趨勢"     value={event.trend}    isTrend />
          <MetaCell
            IconComp={hasConfidence ? Activity : MapPin}
            label={hasConfidence ? 'AI 信心值' : '健康指數'}
            value={hasConfidence ? event.confidence : event.healthIndex ?? '—'}
            valueColor={hasConfidence ? C.primary : sev.color}
          />
        </div>

        {/* Footer button — solid fill so it's visually distinct from meta cells */}
        <div style={{ marginTop: 'auto' }}>
          <button style={{
            width: '100%', padding: '12px 0', borderRadius: 13, cursor: 'pointer',
            backgroundColor: sev.alpha, border: `1px solid ${sev.border}`,
            fontSize: 14, fontWeight: 700, color: sev.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 0.15s',
          }}>
            <Icon size={15} strokeWidth={2} />
            {hasConfidence ? 'AI 分析詳情' : '完整事件分析'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function EventsPage() {
  const [activeTab, setActiveTab]               = useState<FilterTab>('活躍事件');
  const [selectedDistrict, setSelectedDistrict] = useState('所有區域');
  const [selectedSeverity, setSelectedSeverity] = useState('嚴重度');
  const [openId, setOpenId]                     = useState<string | null>(null);
  const [isMobile, setIsMobile]                 = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const closeDropdown = useCallback(() => setOpenId(null), []);

  const filtered = allEventData.filter((e) => {
    if (activeTab === '活躍事件'   && !e.isActive)   return false;
    if (activeTab === '已解決事件' && !e.isResolved)  return false;
    if (activeTab === '歷史事件'   &&  e.isActive)    return false;
    if (selectedDistrict !== '所有區域' && e.location !== selectedDistrict) return false;
    if (selectedSeverity !== '嚴重度'   && e.severity !== selectedSeverity) return false;
    return true;
  });

  return (
    <div
      style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}
      onClick={closeDropdown}
    >
      <div style={{ padding: isMobile ? '20px 16px 28px' : '28px 40px 32px' }}>

        {/* ── Controls bar: tabs + filters ─────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <button key={tab} onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
                backgroundColor: active ? C.primaryAlpha : C.glass,
                border: `1px solid ${active ? C.primaryBorder : C.glassBorder}`,
                boxShadow: C.glassShadow,
                fontWeight: 700, fontSize: 13, letterSpacing: 0.2,
                color: active ? C.primary : C.hint,
                transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: active ? C.primary : 'rgba(180,140,160,0.35)',
                  transition: 'background-color 0.18s',
                }} />
                {tab}
              </button>
            );
          })}

          <div style={{ width: 1, height: 24, backgroundColor: 'rgba(180,140,160,0.20)', margin: '0 2px' }} />

          <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <Dropdown id="districts" value={selectedDistrict} options={DISTRICTS}
              onSelect={setSelectedDistrict} openId={openId} setOpenId={setOpenId} />
            <Dropdown id="severity"  value={selectedSeverity}  options={SEVERITIES}
              onSelect={setSelectedSeverity}  openId={openId} setOpenId={setOpenId} />
          </div>
        </div>

        {/* ── Cards grid ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{
            ...glassCard, padding: '56px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 15,
              backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Activity size={24} color={C.primary} strokeWidth={2} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.muted }}>目前沒有符合條件的事件</p>
            <p style={{ fontSize: 13, color: C.hint }}>嘗試調整篩選條件以查看更多事件</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 24,
          }}>
            {filtered.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        )}

      </div>
    </div>
  );
}
