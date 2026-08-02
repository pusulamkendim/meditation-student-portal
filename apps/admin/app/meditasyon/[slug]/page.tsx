import type { Metadata } from 'next';

import PublicMeditationPlayer from './public-player';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const response = await fetch(`${api}/v1/public/meditations/${encodeURIComponent(slug)}/meta`, {
    cache: 'no-store',
  }).catch(() => undefined);
  if (!response?.ok) return { title: 'Meditasyon | Sakin Zihin', robots: { index: false } };
  const meta = (await response.json()) as {
    title: string;
    description?: string | null;
    allowIndexing: boolean;
    canonicalUrl: string;
  };
  return {
    title: `${meta.title} | Sakin Zihin`,
    description: meta.description ?? `${meta.title} meditasyon pratiği`,
    alternates: { canonical: meta.canonicalUrl },
    robots: { index: meta.allowIndexing, follow: meta.allowIndexing },
    openGraph: {
      title: meta.title,
      description: meta.description ?? `${meta.title} meditasyon pratiği`,
      type: 'website',
      url: meta.canonicalUrl,
    },
  };
}

export default async function PublicMeditationPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicMeditationPlayer slug={slug} />;
}
