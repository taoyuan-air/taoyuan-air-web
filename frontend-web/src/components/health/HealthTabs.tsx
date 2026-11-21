'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C } from './tokens';

/**
 * 健康與防護分頁列。ARTICLES_ENABLED 控制是否顯示「健康科普」分頁。
 * 為 false 時(本階段)只顯示標題「個人健康」,不顯示分頁列。
 * 02 文件完成後改為 true。
 */
export const ARTICLES_ENABLED = false;

export function HealthTabs() {
  const pathname = usePathname();

  if (!ARTICLES_ENABLED) {
    // 只顯示單一分頁標題,不渲染分頁列
    return (
      <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>個人健康</h2>
    );
  }

  const tabs = [
    { href: '/health', label: '個人健康', exact: true },
    { href: '/health/articles', label: '健康科普', exact: false },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 999, textDecoration: 'none',
              backgroundColor: active ? C.primaryAlpha : C.glass,
              border: `1px solid ${active ? C.primaryBorder : C.glassBorder}`,
              fontWeight: 700, fontSize: 13,
              color: active ? C.primary : C.hint,
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: active ? C.primary : 'rgba(30,58,95,0.30)',
              }}
            />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
