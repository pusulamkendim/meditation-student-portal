import type { Metadata } from 'next';

import { PublicReadingClient } from './public-reading-client';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type PublicMeta = {
  title: string;
  description?: string | null;
  author?: string | null;
  allowIndexing: boolean;
  canonicalUrl: string;
};

async function loadMeta(slug: string): Promise<PublicMeta | undefined> {
  const response = await fetch(`${api}/v1/readings/public/${encodeURIComponent(slug)}/meta`, {
    next: { revalidate: 60 },
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  return (await response.json()) as PublicMeta;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await loadMeta(slug);
  if (!meta)
    return {
      title: 'Okuma bulunamadı',
      robots: { index: false, follow: false },
    };
  const description =
    meta.description ??
    `${meta.author ? `${meta.author} tarafından hazırlanan ` : ''}${meta.title} okuması.`;
  return {
    title: `${meta.title} | Meditasyon`,
    description,
    alternates: { canonical: meta.canonicalUrl },
    robots: {
      index: meta.allowIndexing,
      follow: meta.allowIndexing,
    },
    openGraph: {
      type: 'article',
      locale: 'tr_TR',
      title: meta.title,
      description,
      url: meta.canonicalUrl,
      siteName: 'Meditasyon',
      images: [{ url: `${meta.canonicalUrl}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description,
      images: [`${meta.canonicalUrl}/opengraph-image`],
    },
  };
}

export default async function PublicReadingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicReadingClient slug={slug} />;
}
