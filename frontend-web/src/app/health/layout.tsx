'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Disclaimer } from '@/components/health/Disclaimer';
import { HealthTabs } from '@/components/health/HealthTabs';
import { C } from '@/components/health/tokens';

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <AuthGuard>
      <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)' }}>
        {/* 共用頁首:標題 + 副標 + 免責短版 + 分頁列 */}
        <div style={{ padding: isMobile ? '20px 16px 0' : '28px 40px 0' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>健康與防護</h1>
              <p style={{ fontSize: 12, color: C.hint, margin: '4px 0 0' }}>轉載官方公開資訊的互動介面</p>
            </div>
            <div style={{ flex: isMobile ? '1' : undefined, width: isMobile ? '100%' : undefined }}>
              <Disclaimer variant="short" />
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <HealthTabs />
          </div>
        </div>

        {children}
      </div>
    </AuthGuard>
  );
}
