'use client';

import { useEffect } from 'react';

import { siteConfig } from '../lib/config/site';

export function LegacyRedirectClient({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(
      `${siteConfig.legacyOrigin}${path}${window.location.search}${window.location.hash}`,
    );
  }, [path]);

  return (
    <main className="redirect-page site-shell">
      <span className="eyebrow">Sakin Zihin</span>
      <h1>Sayfa yönlendiriliyor.</h1>
      <p>Mevcut pratiğin birkaç saniye içinde açılacak.</p>
    </main>
  );
}
