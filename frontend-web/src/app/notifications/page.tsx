'use client';

import Link from 'next/link';
import { ChevronLeft, Grid3X3, RefreshCw, ShieldAlert, Sparkles, Wind } from 'lucide-react';

const palette = {
  bg: '#FFF6F9',
  bgEnd: '#FFEAF0',
  primary: '#E76595',
  text: '#2D3129',
  muted: '#7F5A6A',
  border: 'rgba(231,101,149,0.16)',
  glass: 'rgba(255,255,255,0.58)',
};

const notifications = [
  {
    id: 1,
    title: '空氣品質警報',
    subtitle: '中壢區',
    time: '2小時前',
    content: 'PM2.5 濃度超過 35µg/m³。檢測到局部工業排放。建議室內使用空氣清淨機。',
    icon: ShieldAlert,
    color: palette.primary,
  },
  {
    id: 2,
    title: '健康建議',
    subtitle: '戶外活動指引',
    time: '5小時前',
    content: '紫外線指數較低且空氣品質在桃園區達到最佳狀態。現在適合安排低暴露戶外活動。',
    icon: Wind,
    color: palette.primary,
  },
  {
    id: 3,
    title: '系統更新',
    subtitle: '版本 2.4.0 上線',
    time: '昨天',
    content: '蘆竹地區增強 3D 網格視覺化，並更新沿海風場模式的 AI 預測模型。',
    icon: RefreshCw,
    color: palette.muted,
  },
  {
    id: 4,
    title: '新網格啟用',
    subtitle: '龍潭監測站',
    time: '2天前',
    content: '已建立即時資料同步。龍潭現在具備 500m 高解析度的濕度和懸浮微粒追蹤功能。',
    icon: Grid3X3,
    color: palette.primary,
  },
];

export default function NotificationsPage() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      background: 'var(--app-bg-gradient)',
      padding: '28px 24px 80px',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <Link href="/dashboard" aria-label="返回總覽" style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.glass,
            border: `1px solid ${palette.border}`,
            textDecoration: 'none',
          }}>
            <ChevronLeft size={22} color={palette.text} />
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: palette.text, margin: 0 }}>系統通知</h1>
          <div style={{ width: 42 }} />
        </header>

        <section style={{ display: 'grid', gap: 16 }}>
          {notifications.map(({ id, title, subtitle, time, content, icon: Icon, color }) => (
            <article key={id} style={{
              borderRadius: 20,
              border: `1px solid ${palette.border}`,
              backgroundColor: palette.glass,
              padding: 20,
              boxShadow: '0 6px 18px rgba(94,42,66,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: 'rgba(231,101,149,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={21} color={color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: palette.text }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 14, color: palette.muted }}>{subtitle}</p>
                </div>
                <time style={{ fontSize: 12, color: palette.primary, fontWeight: 700, whiteSpace: 'nowrap' }}>{time}</time>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: palette.muted }}>
                <span style={{ color: palette.primary, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={14} />
                  AI 洞察：
                </span>
                {' '}
                {content}
              </p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
