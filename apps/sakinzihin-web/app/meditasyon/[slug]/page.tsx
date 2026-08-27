import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MeditationPlayer } from '../../../components/meditations/meditation-player';
import { getMeditationMeta } from '../../../lib/api/client';
import { resolveImageUrl } from '../../../lib/content/images';
import { siteConfig } from '../../../lib/config/site';

type PageProps = { params: Promise<{ slug: string }> };

function meditationCanonicalUrl(slug: string) {
  return `${siteConfig.siteUrl}/meditasyon/${encodeURIComponent(slug)}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getMeditationMeta(slug);
  if (!meta) {
    return { title: 'Meditasyon bulunamadı', robots: { index: false, follow: false } };
  }

  const canonicalUrl = meditationCanonicalUrl(slug);
  const description = meta.description ?? `${meta.title} meditasyon pratiği.`;
  const ogImage = meta.coverImageUrl
    ? resolveImageUrl(meta.coverImageUrl)
    : `${siteConfig.siteUrl}/opengraph-image`;
  return {
    title: meta.title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: meta.allowIndexing, follow: meta.allowIndexing },
    openGraph: {
      type: 'website',
      locale: 'tr_TR',
      title: meta.title,
      description,
      url: canonicalUrl,
      siteName: siteConfig.name,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function MeditationPage({ params }: PageProps) {
  const { slug } = await params;
  const meta = await getMeditationMeta(slug);
  if (!meta) notFound();

  const canonicalUrl = meditationCanonicalUrl(slug);
  const description = meta.description ?? `${meta.title} meditasyon pratiği.`;
  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: siteConfig.siteUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Meditasyonlar',
        item: `${siteConfig.siteUrl}/pratik`,
      },
      { '@type': 'ListItem', position: 3, name: meta.title, item: canonicalUrl },
    ],
  };
  const webPageStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: siteConfig.name, url: siteConfig.siteUrl },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageStructuredData) }}
      />
      <MeditationPlayer slug={slug} meta={meta} />
    </>
  );
}
