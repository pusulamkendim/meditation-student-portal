import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';

import type { HubMeditation, HubReading, PublicReadingContent } from '../../lib/api/types';
import { imageForContent } from '../../lib/content/images';
import { siteConfig } from '../../lib/config/site';
import { ReadingActions } from './reading-actions';
import { ReadingBody } from './reading-body';
import { ReadingToc, ReadingTocDesktop } from './reading-toc';
import { ReadingEngagement } from './reading-engagement';

export function ReadingDetail({
  reading,
  relatedReading,
  relatedMeditation,
}: {
  reading: PublicReadingContent;
  relatedReading?: HubReading;
  relatedMeditation?: HubMeditation;
}) {
  const cover = imageForContent(reading.slug, 3);
  const canonicalUrl = `${siteConfig.siteUrl}/oku/${encodeURIComponent(reading.slug)}`;
  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: siteConfig.siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Okumalar', item: `${siteConfig.siteUrl}/oku` },
      { '@type': 'ListItem', position: 3, name: reading.title, item: canonicalUrl },
    ],
  };
  const articleStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: reading.title,
    description: reading.description ?? undefined,
    image: [`${siteConfig.siteUrl}${cover.src}`],
    dateModified: reading.updatedAt,
    mainEntityOfPage: canonicalUrl,
    author: reading.author ? { '@type': 'Person', name: reading.author } : undefined,
    publisher: { '@type': 'Organization', name: siteConfig.name, url: siteConfig.siteUrl },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
      />
      <main>
        <div className="reading-topline site-shell">
          <Link href="/oku">Okumalar</Link>
          <span aria-hidden="true">/</span>
          <span>Farkındalık ve içgörü</span>
        </div>

        <article className="reading-article site-shell">
          <div className="reading-layout">
            <ReadingTocDesktop sections={reading.sections} />
            <div className="reading-main">
              <header className="reading-hero">
                <span className="eyebrow">Birlikte düşünmek için</span>
                <h1>{reading.title}</h1>
                {reading.description ? (
                  <p className="reading-excerpt">{reading.description}</p>
                ) : null}
                <div className="reading-meta">
                  <span>
                    <Clock3 size={15} /> {reading.estimatedMinutes ?? '—'} dk okuma
                  </span>
                  {reading.author ? <span>{reading.author}</span> : null}
                  <span>Yayınlanmış okuma</span>
                </div>
                <ReadingActions slug={reading.slug} title={reading.title} hasPdf={reading.hasPdf} />
              </header>

              <ReadingToc sections={reading.sections} />

              <figure className="reading-cover">
                <Image
                  src={cover.src}
                  alt={cover.alt}
                  fill
                  priority
                  sizes="(max-width: 800px) 100vw, 880px"
                />
              </figure>

              <ReadingBody sections={reading.sections} />

              <aside className="reading-practice-note">
                <span className="eyebrow eyebrow-light">Bir an dur</span>
                <h2>Okuduklarını kendi deneyiminde gözlemle.</h2>
                <p>
                  Bir sonraki pratiğinde bu yazıdan aklında kalan tek bir şeyi takip etmeyi dene.
                  Değiştirmeden, sadece fark ederek.
                </p>
                <Link className="button button-light" href="/pratik">
                  Bir pratik seç <ArrowRight size={17} />
                </Link>
              </aside>
            </div>
          </div>

          {relatedReading || relatedMeditation ? (
            <section className="reading-related" aria-labelledby="reading-related-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Buradan devam edebilirsin</span>
                  <h2 id="reading-related-title">İlgili içerikler</h2>
                </div>
              </div>
              <div className="related-grid">
                {relatedMeditation ? (
                  <Link
                    className="related-card related-card-dark"
                    href={`/meditasyon/${relatedMeditation.slug}`}
                  >
                    <span className="related-label">İlgili meditasyon</span>
                    <h3>{relatedMeditation.title}</h3>
                    <p>
                      {relatedMeditation.description ??
                        'Düşüncelere kapılmadan onları izlemeyi öğren.'}
                    </p>
                    <ArrowRight size={19} />
                  </Link>
                ) : null}
                {relatedReading ? (
                  <Link className="related-card" href={`/oku/${relatedReading.slug}`}>
                    <span className="related-label">Başka bir okuma</span>
                    <h3>{relatedReading.title}</h3>
                    <p>
                      {relatedReading.description ?? 'Sakin Zihin okumalarından bir başka yazı.'}
                    </p>
                    <ArrowRight size={19} />
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}
        </article>
      </main>
      <ReadingEngagement
        slug={reading.slug}
        sectionPositions={reading.sections.map((section) => section.position)}
      />
    </>
  );
}
