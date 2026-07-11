import type { ReactNode } from 'react';
import Link from 'next/link';

import { PortalSessionBoundary } from './portal-session-boundary';

export default function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PortalSessionBoundary>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">Meditasyon Portalı</div>
          <nav aria-label="Ana menü">
            <Link aria-current="page" href="/">
              Genel Bakış
            </Link>
            <Link href="/students">Öğrenciler</Link>
            <Link href="/payments">Ödemeler</Link>
            <Link href="/practice">Pratikler</Link>
            <Link href="/meetings">Görüşmeler</Link>
            <Link href="/conversations">Konuşmalar</Link>
            <Link href="/operations">Operasyon</Link>
          </nav>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>Yönetim</span>
            <span className="environment">Yerel</span>
          </header>
          {children}
        </div>
      </div>
    </PortalSessionBoundary>
  );
}
