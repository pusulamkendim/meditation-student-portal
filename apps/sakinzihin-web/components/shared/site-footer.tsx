'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { publicRoutes, siteConfig } from '../../lib/config/site';
import { BrandMark } from './brand-mark';
import { TrackedLink } from './tracked-link';

export function SiteFooter() {
  const corporatePage = usePathname() === publicRoutes.corporate;
  return (
    <footer className="site-footer">
      <div className="footer-invite-section">
        <div className="site-shell footer-top">
          <div className="footer-invite">
            <span className="eyebrow">Sakin Zihin</span>
            <h2>Pratiğini gündelik hayatına taşı.</h2>
            <p>Yeni yazılar ve pratiklerden haberdar ol.</p>
          </div>
          {corporatePage ? (
            <Link className="button button-outline" href="#iletisim">
              Kurumunuz için konuşalım
            </Link>
          ) : (
            <TrackedLink
              className="button button-outline"
              href={siteConfig.links.whatsapp}
              event="whatsapp_click"
              eventProperties={{ location: 'footer' }}
            >
              Bize ulaş
            </TrackedLink>
          )}
        </div>
      </div>
      <div className="site-shell footer-columns">
        <div>
          <Link className="footer-brand" href={publicRoutes.home}>
            <BrandMark />
            Sakin Zihin
          </Link>
          <p>Meditasyon, farkındalık ve daha açık bir yaşam için okumalar ve pratikler.</p>
        </div>
        <div>
          <h3>Keşfet</h3>
          <Link href={publicRoutes.meditations}>Meditasyonlar</Link>
          <Link href={publicRoutes.readings}>Okumalar</Link>
          <Link href={publicRoutes.about}>Hakkımda</Link>
        </div>
        <div>
          <h3>Çalışma</h3>
          <Link href={publicRoutes.oneToOne}>Birebir meditasyon</Link>
          <Link href={publicRoutes.corporate}>Kurumlar için mindfulness</Link>
          {corporatePage ? (
            <Link href="#iletisim">E-posta görüşmesi talep et</Link>
          ) : (
            <TrackedLink
              href={siteConfig.links.whatsapp}
              event="whatsapp_click"
              eventProperties={{ location: 'footer-link' }}
            >
              WhatsApp’tan yaz
            </TrackedLink>
          )}
        </div>
      </div>
      <div className="site-shell footer-bottom">
        <span>© {new Date().getFullYear()} Sakin Zihin</span>
        <Link href={publicRoutes.privacy}>Gizlilik ve aydınlatma</Link>
      </div>
    </footer>
  );
}
