import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ReadingDetail } from '../../../components/readings/reading-detail';
import { getHub, getReadingContent, getReadingMeta } from '../../../lib/api/client';
import { siteConfig } from '../../../lib/config/site';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getReadingMeta(slug);
  if (!meta) {
    return { title: 'Okuma bulunamadı', robots: { index: false, follow: false } };
  }
  const description =
    meta.description ??
    `${meta.author ? `${meta.author} tarafından hazırlanan ` : ''}${meta.title} okuması.`;
  const canonicalUrl = `${siteConfig.siteUrl}/oku/${encodeURIComponent(slug)}`;
  return {
    title: meta.title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: meta.allowIndexing, follow: meta.allowIndexing },
    openGraph: {
      type: 'article',
      locale: 'tr_TR',
      title: meta.title,
      description,
      url: canonicalUrl,
      siteName: 'Sakin Zihin',
      images: [{ url: `${canonicalUrl}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description,
      images: [`${canonicalUrl}/opengraph-image`],
    },
  };
}

export default async function ReadingPage({ params }: PageProps) {
  const { slug } = await params;
  const [reading, catalog] = await Promise.all([getReadingContent(slug), getHub()]);
  if (!reading) notFound();

  const relatedReading = catalog?.readings.find((candidate) => candidate.slug !== slug);
  const relatedMeditation = catalog?.meditations[0];

  return (
    <ReadingDetail
      reading={reading}
      relatedReading={relatedReading}
      relatedMeditation={relatedMeditation}
    />
  );
}
