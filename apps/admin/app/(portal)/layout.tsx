import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { PortalSessionBoundary } from './portal-session-boundary';
import { PortalSidebar } from './portal-sidebar';
import { PortalTopbar } from './portal-topbar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#06110f',
};

export default function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PortalSessionBoundary>
      <div className="app-shell portal-theme">
        <PortalSidebar />
        <div className="workspace">
          <PortalTopbar />
          {children}
        </div>
      </div>
    </PortalSessionBoundary>
  );
}
