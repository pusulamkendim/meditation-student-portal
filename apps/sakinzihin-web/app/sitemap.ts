import type { MetadataRoute } from 'next';

import { getHub } from '../lib/api/client';
import { siteConfig } from '../lib/config/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getHub();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteConfig.siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteConfig.siteUrl}/oku`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteConfig.siteUrl}/pratik`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteConfig.siteUrl}/hakkimda`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteConfig.siteUrl}/birebir-meditasyon`, changeFrequency: 'weekly', priority: 0.9 },
  ];

  const readingRoutes = (catalog?.readings ?? [])
    .filter((reading) => reading.allowIndexing)
    .map((reading) => ({
      url: `${siteConfig.siteUrl}/oku/${reading.slug}`,
      lastModified: reading.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    }));
  const meditationRoutes = (catalog?.meditations ?? [])
    .filter((meditation) => meditation.allowIndexing)
    .map((meditation) => ({
      url: `${siteConfig.siteUrl}/meditasyon/${meditation.slug}`,
      lastModified: meditation.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

  return [...staticRoutes, ...readingRoutes, ...meditationRoutes];
}
