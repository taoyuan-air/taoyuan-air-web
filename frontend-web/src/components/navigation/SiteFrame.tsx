'use client';

import { usePathname } from 'next/navigation';
import { TopNav } from './TopNav';

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const standalone = usePathname() === '/history';
  return <>
    {!standalone && <TopNav />}
    <main style={{ paddingTop: standalone ? 0 : 80 }}>{children}</main>
  </>;
}
