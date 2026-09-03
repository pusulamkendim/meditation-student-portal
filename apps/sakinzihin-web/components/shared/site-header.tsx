'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

import { publicRoutes } from '../../lib/config/site';
import { BrandMark } from './brand-mark';
import { ThemeToggle } from './theme-toggle';
import { TrackedLink } from './tracked-link';

const navigation = [
  { label: 'Meditasyonlar', href: publicRoutes.meditations },
  { label: 'Okumalar', href: publicRoutes.readings },
  { label: 'Hakkımda', href: publicRoutes.about },
  { label: 'Birebir Çalışma', href: publicRoutes.oneToOne },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('menu-open', open);
    return () => document.body.classList.remove('menu-open');
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-shell header-inner">
        <Link className="brand" href={publicRoutes.home} aria-label="Sakin Zihin ana sayfa">
          <BrandMark />
          <span>Sakin Zihin</span>
        </Link>

        <nav className="desktop-nav" aria-label="Ana navigasyon">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <TrackedLink
            className="button button-small button-gold"
            href="/birebir-meditasyon#tanisma"
            event="intro_call_click"
            eventProperties={{ location: 'header' }}
          >
            Tanışma Görüşmesi
          </TrackedLink>
          <ThemeToggle />
          <button
            className="menu-toggle"
            type="button"
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={23} strokeWidth={1.5} /> : <Menu size={23} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      <div className={`mobile-nav ${open ? 'is-open' : ''}`} id="mobile-navigation">
        <nav aria-label="Mobil navigasyon">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <TrackedLink
            className="button button-dark mobile-nav-cta"
            href="/birebir-meditasyon#tanisma"
            event="intro_call_click"
            eventProperties={{ location: 'mobile-menu' }}
            onClick={() => setOpen(false)}
          >
            Ücretsiz Tanışma Görüşmesi Yap
          </TrackedLink>
        </nav>
      </div>
    </header>
  );
}
