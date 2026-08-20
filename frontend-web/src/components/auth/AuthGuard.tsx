'use client';

import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * AuthGuard — 包裹需要登入才能使用的頁面。
 *
 * 行為：
 * - 已登入：正常顯示 children
 * - 未登入：顯示 children（模糊化 + 禁止捲動/互動）+ 固定位置提示卡片
 * - 載入中：顯示 loading 佔位
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--app-bg-gradient)',
      }}>
        <span style={{ fontSize: 14, color: '#b0a0b8', fontWeight: 600 }}>載入中…</span>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  // 未登入：模糊頁面 + 固定位置提示卡片 + 禁止捲動
  return (
    <div
      style={{
        position: 'relative',
        height: 'calc(100vh - 80px)',
        overflow: 'hidden',
      }}
    >
      {/* 頁面內容（模糊化，禁止互動，禁止捲動） */}
      <div
        style={{
          filter: 'blur(6px)',
          pointerEvents: 'none',
          userSelect: 'none',
          height: '100%',
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* 固定在畫面正中央的遮罩 + 提示卡片 */}
      <div
        style={{
          position: 'fixed',
          top: 80,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 248, 250, 0.35)',
          backdropFilter: 'blur(2px)',
          zIndex: 50,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            border: '1px solid rgba(212, 86, 122, 0.22)',
            borderRadius: 24,
            padding: '44px 48px',
            textAlign: 'center',
            boxShadow:
              '0 12px 48px rgba(180, 140, 160, 0.20), 0 4px 16px rgba(212, 86, 122, 0.08)',
            maxWidth: 400,
            width: '85%',
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: 'rgba(212, 86, 122, 0.10)',
              border: '1px solid rgba(212, 86, 122, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={22} color="#D4567A" strokeWidth={2} />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: '#1a1220',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            此功能需要登入才能使用
          </p>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#7a6880',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            請點選右上方的登入按鈕進行登入或註冊
          </p>
        </div>
      </div>
    </div>
  );
}
