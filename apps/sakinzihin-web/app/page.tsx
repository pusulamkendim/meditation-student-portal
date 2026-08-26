import type { Metadata } from 'next';

import { HomePage } from '../components/home/home-page';
import { getHub } from '../lib/api/client';

export const metadata: Metadata = {
  title: 'Zihni susturmaya değil, onu anlamaya başla',
  description:
    'Sakin Zihin ile ücretsiz meditasyon pratiklerini ve farkındalık okumalarını keşfet. Kendi pratiğini oluşturmak için birebir çalışmaya başla.',
  alternates: { canonical: '/' },
};

export default async function HomePageRoute() {
  const catalog = await getHub();
  return <HomePage catalog={catalog} />;
}
