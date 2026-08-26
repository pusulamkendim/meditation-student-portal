import type { Metadata, Viewport } from 'next';

import { SiteFooter } from '../components/shared/site-footer';
import { SiteHeader } from '../components/shared/site-header';
import { siteConfig } from '../lib/config/site';
import '../styles/globals.css';

const themeScript = `(() => {
  try {
    const stored = localStorage.getItem('sakinzihin-theme');
    const preferred = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = preferred === 'dark' ? 'dark' : 'light';
  } catch {}
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: 'Sakin Zihin',
    template: '%s · Sakin Zihin',
  },
  description: siteConfig.description,
  applicationName: 'Sakin Zihin',
  referrer: 'strict-origin-when-cross-origin',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Sakin Zihin',
    title: 'Sakin Zihin',
    description: siteConfig.description,
    url: siteConfig.siteUrl,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Sakin Zihin' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sakin Zihin',
    description: siteConfig.description,
    images: ['/opengraph-image'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#102b24' },
  ],
};

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const websiteStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.siteUrl,
    description: siteConfig.description,
  };

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
        />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
