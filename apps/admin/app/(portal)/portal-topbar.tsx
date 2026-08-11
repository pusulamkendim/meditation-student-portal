'use client';

import { Bell, Circle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const routeLabels: Array<{ prefix: string; label: string }> = [
  { prefix: '/standard-messages', label: 'Mesaj şablonları' },
  { prefix: '/conversations', label: 'Konuşmalar' },
  { prefix: '/meditations', label: 'Meditasyonlar' },
  { prefix: '/knowledge', label: 'Bilgi bankası' },
  { prefix: '/operations', label: 'Operasyon' },
  { prefix: '/students', label: 'Öğrenciler' },
  { prefix: '/payments', label: 'Ödemeler' },
  { prefix: '/practice', label: 'Pratikler' },
  { prefix: '/meetings', label: 'Görüşmeler' },
  { prefix: '/readings', label: 'Okumalar' },
  { prefix: '/drawings', label: 'Çizimler' },
  { prefix: '/llm', label: 'LLM platformu' },
  { prefix: '/ui-preview', label: 'UI sistemi' },
];

export function PortalTopbar() {
  const pathname = usePathname();
  const [dateText, setDateText] = useState('');
  const pageLabel = useMemo(
    () => routeLabels.find(({ prefix }) => pathname.startsWith(prefix))?.label ?? 'Bugünün ritmi',
    [pathname],
  );

  useEffect(() => {
    setDateText(
      new Intl.DateTimeFormat('tr-TR', {
        dateStyle: 'long',
        timeZone: 'Europe/Istanbul',
      }).format(new Date()),
    );
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-path">
        <span>Çalışma alanı</span>
        <i aria-hidden="true">/</i>
        <strong>{pageLabel}</strong>
      </div>
      <div className="topbar-context">
        {dateText ? <time>{dateText}</time> : null}
        <span className="topbar-system-state">
          <Circle aria-hidden="true" /> Sistem çevrimiçi
        </span>
        <Link className="topbar-icon-link" href="/operations" title="Operasyon bildirimleri">
          <Bell aria-hidden="true" />
          <span className="sr-only">Operasyon bildirimleri</span>
        </Link>
      </div>
    </header>
  );
}
