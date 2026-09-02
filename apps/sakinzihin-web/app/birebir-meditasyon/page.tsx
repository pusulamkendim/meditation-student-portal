import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, Check, Minus } from 'lucide-react';
import Link from 'next/link';

import { FAQ } from '../../components/one-to-one/faq';
import { ProcessFlow } from '../../components/one-to-one/process-flow';
import { TrackingDemo } from '../../components/one-to-one/tracking-demo';
import { PageViewTracker } from '../../components/shared/page-view-tracker';
import { SectionHeading } from '../../components/shared/section-heading';
import { Testimonials } from '../../components/shared/testimonials';
import { TrackedLink } from '../../components/shared/tracked-link';
import { imageRegistry } from '../../lib/content/images';
import { oneToOneFaq } from '../../lib/content/marketing';
import { publicRoutes, siteConfig } from '../../lib/config/site';

export const metadata: Metadata = {
  title: 'Birebir Meditasyon',
  description:
    'Haftalık görüşmelerin ötesine geçen, kişiye özel ve sürdürülebilir bir meditasyon pratiği oluştur.',
  alternates: { canonical: '/birebir-meditasyon' },
};

export default function OneToOnePage() {
  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: oneToOneFaq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <main>
      <PageViewTracker event="one_to_one_page_view" location="one-to-one" />
      <section className="one-to-one-hero site-shell">
        <div className="one-to-one-hero-copy">
          <span className="eyebrow">Birebir meditasyon</span>
          <h1>Meditasyon pratiğini tek başına sürdürmek zorunda değilsin.</h1>
          <p>
            Haftada yalnızca bir görüşmeyle sınırlı kalmıyorum. Seni olduğun yerden alan, kendi
            ritmine uygun, sürdürülebilir bir yol oluşturuyorum.
          </p>
          <div className="hero-actions">
            <TrackedLink
              className="button button-dark"
              href="#tanisma"
              event="intro_call_click"
              eventProperties={{ location: 'one-to-one-hero' }}
            >
              Tanışma görüşmesi yap <ArrowRight size={17} />
            </TrackedLink>
            <Link className="button button-outline" href="#surec">
              Süreci incele
            </Link>
          </div>
        </div>
        <div className="one-to-one-hero-image">
          <Image
            src={imageRegistry.mountainLake.src}
            alt={imageRegistry.mountainLake.alt}
            fill
            priority
            sizes="(max-width: 800px) 100vw, 50vw"
          />
          <div className="hero-stamp">
            <span>Görüşme</span>
            <strong>Plan</strong>
            <span>Pratik</span>
          </div>
        </div>
      </section>

      <section className="difference-section site-shell" aria-labelledby="difference-title">
        <SectionHeading
          eyebrow="Neden birebir?"
          title="Bir program değil, devam eden bir ilişki."
          description="Meditasyon pratiğinde ihtiyaç duyduğun şey her hafta aynı olmayabilir. Bu yüzden süreç, deneyimine göre yeniden şekillenir."
        />
        <div className="difference-grid">
          <div className="difference-card">
            <span>01</span>
            <h3>Seni olduğun yerden alır</h3>
            <p>
              Yeni başlıyor olman veya yıllardır meditasyon yapıyor olman, başlangıç noktanı
              belirler.
            </p>
          </div>
          <div className="difference-card difference-card-accent">
            <span>02</span>
            <h3>Görüşmeler arasında devam eder</h3>
            <p>
              Günlük pratik, check-in ve refleksiyonlar sayesinde bir sonraki görüşmeye kadar süreç
              canlı kalır.
            </p>
          </div>
          <div className="difference-card">
            <span>03</span>
            <h3>Deneyimine göre uyumlanır</h3>
            <p>
              İyi giden, zorlayan veya değişen şeyleri dikkate alarak meditasyon pratiğini teorik
              bir programa sıkıştırmıyorum.
            </p>
          </div>
        </div>
      </section>

      <section className="process-section" id="surec" aria-labelledby="process-title">
        <div className="site-shell">
          <SectionHeading
            eyebrow="Birebir çalışma süreci"
            title="Altı adımda kendi meditasyon pratiğini kur."
            description="Süreç, yalnızca görüşme anını değil, görüşmeler arasındaki günlük deneyimini de kapsar."
            light
          />
          <ProcessFlow />
        </div>
      </section>

      <section className="tracking-section site-shell" aria-labelledby="tracking-title">
        <div className="tracking-copy">
          <span className="eyebrow">Görüşmeler arasında</span>
          <h2 id="tracking-title">Pratiğin görünür hale gelir.</h2>
          <p>
            Ne zaman meditasyon yaptığını, ne kadar sürdüğünü veya sonrasında neler fark ettiğini
            takip edebilmek; değerlendirmeyi yalnızca hafızaya bırakmamanı sağlar.
          </p>
          <div className="tracking-points">
            <span>
              <Check size={16} /> Günlük pratik kaydı
            </span>
            <span>
              <Check size={16} /> Kısa check-in ve refleksiyon
            </span>
            <span>
              <Check size={16} /> Haftalık değerlendirme
            </span>
          </div>
        </div>
        <TrackingDemo />
      </section>

      <section className="suitable-section site-shell" aria-labelledby="suitable-title">
        <SectionHeading
          eyebrow="Sana uygun mu?"
          title="Bu çalışma ne aradığını bilenler için."
          description="Birebir süreç, herkese aynı şeyi vaat etmek yerine sana uygun olup olmadığını baştan açıkça ortaya koyar."
        />
        <div className="suitable-grid">
          <div className="suitable-card suitable-card-positive">
            <h3>Bu çalışma sana uygun olabilir, eğer...</h3>
            {[
              'Meditasyona başlamak veya pratiğini düzenli hale getirmek istiyorsan',
              'Kendi deneyimine göre şekillenen bir yol arıyorsan',
              'Meditasyonu gündelik hayatın içine taşımak istiyorsan',
              'Farkındalık ve içgörü üzerine derinleşmek istiyorsan',
            ].map((item) => (
              <p key={item}>
                <Check size={16} /> {item}
              </p>
            ))}
          </div>
          <div className="suitable-card suitable-card-muted">
            <h3>Bu çalışma sana uygun olmayabilir, eğer...</h3>
            {[
              'Hızlı ve tek seferde çözümler bekliyorsan',
              'Pratiği görüşmeler dışında sürdürmeye hazır değilsen',
              'Tek bir yöntemin herkese aynı şekilde uygulanmasını istiyorsan',
              'Kendi deneyimini gözlemlemek için alan açmak istemiyorsan',
            ].map((item) => (
              <p key={item}>
                <Minus size={16} /> {item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section
        className="testimonial-section site-shell"
        aria-labelledby="one-to-one-testimonials-title"
      >
        <SectionHeading eyebrow="Öğrenci deneyimleri" title="Pratik hayatın içine yerleştiğinde." />
        <Testimonials />
      </section>

      <section className="instructor-section site-shell" aria-labelledby="instructor-title">
        <div className="instructor-image">
          <Image
            src={imageRegistry.quietRoom.src}
            alt={imageRegistry.quietRoom.alt}
            fill
            sizes="(max-width: 800px) 100vw, 40vw"
          />
        </div>
        <div className="instructor-copy">
          <span className="eyebrow">Birlikte çalışacağın yaklaşım</span>
          <h2 id="instructor-title">Tek bir yöntemi herkese uygulamıyorum.</h2>
          <p>
            Yıllar boyunca farklı geleneklerde pratik yaptım ve farklı deneyimlerden geçen
            öğrencilerle çalıştım. Bugün amacım, bu birikimi öğrencinin gerçek ihtiyacına uyumlanan
            bir süreçte buluşturmak.
          </p>
          <Link className="text-link" href={publicRoutes.about}>
            Hakkımda daha fazla oku <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="pricing-section" id="tanisma" aria-labelledby="pricing-title">
        <div className="site-shell pricing-grid">
          <div>
            <span className="eyebrow eyebrow-light">Aylık birebir çalışma</span>
            <h2 id="pricing-title">Meditasyonuna sürdürülebilir bir yön ver.</h2>
            <p>Haftalık görüşmeler, kişiye özel meditasyon planı ve görüşmeler arasındaki takip.</p>
          </div>
          <div className="price-card">
            <span>Aylık program</span>
            <strong>{siteConfig.price}</strong>
            <small>4 hafta · haftalık birebir görüşme · günlük pratik takibi</small>
            <TrackedLink
              className="button button-light"
              href={siteConfig.links.introCallWhatsapp}
              event="whatsapp_click"
              eventProperties={{ location: 'pricing' }}
            >
              Tanışma görüşmesi yap <ArrowRight size={17} />
            </TrackedLink>
          </div>
        </div>
      </section>

      <section className="faq-section site-shell" aria-labelledby="faq-title">
        <SectionHeading eyebrow="Merak edilenler" title="Sık sorulan sorular" />
        <FAQ />
      </section>

      <section className="conversion-section" aria-labelledby="final-conversion-title">
        <div className="site-shell conversion-inner">
          <span className="eyebrow eyebrow-light">Birlikte başlayalım</span>
          <h2 id="final-conversion-title">
            Kendi meditasyon pratiğini oluşturmaya başlamak ister misin?
          </h2>
          <p>15 dakikalık ücretsiz bir tanışma görüşmesinde ihtiyaçlarını ve süreci konuşalım.</p>
          <TrackedLink
            className="button button-light"
            href={siteConfig.links.introCallWhatsapp}
            event="intro_call_click"
            eventProperties={{ location: 'one-to-one-final' }}
          >
            Tanışma görüşmesi yap <ArrowRight size={17} />
          </TrackedLink>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
    </main>
  );
}
