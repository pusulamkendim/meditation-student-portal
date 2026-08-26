import { redirect } from 'next/navigation';

import { siteConfig } from '../../../lib/config/site';

export default async function LegacyReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`${siteConfig.legacyOrigin}/karne/${encodeURIComponent(token)}`);
}
