'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Palette,
  ShieldAlert,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react';

type NavigationItem = { href: string; label: string; icon: LucideIcon };
const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Genel',
    items: [{ href: '/', label: 'Genel bakış', icon: LayoutDashboard }],
  },
  {
    label: 'Öğrenci yönetimi',
    items: [
      { href: '/students', label: 'Öğrenciler', icon: Users },
      { href: '/payments', label: 'Ödemeler', icon: CreditCard },
      { href: '/practice', label: 'Pratikler', icon: Activity },
      { href: '/meetings', label: 'Görüşmeler', icon: CalendarDays },
      { href: '/conversations', label: 'Konuşmalar', icon: MessageSquareText },
    ],
  },
  {
    label: 'İçerik ve AI',
    items: [
      { href: '/standard-messages', label: 'Mesaj şablonları', icon: FileText },
      { href: '/knowledge', label: 'Bilgi bankası', icon: BookOpen },
      { href: '/llm', label: 'LLM platformu', icon: BrainCircuit },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { href: '/operations', label: 'Operasyon', icon: ShieldAlert },
      { href: '/ui-preview', label: 'UI sistemi', icon: Palette },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalSidebar() {
  const pathname = usePathname();
  return (
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
        {navigationGroups.map((group) => (
          <section className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            <div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-status-dot" /> Sistem çevrimiçi
      </div>
    </aside>
  );
}
