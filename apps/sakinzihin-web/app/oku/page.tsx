import type { Metadata } from 'next';
import { ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

import { ReadingCard } from '../../components/shared/content-cards';
import { SectionHeading } from '../../components/shared/section-heading';
import { imageRegistry } from '../../lib/content/images';
import { getHub } from '../../lib/api/client';
import { publicRoutes } from '../../lib/config/site';

export const metadata: Metadata = {
  title: 'Okumalar',
  description: 'Meditasyon, farkındalık ve içgörü üzerine sakin, derinlikli okumalar.',
  alternates: { canonical: '/oku' },
};

export default async function ReadingsPage() {
  const catalog = await getHub();
  const readings = catalog?.readings.slice(0, 25) ?? [];
  const featured = readings[0];

  return (
    <main>
      <section className="page-intro site-shell">
        <span className="eyebrow">Sakin Zihin kütüphanesi</span>
        <h1>Okumalar</h1>
        <p>
          Meditasyon, farkındalık ve içgörü üzerine yazılmış; düşünmeye ve içeri dönmeye davet eden
          yazılar.
        </p>
      </section>

      {featured ? (
        <section className="featured-reading site-shell" aria-labelledby="featured-reading-title">
          <div className="featured-reading-image">
            <Image
              src={imageRegistry.stoneBranch.src}
              alt={imageRegistry.stoneBranch.alt}
              fill
              priority
              sizes="(max-width: 800px) 100vw, 55vw"
            />
          </div>
          <div className="featured-reading-copy">
            <span className="eyebrow">Öne çıkan okuma</span>
            <h2 id="featured-reading-title">{featured.title}</h2>
            <p>{featured.description ?? 'Zihni susturmak değil, onu anlamaya başlamak için.'}</p>
            <div className="reading-meta">
              <span>
                <BookOpen size={15} /> {featured.estimatedMinutes ?? '—'} dk okuma
              </span>
              <span>Farkındalık ve içgörü</span>
            </div>
            <Link className="button button-dark" href={`/oku/${featured.slug}`}>
              Okumaya başla <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="reading-list-section site-shell" aria-labelledby="all-readings-title">
        <SectionHeading
          eyebrow="Yayınlanmış okumalar"
          title="Tüm okumalar"
          description="Şu an için kategori icat etmiyoruz; yazılar gerçek içerik akışından geliyor."
        />
        {readings.length > 0 ? (
          <div className="content-grid three-columns">
            {readings.map((reading, index) => (
              <ReadingCard key={reading.slug} reading={reading} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>Şu anda yayınlanmış okuma bulunmuyor.</p>
            <Link className="text-link" href={publicRoutes.meditations}>
              Ücretsiz pratiklere geç <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
