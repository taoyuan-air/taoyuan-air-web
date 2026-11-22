'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)' }}>
        {children}
      </div>
    </AuthGuard>
  );
}
