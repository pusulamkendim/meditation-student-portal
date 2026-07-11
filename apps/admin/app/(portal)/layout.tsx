import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  MessageSquareText,
  Palette,
  ShieldAlert,
  Sprout,
  Users,
} from 'lucide-react';

import { PortalSessionBoundary } from './portal-session-boundary';

export default function PortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PortalSessionBoundary>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Sprout aria-hidden="true" />
            </span>
            <span className="brand-text">
              Meditasyon<small>Öğrenci yönetimi</small>
            </span>
          </div>
          <nav aria-label="Ana menü">
            <Link aria-current="page" href="/">
              <LayoutDashboard aria-hidden="true" /> Genel Bakış
            </Link>
            <Link href="/students">
              <Users aria-hidden="true" /> Öğrenciler
            </Link>
            <Link href="/payments">
              <CreditCard aria-hidden="true" /> Ödemeler
            </Link>
            <Link href="/practice">
              <Activity aria-hidden="true" /> Pratikler
            </Link>
            <Link href="/meetings">
              <CalendarDays aria-hidden="true" /> Görüşmeler
            </Link>
            <Link href="/conversations">
              <MessageSquareText aria-hidden="true" /> Konuşmalar
            </Link>
            <Link href="/operations">
              <ShieldAlert aria-hidden="true" /> Operasyon
            </Link>
            <Link href="/ui-preview">
              <Palette aria-hidden="true" /> UI Sistemi
            </Link>
          </nav>
          <div className="sidebar-footer">v0.1 · Güvenli yönetim alanı</div>
        </aside>
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
