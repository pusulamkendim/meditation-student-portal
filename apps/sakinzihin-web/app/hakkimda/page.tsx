import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, Compass, Eye } from 'lucide-react';

import { approachPrinciples, aboutSections } from '../../lib/content/marketing';
import { imageRegistry } from '../../lib/content/images';
import { publicRoutes } from '../../lib/config/site';
import { SectionHeading } from '../../components/shared/section-heading';
import { TrackedLink } from '../../components/shared/tracked-link';

export const metadata: Metadata = {
  title: 'Hakkımda',
  description: 'Meditasyon, yoga ve farkındalık pratiğiyle Sakin Zihin’in arkasındaki yaklaşım.',
  alternates: { canonical: '/hakkimda' },
};

export default function AboutPage() {
  return (
    <main>
      <section className="about-hero site-shell">
        <div className="about-hero-copy">
          <span className="eyebrow">Hakkımda</span>
          <h1>Meditasyonu hayatın dışında değil, hayatın içinde anlamak.</h1>
          <p>
            Sakin Zihin’i, meditasyonu yalnızca zihni sakinleştiren bir teknik olarak değil,
            deneyimi daha açık görebilmenin bir yolu olarak paylaşmak için oluşturdum.
          </p>
        </div>
        <div className="about-hero-image">
          <Image
            src={imageRegistry.aboutMe.src}
            alt={imageRegistry.aboutMe.alt}
            fill
            priority
            sizes="(max-width: 800px) 100vw, 50vw"
          />
        </div>
      </section>

      <section className="about-story site-shell">
        <div className="about-story-aside">
          <span className="eyebrow">Yolculuk</span>
          <div className="about-story-aside-image">
            <Image
              src={imageRegistry.practicePortrait.src}
              alt={imageRegistry.practicePortrait.alt}
              fill
              sizes="(max-width: 820px) 80vw, 24vw"
            />
          </div>
          <p>Herkes meditasyona aynı yerden başlamıyor.</p>
        </div>
        <div className="about-story-content">
          {aboutSections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="approach-section about-approach-section">
        <Image
          className="about-approach-image"
          src={imageRegistry.practiceBackdrop.src}
          alt=""
          fill
          sizes="100vw"
        />
        <div className="site-shell">
          <SectionHeading
            eyebrow="Yaklaşımım"
            title="Meditasyon bir performans değil."
            description="Daha uzun oturmak, daha az düşünmek veya her seferinde sakin hissetmek tek başına ilerleme anlamına gelmez."
            light
          />
          <div className="approach-grid">
            {approachPrinciples.map((principle, index) => {
              const Icon = index === 0 ? Eye : index === 1 ? Compass : ArrowRight;
              return (
                <div className="approach-card" key={principle.title}>
                  <Icon size={27} strokeWidth={1.25} />
                  <h3>{principle.title}</h3>
                  <p>{principle.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="about-close site-shell">
        <div>
          <span className="eyebrow">Sakin Zihin</span>
          <h2>Burada yalnızca “nasıl meditasyon yapılır?” sorusuna cevap vermek istemiyorum.</h2>
          <p>
            Dikkat, beden farkındalığı, düşünceler, duygular ve meditasyonun gündelik yaşama nasıl
            taşınabileceği üzerine okumalar ve pratikler paylaşmak istiyorum.
          </p>
        </div>
        <TrackedLink
          className="button button-dark"
          href={publicRoutes.oneToOne}
          event="one_to_one_cta_click"
          eventProperties={{ location: 'about' }}
        >
          Birlikte çalışmayı incele <ArrowRight size={17} />
        </TrackedLink>
      </section>
    </main>
  );
}
