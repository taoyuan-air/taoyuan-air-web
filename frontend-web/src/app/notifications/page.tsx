'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell, CheckCheck, Grid3X3, Leaf,
  RefreshCw, ShieldAlert, Wind,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:        '#D4567A',
  primaryAlpha:   'rgba(212,86,122,0.12)',
  primaryBorder:  'rgba(212,86,122,0.30)',
  coral:          '#C4614A',
  coralAlpha:     'rgba(196,97,74,0.12)',
  coralBorder:    'rgba(196,97,74,0.28)',
  sage:           '#5C8A76',
  sageAlpha:      'rgba(92,138,118,0.12)',
  sageBorder:     'rgba(92,138,118,0.28)',
  lavender:       '#7878A8',
  lavenderAlpha:  'rgba(120,120,168,0.12)',
  lavenderBorder: 'rgba(120,120,168,0.28)',
  glass:          'rgba(255,255,255,0.52)',
  glassBorder:    'rgba(255,255,255,0.72)',
  glassShadow:    '0 4px 16px rgba(180,140,160,0.10)',
  text:           '#1a1220',
  muted:          '#7a6880',
  hint:           '#b0a0b8',
};

const card: React.CSSProperties = {
  backgroundColor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 20,
  boxShadow: C.glassShadow,
};

/* ─── Data ───────────────────────────────────────────────────── */
type Category = '全部' | '警報' | '健康建議' | '系統';

interface Notification {
  id: number;
  category: Exclude<Category, '全部'>;
  title: string;
  subtitle: string;
  time: string;
  group: '今天' | '昨天' | '更早';
  content: string;
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  unread: boolean;
}

const DATA: Notification[] = [
  {
    id: 1, category: '警報', group: '今天',
    title: '空氣品質警報', subtitle: '中壢區 · PM₂.₅',
    time: '2 小時前',
    content: 'PM₂.₅ 濃度超過 35 µg/m³，已偵測到局部工業排放。建議室內使用空氣清淨機，避免長時間戶外活動。',
    Icon: ShieldAlert, iconColor: C.coral, iconBg: C.coralAlpha, iconBorder: C.coralBorder,
    unread: true,
  },
  {
    id: 2, category: '健康建議', group: '今天',
    title: '戶外活動窗口', subtitle: '桃園區 · 最佳時段',
    time: '5 小時前',
    content: '紫外線指數偏低且空氣品質達到最佳狀態。08:00–10:00 為今日最適合低暴露戶外活動的時段。',
    Icon: Leaf, iconColor: C.sage, iconBg: C.sageAlpha, iconBorder: C.sageBorder,
    unread: true,
  },
  {
    id: 3, category: '系統', group: '昨天',
    title: '系統更新', subtitle: '版本 2.4.0 上線',
    time: '昨天 14:32',
    content: '蘆竹地區增強 3D 網格視覺化，並更新沿海風場模式的 AI 預測模型，預測精度提升約 8%。',
    Icon: RefreshCw, iconColor: C.lavender, iconBg: C.lavenderAlpha, iconBorder: C.lavenderBorder,
    unread: false,
  },
  {
    id: 4, category: '系統', group: '昨天',
    title: '新監測網格啟用', subtitle: '龍潭監測站',
    time: '昨天 09:15',
    content: '龍潭站已建立即時資料同步，現具備 500 m 高解析度的濕度與懸浮微粒追蹤功能。',
    Icon: Grid3X3, iconColor: C.primary, iconBg: C.primaryAlpha, iconBorder: C.primaryBorder,
    unread: false,
  },
  {
    id: 5, category: '警報', group: '更早',
    title: '臭氧濃度偏高', subtitle: '觀音區 · O₃',
    time: '3 天前',
    content: '下午尖峰時段 O₃ 濃度達 88 ppb，接近敏感族群建議上限。已自動發送預警至當地學校。',
    Icon: ShieldAlert, iconColor: C.coral, iconBg: C.coralAlpha, iconBorder: C.coralBorder,
    unread: false,
  },
  {
    id: 6, category: '健康建議', group: '更早',
    title: 'AQI 持續改善', subtitle: '全區 · 連續 3 天',
    time: '4 天前',
    content: '桃園整體 AQI 已連續三天低於 50，達到「良好」等級。觀音區晨間空氣品質尤為突出。',
    Icon: Wind, iconColor: C.sage, iconBg: C.sageAlpha, iconBorder: C.sageBorder,
    unread: false,
  },
];

const GROUPS: Notification['group'][] = ['今天', '昨天', '更早'];
const CATEGORIES: Category[] = ['全部', '警報', '健康建議', '系統'];

const CATEGORY_META: Record<Category, { color: string; bg: string; border: string }> = {
  '全部':    { color: C.primary,  bg: C.primaryAlpha,  border: C.primaryBorder  },
  '警報':    { color: C.coral,    bg: C.coralAlpha,    border: C.coralBorder    },
  '健康建議': { color: C.sage,    bg: C.sageAlpha,     border: C.sageBorder     },
  '系統':    { color: C.lavender, bg: C.lavenderAlpha, border: C.lavenderBorder },
};

/* ─── Section label ──────────────────────────────────────────── */
function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 2 }}>
      <div style={{
        width: 3, height: 14, borderRadius: 2,
        backgroundColor: C.primary, boxShadow: `0 0 6px ${C.primaryAlpha}`,
      }} />
      <span style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>{title}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function NotificationsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('全部');
  const [readIds, setReadIds] = useState<Set<number>>(
    () => new Set(DATA.filter(n => !n.unread).map(n => n.id))
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const markAllRead = () => setReadIds(new Set(DATA.map(n => n.id)));
  const markRead = (id: number) => setReadIds(prev => new Set([...prev, id]));
  const isUnread = (n: Notification) => !readIds.has(n.id);

  const filtered = DATA.filter(
    n => activeCategory === '全部' || n.category === activeCategory
  );
  const unreadCount = DATA.filter(isUnread).length;
  const countBy = (cat: Category) =>
    cat === '全部' ? DATA.length : DATA.filter(n => n.category === cat).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}>
      <div style={{ padding: isMobile ? '20px 16px 32px' : '28px 40px 32px' }}>

        {/* ── Page header ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={18} color={C.primary} strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.2 }}>系統通知</h1>
              <p style={{ fontSize: 12, color: C.hint, margin: 0, marginTop: 2 }}>共 {DATA.length} 則通知</p>
            </div>
            {unreadCount > 0 && (
              <div style={{
                minWidth: 22, height: 22, borderRadius: 11, padding: '0 7px',
                backgroundColor: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{unreadCount}</span>
              </div>
            )}
          </div>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 7,
              padding: isMobile ? '9px 12px' : '9px 18px',
              borderRadius: 99, cursor: unreadCount > 0 ? 'pointer' : 'default',
              backgroundColor: unreadCount > 0 ? C.primaryAlpha : 'rgba(180,140,160,0.08)',
              border: `1px solid ${unreadCount > 0 ? C.primaryBorder : 'rgba(180,140,160,0.18)'}`,
              fontSize: 13, fontWeight: 700,
              color: unreadCount > 0 ? C.primary : C.hint,
              transition: 'all 0.18s',
            }}
          >
            <CheckCheck size={15} strokeWidth={2.2} />
            {!isMobile && '全部已讀'}
          </button>
        </div>

        {/* ── Mobile: horizontal filter chips ──────────────── */}
        {isMobile && (
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20,
            scrollbarWidth: 'none',
          }}>
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat;
              const meta = CATEGORY_META[cat];
              const unread = cat === '全部'
                ? DATA.filter(isUnread).length
                : DATA.filter(n => n.category === cat && isUnread(n)).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 99, flexShrink: 0,
                    cursor: 'pointer', border: `1px solid ${active ? meta.border : C.glassBorder}`,
                    backgroundColor: active ? meta.bg : C.glass,
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    color: active ? meta.color : C.muted,
                    transition: 'all 0.15s',
                  }}
                >
                  {unread > 0 && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.color }} />
                  )}
                  {cat}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: active ? meta.color : C.hint,
                    backgroundColor: active ? `${meta.color}22` : 'rgba(180,140,160,0.10)',
                    padding: '1px 6px', borderRadius: 99,
                  }}>{countBy(cat)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Main layout ──────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>

          {/* ── Desktop: left sidebar ────────────────────────── */}
          {!isMobile && (
            <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionLabel title="篩選類別" />
              <div style={{ ...card, padding: 8 }}>
                {CATEGORIES.map((cat) => {
                  const active = activeCategory === cat;
                  const meta = CATEGORY_META[cat];
                  const count = countBy(cat);
                  const unread = cat === '全部'
                    ? DATA.filter(isUnread).length
                    : DATA.filter(n => n.category === cat && isUnread(n)).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 10,
                        padding: '11px 14px', cursor: 'pointer', border: 'none', borderRadius: 10,
                        backgroundColor: active ? meta.bg : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? meta.color : C.muted }}>
                        {cat}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {unread > 0 && (
                          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: meta.color, flexShrink: 0 }} />
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: active ? meta.color : C.hint,
                          backgroundColor: active ? `${meta.color}22` : 'rgba(180,140,160,0.10)',
                          padding: '2px 8px', borderRadius: 99,
                        }}>{count}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Stats summary */}
              <div style={{ ...card, padding: 18, marginTop: 8 }}>
                <SectionLabel title="今日摘要" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: '未讀通知', value: unreadCount, color: C.primary },
                    { label: '警報數量', value: DATA.filter(n => n.category === '警報').length, color: C.coral },
                    { label: '健康建議', value: DATA.filter(n => n.category === '健康建議').length, color: C.sage },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 800, color,
                        backgroundColor: `${color}18`, padding: '2px 10px', borderRadius: 99,
                      }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Notification feed ────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
            {GROUPS.map((group) => {
              const items = filtered.filter(n => n.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} style={{ marginBottom: 28 }}>
                  <SectionLabel title={group} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {items.map((n) => {
                      const unread = isUnread(n);
                      return (
                        <article
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          style={{
                            ...card,
                            padding: isMobile ? '14px 16px' : '18px 22px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'flex-start', gap: isMobile ? 12 : 16,
                            transition: 'box-shadow 0.15s',
                            opacity: unread ? 1 : 0.80,
                          }}
                        >
                          {/* icon with unread badge */}
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                              width: isMobile ? 36 : 42, height: isMobile ? 36 : 42,
                              borderRadius: isMobile ? 10 : 12,
                              backgroundColor: n.iconBg, border: `1px solid ${n.iconBorder}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <n.Icon size={isMobile ? 16 : 18} color={n.iconColor} strokeWidth={2} />
                            </div>
                            {unread && (
                              <div style={{
                                position: 'absolute', top: -4, right: -4,
                                width: 13, height: 13, borderRadius: '50%',
                                backgroundColor: n.iconColor,
                                border: '2.5px solid #fff',
                                boxShadow: `0 0 0 2px ${n.iconColor}44`,
                              }} />
                            )}
                          </div>

                          {/* content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: C.text }}>{n.title}</span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600, color: n.iconColor, letterSpacing: 0.3,
                                  backgroundColor: n.iconBg, padding: '2px 9px', borderRadius: 99, flexShrink: 0,
                                }}>{n.category}</span>
                              </div>
                              <time style={{ fontSize: 11, color: C.hint, fontWeight: 500, flexShrink: 0 }}>{n.time}</time>
                            </div>
                            <p style={{ fontSize: isMobile ? 12 : 14, color: C.muted, marginBottom: 6 }}>{n.subtitle}</p>
                            <p style={{ fontSize: isMobile ? 12 : 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{n.content}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{
                ...card, padding: 48,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  backgroundColor: C.primaryAlpha, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bell size={24} color={C.primary} strokeWidth={1.8} />
                </div>
                <p style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>此類別目前沒有通知</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
