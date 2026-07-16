import type { ReactNode } from 'react';

import { PortalSessionBoundary } from './portal-session-boundary';
import { PortalSidebar } from './portal-sidebar';

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
