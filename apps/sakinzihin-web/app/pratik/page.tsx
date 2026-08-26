import type { Metadata } from 'next';
import { ArrowRight, Headphones } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

import { MeditationCard } from '../../components/shared/content-cards';
import { SectionHeading } from '../../components/shared/section-heading';
import { getHub } from '../../lib/api/client';
import { publicRoutes } from '../../lib/config/site';
import { imageRegistry } from '../../lib/content/images';

export const metadata: Metadata = {
  title: 'Meditasyonlar',
  description: 'Günlük pratiğine eşlik edecek rehberli meditasyonlar.',
  alternates: { canonical: '/pratik' },
};

export default async function MeditationsPage() {
  const catalog = await getHub();
  const meditations = catalog?.meditations.slice(0, 25) ?? [];
  const featured = meditations[0];

  return (
    <main>
      <section className="page-intro site-shell">
        <span className="eyebrow">Sakin Zihin pratikleri</span>
        <h1>Meditasyonlar</h1>
        <p>
          Günlük pratiğine eşlik edecek rehberli meditasyonlar. Nefes, odak, rahatlama ve daha
          fazlası.
        </p>
      </section>

      {featured ? (
        <section className="featured-practice site-shell" aria-labelledby="featured-practice-title">
          <div className="featured-practice-image">
            <Image
              src={imageRegistry.mountainLake.src}
              alt={imageRegistry.mountainLake.alt}
              fill
              priority
              sizes="(max-width: 800px) 100vw, 55vw"
            />
            <span className="image-chip image-chip-dark">
              <Headphones size={13} /> {featured.defaultDurationMinutes} dk
            </span>
          </div>
          <div className="featured-practice-copy">
            <span className="eyebrow">Bugün başlayabileceğin pratik</span>
            <h2 id="featured-practice-title">{featured.title}</h2>
            <p>{featured.description ?? 'Dikkatini bugünün deneyimine nazikçe geri getir.'}</p>
            <div className="practice-meta-row">
              <span>
                <Headphones size={16} /> {featured.defaultDurationMinutes} dk
              </span>
              <span>{featured.guided ? 'Rehberli' : 'Sessiz pratik'}</span>
            </div>
            <Link className="button button-dark" href={`/meditasyon/${featured.slug}`}>
              Pratiği başlat <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="reading-list-section site-shell" aria-labelledby="all-practices-title">
        <SectionHeading
          eyebrow="Yayınlanmış pratikler"
          title="Tüm meditasyonlar"
          description="Her pratik gerçek public içerik akışından gelir; yayınlanmamış kayıtlar burada görünmez."
        />
        {meditations.length > 0 ? (
          <div className="content-grid three-columns">
            {meditations.map((meditation, index) => (
              <MeditationCard key={meditation.slug} meditation={meditation} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>Şu anda yayınlanmış meditasyon bulunmuyor.</p>
            <Link className="text-link" href={publicRoutes.readings}>
              Okumalara geç <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
