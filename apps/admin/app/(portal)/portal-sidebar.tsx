'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AudioLines,
  BookOpen,
  BrainCircuit,
  BookMarked,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  PencilRuler,
  ShieldAlert,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react';

type NavigationItem = { href: string; label: string; icon: LucideIcon };
const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Çalışma alanı',
    items: [
      { href: '/', label: 'Bugünün ritmi', icon: LayoutDashboard },
      { href: '/students', label: 'Öğrenciler', icon: Users },
      { href: '/conversations', label: 'Konuşmalar', icon: MessageSquareText },
    ],
  },
  {
    label: 'Program',
    items: [
      { href: '/practice', label: 'Pratikler', icon: Activity },
      { href: '/meetings', label: 'Görüşmeler', icon: CalendarDays },
      { href: '/payments', label: 'Ödemeler', icon: CreditCard },
    ],
  },
  {
    label: 'İçerik',
    items: [
      { href: '/meditations', label: 'Meditasyonlar', icon: AudioLines },
      { href: '/readings', label: 'Okumalar', icon: BookMarked },
      { href: '/knowledge', label: 'Bilgi bankası', icon: BookOpen },
      { href: '/drawings', label: 'Çizimler', icon: PencilRuler },
      { href: '/site', label: 'Site & İçerik', icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { href: '/standard-messages', label: 'Mesaj şablonları', icon: FileText },
      { href: '/llm', label: 'LLM platformu', icon: BrainCircuit },
      { href: '/operations', label: 'Operasyon', icon: ShieldAlert },
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
          Sakin Zihin<small>yönetim stüdyosu</small>
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
                  <Link
                    aria-current={active ? 'page' : undefined}
                    href={item.href}
                    key={item.href}
                    title={item.label}
                  >
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
        <span className="sidebar-profile">N</span>
        <span>
          <strong>Necip Sülbü</strong>
          <small>Yönetici</small>
        </span>
      </div>
    </aside>
  );
}
