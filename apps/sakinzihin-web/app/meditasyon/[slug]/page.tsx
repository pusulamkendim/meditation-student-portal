import { redirect } from 'next/navigation';

import { siteConfig } from '../../../lib/config/site';

export default async function LegacyMeditationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`${siteConfig.legacyOrigin}/meditasyon/${encodeURIComponent(slug)}`);
}
