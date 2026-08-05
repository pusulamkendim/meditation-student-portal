import type { MetadataRoute } from 'next';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const origin = 'https://sakinzihin.com';

type CatalogItem = { slug: string; updatedAt: string; allowIndexing: boolean };
type Catalog = { readings: CatalogItem[]; meditations: CatalogItem[] };

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: origin, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ];
  try {
    const response = await fetch(`${api}/v1/public/hub`, { next: { revalidate: 3600 } });
    if (!response.ok) return base;
    const catalog = (await response.json()) as Catalog;
    return [
      ...base,
      ...catalog.meditations
        .filter((item) => item.allowIndexing)
        .map((item) => ({
          url: `${origin}/meditasyon/${encodeURIComponent(item.slug)}`,
          lastModified: new Date(item.updatedAt),
          changeFrequency: 'monthly' as const,
          priority: 0.8,
        })),
      ...catalog.readings
        .filter((item) => item.allowIndexing)
        .map((item) => ({
          url: `${origin}/oku/${encodeURIComponent(item.slug)}`,
          lastModified: new Date(item.updatedAt),
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        })),
    ];
  } catch {
    return base;
  }
}
