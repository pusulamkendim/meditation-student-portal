import Link from 'next/link';

import { publicRoutes, siteConfig } from '../../lib/config/site';
import { BrandMark } from './brand-mark';
import { TrackedLink } from './tracked-link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-invite-section">
        <div className="site-shell footer-top">
          <div className="footer-invite">
            <span className="eyebrow">Sakin Zihin</span>
            <h2>Pratiğini gündelik hayatına taşı.</h2>
            <p>Yeni yazılar ve pratiklerden haberdar ol.</p>
          </div>
          <TrackedLink
            className="button button-outline"
            href={siteConfig.links.whatsapp}
            event="whatsapp_click"
            eventProperties={{ location: 'footer' }}
          >
            Bize ulaş
          </TrackedLink>
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
          <TrackedLink
            href={siteConfig.links.whatsapp}
            event="whatsapp_click"
            eventProperties={{ location: 'footer-link' }}
          >
            WhatsApp’tan yaz
          </TrackedLink>
        </div>
      </div>
      <div className="site-shell footer-bottom">
        <span>© {new Date().getFullYear()} Sakin Zihin</span>
        <span>Yargısız, sade ve sürdürülebilir bir pratik.</span>
      </div>
    </footer>
  );
}
