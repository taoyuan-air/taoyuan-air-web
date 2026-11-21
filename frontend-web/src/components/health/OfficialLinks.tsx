'use client';

import Link from 'next/link';
import { Bell, ExternalLink } from 'lucide-react';
import { OFFICIAL_PROTECT_LINKS } from '@shared/constants/officialText';
import { C, card } from './tokens';

/**
 * M6 官方防護資訊(連結導覽)+ M7 通知捷徑。
 * 只放標題與外連結,不轉寫官方內容。
 */
export function OfficialLinks() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* M6:三張連結卡 */}
      <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>官方防護資訊</p>
        <p style={{ fontSize: 11, color: C.hint, margin: 0 }}>連結至官方網站,內容以官方公告為準</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {OFFICIAL_PROTECT_LINKS.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '12px 14px', borderRadius: 12, textDecoration: 'none',
                backgroundColor: 'rgba(255,255,255,0.55)', border: `1px solid ${C.glassBorder}`,
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{l.title}</span>
                <span style={{ fontSize: 11, color: C.hint }}>{l.desc}</span>
              </span>
              <ExternalLink size={16} color={C.primary} />
            </a>
          ))}
        </div>
      </div>

      {/* M7:通知捷徑 */}
      <div
        style={{
          ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: C.primaryAlpha, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Bell size={17} color={C.primary} strokeWidth={2} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>想接收健康與防護資訊推播?</p>
        </div>
        <p style={{ fontSize: 11, color: C.hint, margin: 0 }}>
          前往設定頁的「通知偏好」開啟「健康與防護資訊推播」
        </p>
        <Link
          href="/settings"
          style={{
            alignSelf: 'flex-start', padding: '8px 18px', borderRadius: 99, textDecoration: 'none',
            backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
            fontSize: 12, fontWeight: 700, color: C.primary,
          }}
        >
          前往設定
        </Link>
      </div>
    </div>
  );
}
