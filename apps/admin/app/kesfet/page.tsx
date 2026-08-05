import type { Metadata } from 'next';
import {
  ArrowRight,
  BookOpenText,
  Clock3,
  Flower2,
  Headphones,
  Layers3,
  MessageCircle,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';

import styles from './page.module.css';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const publicOrigin = 'https://sakinzihin.com';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sakin Zihin | Meditasyon ve Farkındalık Kütüphanesi',
  description:
    'Rehberli meditasyonlar, sessiz pratikler ve farkındalık okumalarıyla kendi ritminde başla.',
  alternates: { canonical: publicOrigin },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: publicOrigin,
    siteName: 'Sakin Zihin',
    title: 'Meditasyon ve Farkındalık Kütüphanesi',
    description: 'Kısa meditasyonlar ve derinleştirici okumalarla pratiğine yer aç.',
  },
};

type HubReading = {
  slug: string;
  title: string;
  description?: string | null;
  author?: string | null;
  estimatedMinutes: number;
  sectionCount: number;
  hasPdf: boolean;
  allowIndexing: boolean;
  updatedAt: string;
};

type HubMeditation = {
  slug: string;
  title: string;
  description?: string | null;
  level: string;
  guided: boolean;
  durations: number[];
  defaultDurationMinutes: number;
  allowDurationSelection: boolean;
  allowIndexing: boolean;
  updatedAt: string;
};

type HubCatalog = {
  readings: HubReading[];
  meditations: HubMeditation[];
  generatedAt: string;
};

const emptyCatalog: HubCatalog = { readings: [], meditations: [], generatedAt: '' };

async function getCatalog(): Promise<{ catalog: HubCatalog; available: boolean }> {
  try {
    const response = await fetch(`${api}/v1/public/hub`, { cache: 'no-store' });
    if (!response.ok) return { catalog: emptyCatalog, available: false };
    return { catalog: (await response.json()) as HubCatalog, available: true };
  } catch {
    return { catalog: emptyCatalog, available: false };
  }
}

function attributedPath(path: string) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}utm_source=hub&utm_medium=owned&utm_campaign=sakin_zihin`;
}

function durationLabel(durations: number[]) {
  if (durations.length === 0) return 'Süre seçilebilir';
  if (durations.length === 1) return `${durations[0]} dakika`;
  return `${Math.min(...durations)}-${Math.max(...durations)} dakika`;
}

function levelLabel(level: string) {
  return (
    {
      INTRODUCTION: 'Başlangıç',
      INTERMEDIATE: 'Orta seviye',
      ADVANCED: 'İleri seviye',
    }[level] ?? 'Her seviye'
  );
}

export default async function ContentHubPage() {
  const { catalog, available } = await getCatalog();
  const whatsappNumber = (
    process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER ?? '905428078429'
  ).replace(/\D/gu, '');
  const whatsappMessage =
    'Merhaba Necip, Sakin Zihin içeriklerini gördüm. Birebir meditasyon programı hakkında bilgi almak istiyorum.';
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
  const firstMeditation = catalog.meditations[0];
  const primaryHref = firstMeditation
    ? attributedPath(
        `/meditasyon/${encodeURIComponent(firstMeditation.slug)}?sure=${firstMeditation.defaultDurationMinutes}`,
      )
    : '#meditasyonlar';
  const itemList = [...catalog.meditations, ...catalog.readings]
    .filter((item) => item.allowIndexing)
    .map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.title,
      url: `${publicOrigin}/${
        'durations' in item ? 'meditasyon' : 'oku'
      }/${encodeURIComponent(item.slug)}`,
    }));
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Sakin Zihin Meditasyon ve Farkındalık Kütüphanesi',
    description: 'Meditasyonlar ve farkındalık okumaları.',
    url: publicOrigin,
    mainEntity: { '@type': 'ItemList', itemListElement: itemList },
  };

  return (
    <main className={styles.hub}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll('<', '\\u003c'),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.background} />
          <div className={styles.shade} />
          <div className={styles.grain} />
        </div>
        <header className={styles.header}>
          <a className={styles.brand} href="/kesfet" aria-label="Sakin Zihin ana sayfa">
            <Flower2 aria-hidden="true" />
            <span>SAKİN ZİHİN</span>
          </a>
          <nav aria-label="İçerik bölümleri">
            <a href="#meditasyonlar">Meditasyonlar</a>
            <a href="#okumalar">Okumalar</a>
            <a href="#birebir">Birebir</a>
          </nav>
        </header>

        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>KENDİ RİTMİNDE BAŞLA</span>
          <h1>Meditasyon ve farkındalık kütüphanesi</h1>
          <p>
            Kısa pratiklerle dur, dikkatini topla ve deneyimini okumalarla derinleştir. Buradaki
            içeriklere ücretsiz, üyelik gerektirmeden ulaşabilirsin.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href={primaryHref}>
              <Play aria-hidden="true" />
              İlk pratiği başlat
            </a>
            <a className={styles.secondaryButton} href="#okumalar">
              <BookOpenText aria-hidden="true" />
              Okumaları keşfet
            </a>
          </div>
        </div>

        <a className={styles.scrollCue} href="#meditasyonlar">
          Kütüphaneyi keşfet <ArrowRight aria-hidden="true" />
        </a>
      </section>

      {!available ? (
        <section className={styles.availability} role="status">
          İçerik kütüphanesi kısa süreliğine yenileniyor. Biraz sonra tekrar deneyebilirsin.
        </section>
      ) : null}

      <section className={styles.librarySection} id="meditasyonlar">
        <div className={styles.sectionHeading}>
          <div>
            <span>PRATİK ALANI</span>
            <h2>Meditasyonlar</h2>
          </div>
          <p>{catalog.meditations.length} pratik</p>
        </div>

        {catalog.meditations.length ? (
          <div className={styles.cardGrid}>
            {catalog.meditations.map((meditation, index) => (
              <a
                className={styles.contentCard}
                href={attributedPath(
                  `/meditasyon/${encodeURIComponent(meditation.slug)}?sure=${meditation.defaultDurationMinutes}`,
                )}
                key={meditation.slug}
              >
                <div className={styles.cardTopline}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{levelLabel(meditation.level)}</span>
                </div>
                <div className={styles.cardIcon}>
                  {meditation.guided ? (
                    <Volume2 aria-hidden="true" />
                  ) : (
                    <VolumeX aria-hidden="true" />
                  )}
                </div>
                <div className={styles.cardCopy}>
                  <h3>{meditation.title}</h3>
                  {meditation.description ? <p>{meditation.description}</p> : null}
                </div>
                <div className={styles.cardFooter}>
                  <span>
                    <Clock3 aria-hidden="true" /> {durationLabel(meditation.durations)}
                  </span>
                  <span>
                    {meditation.guided ? 'Sesli yönlendirme' : 'Sessiz sayaç'}
                    <ArrowRight aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Headphones aria-hidden="true" />
            <p>Yeni meditasyonlar hazırlanıyor.</p>
          </div>
        )}
      </section>

      <section className={`${styles.librarySection} ${styles.readingSection}`} id="okumalar">
        <div className={styles.sectionHeading}>
          <div>
            <span>DERİNLEŞTİR</span>
            <h2>Okumalar</h2>
          </div>
          <p>{catalog.readings.length} okuma</p>
        </div>

        {catalog.readings.length ? (
          <div className={styles.cardGrid}>
            {catalog.readings.map((reading, index) => (
              <a
                className={`${styles.contentCard} ${styles.readingCard}`}
                href={attributedPath(`/oku/${encodeURIComponent(reading.slug)}`)}
                key={reading.slug}
              >
                <div className={styles.cardTopline}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{reading.hasPdf ? 'PDF mevcut' : 'Dijital okuma'}</span>
                </div>
                <div className={styles.cardIcon}>
                  <BookOpenText aria-hidden="true" />
                </div>
                <div className={styles.cardCopy}>
                  <h3>{reading.title}</h3>
                  {reading.description ? <p>{reading.description}</p> : null}
                </div>
                <div className={styles.cardFooter}>
                  <span>
                    <Clock3 aria-hidden="true" /> {reading.estimatedMinutes} dakika
                  </span>
                  <span>
                    <Layers3 aria-hidden="true" /> {reading.sectionCount} bölüm
                    <ArrowRight aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <BookOpenText aria-hidden="true" />
            <p>Yeni okumalar hazırlanıyor.</p>
          </div>
        )}
      </section>

      <section className={styles.privateSection} id="birebir">
        <div>
          <span>BİREBİR MEDİTASYON</span>
          <h2>Pratiğini sana uygun bir düzene dönüştür.</h2>
          <p>
            Haftalık birebir görüşmeler, kişisel pratik planı ve düzenli takip ile süreci birlikte
            sürdürelim.
          </p>
        </div>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" />
          Programı konuşalım
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/kesfet">
          <Flower2 aria-hidden="true" /> SAKİN ZİHİN
        </a>
        <p>Farkındalıkla devam et.</p>
        <span>© {new Date().getFullYear()} Necip Sülbü</span>
      </footer>
    </main>
  );
}
