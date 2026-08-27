import type { Metadata } from 'next';

import { HomePage } from '../components/home/home-page';
import { getHub } from '../lib/api/client';
import { homeCopy } from '../lib/content/marketing';

export const metadata: Metadata = {
  title: homeCopy.title,
  description: homeCopy.description,
  alternates: { canonical: '/' },
};

export default async function HomePageRoute() {
  const catalog = await getHub();
  return <HomePage catalog={catalog} />;
}
