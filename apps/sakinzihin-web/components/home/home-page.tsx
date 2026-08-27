import Image from 'next/image';
import { ArrowRight, Heart, Leaf, Moon, Sparkles, Target, Waves } from 'lucide-react';
import Link from 'next/link';

import type { HubCatalog } from '../../lib/api/types';
import { imageRegistry } from '../../lib/content/images';
import { homeCopy, needCards, principles } from '../../lib/content/marketing';
import { publicRoutes } from '../../lib/config/site';
import { MeditationCard, ReadingCard } from '../shared/content-cards';
import { SectionHeading } from '../shared/section-heading';
import { Testimonials } from '../shared/testimonials';
import { TrackedLink } from '../shared/tracked-link';
import { ProcessFlow } from '../one-to-one/process-flow';

const needIcons = [Leaf, Moon, Target, Heart, Waves, Sparkles] as const;

export function HomePage({ catalog }: { catalog: HubCatalog | null }) {
  const meditations = catalog?.meditations.slice(0, 3) ?? [];
  const readings = catalog?.readings.slice(0, 3) ?? [];

  return (
    <main>
      <section className="home-hero">
        <div className="site-shell home-hero-grid">
          <div className="home-hero-copy">
            <span className="eyebrow">{homeCopy.eyebrow}</span>
            <h1>{homeCopy.title}</h1>
            <p className="home-hero-description-long">{homeCopy.description}</p>
            <p className="home-hero-description-short">{homeCopy.mobileDescription}</p>
            <div className="hero-actions">
              <TrackedLink
                className="button button-dark"
                href={publicRoutes.meditations}
                event="meditation_view"
                eventProperties={{ location: 'home-hero' }}
              >
                Ücretsiz pratiklere başla <ArrowRight size={17} />
              </TrackedLink>
              <TrackedLink
                className="button button-outline"
                href={publicRoutes.oneToOne}
                event="one_to_one_cta_click"
                eventProperties={{ location: 'home-hero' }}
              >
                Birebir çalışmayı incele
              </TrackedLink>
            </div>
            <div className="hero-note">
              <span className="hero-note-mark">✦</span>
              <span>Ücretsiz pratikler ve okumalarla kendi ritminde başla.</span>
            </div>
          </div>
          <div className="home-hero-visual">
            <Image
              src={imageRegistry.hero.src}
              alt={imageRegistry.hero.alt}
              fill
              priority
              sizes="(max-width: 800px) 100vw, 52vw"
            />
            <div className="hero-image-caption">
              <span>Fark etmek için</span>
              <strong>Alan aç</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="needs-section site-shell" aria-labelledby="needs-title">
        <SectionHeading
          eyebrow="Kendine yakın olanı seç"
          title="Bugün neye ihtiyacın var?"
          description="Pratiğe nereden başlayacağını bilmiyorsan, şu anki deneyiminden başlayabilirsin."
        />
        <div className="need-grid">
          {needCards.map((card, index) => {
            const Icon = needIcons[index];
            return (
              <Link className="need-card" href={card.href} key={card.title}>
                <span className="need-icon">
                  <Icon size={23} strokeWidth={1.25} />
                </span>
                <strong>
                  <span className="need-copy-default">{card.title}</span>
                  <span className="need-copy-mobile">{card.mobileTitle}</span>
                </strong>
                <span className="need-detail">
                  <span className="need-copy-default">{card.detail}</span>
                  <span className="need-copy-mobile">{card.mobileDetail}</span>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="content-section site-shell" aria-labelledby="meditations-title">
        <SectionHeading
          eyebrow="Ücretsiz pratikler"
          title="Ücretsiz meditasyonlar"
          description="Nefes, odak, beden ve dinlenme için rehberli pratikler."
          action={
            <Link href={publicRoutes.meditations}>
              Tümünü gör <ArrowRight size={16} />
            </Link>
          }
        />
        {meditations.length > 0 ? (
          <div className="content-grid three-columns home-content-grid home-meditation-grid">
            {meditations.map((meditation, index) => (
              <MeditationCard key={meditation.slug} meditation={meditation} index={index} />
            ))}
          </div>
        ) : (
          <EmptyContentNotice text="Şu anda yayınlanmış pratik bulunmuyor." />
        )}
      </section>

      <section
        className="content-section site-shell reading-home-section"
        aria-labelledby="readings-title"
      >
        <SectionHeading
          eyebrow="Okumalar"
          title="Öne çıkan okumalar"
          description="Dikkat, beden, duygular ve gündelik yaşama taşınan farkındalık üzerine yazılar."
          action={
            <Link href={publicRoutes.readings}>
              Tümünü gör <ArrowRight size={16} />
            </Link>
          }
        />
        {readings.length > 0 ? (
          <div className="content-grid three-columns home-content-grid home-reading-grid">
            {readings.map((reading, index) => (
              <ReadingCard key={reading.slug} reading={reading} index={index + 3} />
            ))}
          </div>
        ) : (
          <EmptyContentNotice text="Şu anda yayınlanmış okuma bulunmuyor." />
        )}
      </section>

      <section className="philosophy-section" aria-labelledby="philosophy-title">
        <Image
          className="philosophy-image"
          src={imageRegistry.forestLight.src}
          alt=""
          fill
          sizes="(max-width: 800px) 100vw, 45vw"
          aria-hidden="true"
        />
        <div className="site-shell philosophy-grid">
          <div>
            <span className="eyebrow eyebrow-light">Yaklaşım</span>
            <h2 id="philosophy-title">Meditasyon bir performans değil.</h2>
            <p>
              Ne kadar uzun oturduğun veya zihninin ne kadar sustuğu tek başına ilerleme değildir.
              Önemli olan, deneyime daha yakından bakmayı öğrenmektir.
            </p>
          </div>
          <div className="principles-grid">
            {principles.map((principle) => (
              <div className="principle" key={principle.number}>
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="one-to-one-preview site-shell" aria-labelledby="one-to-one-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Birebir meditasyon</span>
            <h2 id="one-to-one-title">Pratik, görüşmeler arasında da devam eder.</h2>
            <p>
              Haftada yalnızca bir görüşmeyle sınırlı kalmıyorum. Sana uygun planla günlük pratik,
              check-in ve refleksiyonlar arasında pratiğine eşlik ediyorum.
            </p>
          </div>
          <TrackedLink
            className="text-link"
            href={publicRoutes.oneToOne}
            event="one_to_one_cta_click"
            eventProperties={{ location: 'home-process' }}
          >
            Süreç hakkında daha fazla bilgi al <ArrowRight size={17} />
          </TrackedLink>
        </div>
        <ProcessFlow />
      </section>

      <section className="testimonial-section site-shell" aria-labelledby="testimonials-title">
        <SectionHeading
          eyebrow="Öğrenci deneyimleri"
          title="Değişim, pratiğin hayatın içine taşındığı yerde başlar."
        />
        <Testimonials />
      </section>

      <section className="home-final-cta">
        <div className="site-shell final-cta-inner">
          <div>
            <span className="eyebrow eyebrow-light">Kendi ritmin</span>
            <h2>Kendi meditasyon pratiğini oluşturmaya başlamak ister misin?</h2>
            <p>
              İstersen ücretsiz pratiklerle başla, istersen senin için sana uygun bir yol
              hazırlayayım.
            </p>
          </div>
          <div className="hero-actions">
            <TrackedLink
              className="button button-light"
              href={`${publicRoutes.oneToOne}#tanisma`}
              event="intro_call_click"
              eventProperties={{ location: 'home-final-cta' }}
            >
              Tanışma görüşmesi yap <ArrowRight size={17} />
            </TrackedLink>
            <Link className="button button-outline-light" href={publicRoutes.meditations}>
              Önce ücretsiz pratikleri dene
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function EmptyContentNotice({ text }: { text: string }) {
  return <p className="empty-content">{text}</p>;
}
