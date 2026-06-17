'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, Bell, Settings } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: '空氣總覽' },
  { href: '/map',       label: '監測地圖' },
  { href: '/explorer',  label: '數據檢索' },
  { href: '/events',    label: '事件記錄' },
  { href: '/alerts',    label: '警報通知' },
];

export function TopNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 24);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href === '/dashboard' && pathname === '/');

  return (
    <>
      <nav className={`top-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="top-nav-inner">
          {/* Logo */}
          <Link href="/dashboard" className="top-nav-logo">
            <span className="top-nav-logo-img">
              <Image
                src="https://res.cloudinary.com/da3bvump4/image/upload/v1777184942/logo-air_mb0ktq.webp"
                alt="Taoyuan Air Logo"
                width={34}
                height={34}
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                unoptimized
              />
            </span>
            <span className="top-nav-logo-text">Taoyuan Air</span>
          </Link>

          {/* Desktop nav links */}
          <div className="top-nav-links">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`top-nav-link${isActive(item.href) ? ' active' : ''}`}
              >
                <span className="top-nav-link-inner">{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Right actions */}
          <div className="top-nav-actions">
            <Link href="/notifications" className="top-nav-action-btn" title="通知" aria-label="通知">
              <Bell size={17} />
            </Link>
            <Link href="/settings" className="top-nav-action-btn" title="設定" aria-label="設定">
              <Settings size={17} />
            </Link>
            <button
              className="top-nav-hamburger"
              aria-label={mobileOpen ? '關閉選單' : '開啟選單'}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay */}
      <div
        className={`mobile-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Mobile slide-in panel */}
      <div className={`mobile-nav-panel${mobileOpen ? ' open' : ''}`}>
        <button
          className="mobile-nav-close"
          aria-label="關閉選單"
          onClick={() => setMobileOpen(false)}
        >
          <X size={28} />
        </button>

        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-link${isActive(item.href) ? ' active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            {item.label}
          </Link>
        ))}

        <div className="mobile-nav-actions">
          <Link href="/notifications" className="top-nav-action-btn" title="通知" onClick={() => setMobileOpen(false)}>
            <Bell size={17} />
          </Link>
          <Link href="/settings" className="top-nav-action-btn" title="設定" onClick={() => setMobileOpen(false)}>
            <Settings size={17} />
          </Link>
        </div>
      </div>
    </>
  );
}
