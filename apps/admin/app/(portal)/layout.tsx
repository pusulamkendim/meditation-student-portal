import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PortalSessionBoundary } from './portal-session-boundary';
import { PortalSidebar } from './portal-sidebar';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PortalSessionBoundary>
      <div className="app-shell">
        <PortalSidebar />
        <div className="workspace">
          <header className="topbar">
            <strong>Yönetim portalı</strong>
            <span className="ui-badge ui-badge--success">Yerel</span>
          </header>
          {children}
        </div>
      </div>
    </PortalSessionBoundary>
  );
}
