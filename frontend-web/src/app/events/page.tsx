'use client';

import { Suspense } from 'react';
import IOPView from '@/components/IOP/IOPView';
import { AuthGuard } from '@/components/auth/AuthGuard';

export default function EventsPage() {
  return (
    <AuthGuard>
      <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 80 }}>
        <div style={{ padding: '40px 40px 0' }}>
          <Suspense fallback={null}>
            <IOPView />
          </Suspense>
        </div>

        <style>{`
          @media (max-width: 780px) {
            .events-iop-pad {
              padding-left: 16px !important;
              padding-right: 16px !important;
            }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
