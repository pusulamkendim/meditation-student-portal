import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@meditation/design-tokens/tokens.css';
import '@meditation/ui/styles.css';
import './global.css';

export const metadata: Metadata = {
  title: 'Meditasyon Öğrenci Portalı',
  description: 'Yönetim portalı',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
