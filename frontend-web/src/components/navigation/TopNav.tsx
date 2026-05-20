'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

const navItems = [
  { href: '/dashboard', label: '空氣總覽' },
  { href: '/map',       label: '監測地圖' },
  { href: '/explorer',  label: '數據檢索' },
  { href: '/events',    label: '事件記錄' },
  { href: '/alerts',    label: '警報通知' },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 997,
      backgroundColor: '#FFF6F9',
      paddingTop: 20,
      paddingBottom: 20,
    }}>
      <div style={{
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 50,
        paddingTop: 5,
        paddingBottom: 5,
        paddingLeft: 25,
        paddingRight: 25,
        boxShadow: '0 4px 20px rgba(231,101,149,0.08)',
        border: '1px solid rgba(231,101,149,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: 1200,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
          <Image
            src="https://res.cloudinary.com/da3bvump4/image/upload/v1777184942/logo-air_mb0ktq.webp"
            alt="Taoyuan Air Logo"
            width={36}
            height={36}
            style={{ objectFit: 'contain' }}
            unoptimized
          />
          <span style={{ fontSize: 24, fontWeight: 600, color: '#E76595', letterSpacing: 0.5, paddingLeft: 5 }}>
            Taoyuan Air
          </span>
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center', paddingLeft: 40, paddingRight: 40 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === '/dashboard' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  paddingTop: 18,
                  paddingBottom: 18,
                  paddingLeft: 15,
                  paddingRight: 15,
                  fontSize: 16,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#E76595' : '#FBA7BC',
                  textDecoration: 'none',
                  transition: 'color 0.2s ease',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120, justifyContent: 'flex-end', paddingRight: 15 }}>
          <Link
            href="/notifications"
            style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(231,101,149,0.1)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
            }}
            title="通知"
            aria-label="通知"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </Link>
          <Link
            href="/settings"
            style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(231,101,149,0.1)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
            }}
            title="設定"
            aria-label="設定"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  );
}
