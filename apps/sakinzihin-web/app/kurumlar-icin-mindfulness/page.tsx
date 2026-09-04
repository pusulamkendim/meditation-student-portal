import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react';

import { CorporateInquiryForm } from '../../components/corporate/corporate-inquiry-form';
import { FAQ } from '../../components/one-to-one/faq';
import { PageViewTracker } from '../../components/shared/page-view-tracker';
import {
  corporateFaq,
  corporateProgramPhases,
  corporateSystemSteps,
} from '../../lib/content/marketing';

export const metadata: Metadata = {
  title: 'Kurumlar İçin Bireysel Mindfulness Eğitimi',
  description:
    'Çalışanlar için dört bireysel görüşme ve sekiz haftalık kişisel pratik takibinden oluşan mindfulness programı.',
  alternates: { canonical: '/kurumlar-icin-mindfulness' },
};

export default function CorporateMindfulnessPage() {
  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Sakin Zihin — 8 Haftalık Bireysel Mindfulness Programı',
      provider: { '@type': 'Person', name: 'Necip Sülbü' },
      areaServed: 'Türkiye',
      description:
        'Kurumların çalışanlarına sunduğu, dört bireysel görüşme ve sekiz haftalık kişisel mindfulness pratiği takibi.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: corporateFaq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ];
  return (
    <main className="corporate-page">
      <PageViewTracker event="corporate_page_view" location="corporate-page" />
      <section className="corporate-hero site-shell">
        <div>
          <span className="eyebrow">Kurumlar için bireysel mindfulness eğitimi</span>
          <h1>İş günü bittiğinde zihin her zaman aynı anda durmuyor.</h1>
          <p>
            Çalışanların bireysel görüşmeler, kendilerine göre şekillenen kısa günlük pratikler ve
            sekiz hafta boyunca kişisel takip ile mindfulness’ı öğrenebilecekleri bir çalışma.
          </p>
          <p className="corporate-summary">
            4 bireysel görüşme <span>·</span> 8 hafta pratik takibi <span>·</span> Günlük 10
            dakikadan başlayan pratik
          </p>
          <div className="hero-actions">
            <Link className="button button-dark" href="#iletisim">
              Kurumunuz için konuşalım <ArrowRight size={17} />
            </Link>
            <Link className="button button-outline" href="#program">
              Program nasıl ilerliyor?
            </Link>
          </div>
        </div>
        <div className="corporate-program-card">
          <span>Sakin Zihin</span>
          <h2>8 Haftalık Bireysel Mindfulness Programı</h2>
          <ul>
            <li>
              <Check /> Kişiye özel mindfulness pratiği
            </li>
            <li>
              <Check /> 4 bireysel görüşme
            </li>
            <li>
              <Check /> 8 hafta portal ve pratik takibi
            </li>
            <li>
              <Check /> Gerektiğinde kısa mesaj desteği
            </li>
            <li>
              <Check /> Program sonu bireysel değerlendirme
            </li>
          </ul>
        </div>
      </section>

      <section className="corporate-story">
        <div className="site-shell corporate-story-grid">
          <div>
            <span className="eyebrow eyebrow-light">Kişisel bir yerden</span>
            <h2>Yedi yıl boyunca masanın bu tarafındaydım.</h2>
          </div>
          <div>
            <p>
              ODTÜ Endüstri Mühendisliği’nden mezun olduktan sonra yedi yıl iş analisti olarak
              çalıştım. Toplantılar, projeler, yetişmesi gereken işler ve sürekli çözülmesi gereken
              problemler arasında iş günü bitse bile zihnin aynı kolaylıkla kapanmadığını yakından
              biliyorum.
            </p>
            <p>
              O yıllarda böyle bir eğitime ne kadar ihtiyaç duyduğumu bugün daha açık görüyorum: tek
              seferlik bir “iyi hissetme” etkinliğine değil, gündelik hayatın içinde küçük adımlarla
              ilerleyen ve kişiye göre değişebilen bir pratiğe.
            </p>
            <p>
              <strong>
                Bu programı çalışanların yoğunluğa biraz daha fazla dayanmasını sağlamak için değil,
                yoğunluğun içinde kendi deneyimlerini fark edebilecekleri düzenli bir alan açmak
                için hazırladım.
              </strong>
            </p>
          </div>
        </div>
      </section>

      <section className="corporate-principle site-shell">
        <div>
          <span className="eyebrow">Programın yaklaşımı</span>
          <h2>Kurumun sunduğu, çalışanın kendine ait tuttuğu bir alan.</h2>
        </div>
        <div>
          <p>
            Katılım gönüllüdür. Bireysel deneyim bir performans değerlendirmesine dönüşmez;
            görüşmelerde konuşulanlar ve günlük refleksiyonlar çalışanla benim aramda kalır.
          </p>
          <p>
            Bu çalışma psikoterapi, klinik değerlendirme veya acil destek değildir. Mindfulness’ı
            öğrenmek ve kişisel bir meditasyon pratiği kurmak için eğitim ve takip alanıdır.
          </p>
        </div>
      </section>

      <section className="corporate-program-section" id="program">
        <div className="site-shell">
          <span className="eyebrow eyebrow-light">Programın yapısı</span>
          <h2>Sakin Zihin — 8 Haftalık Bireysel Mindfulness Programı</h2>
          <p className="corporate-section-lead">
            Dört bireysel görüşme ve sekiz haftalık kişisel pratik takibi birbirini besleyen tek bir
            süreçtir.
          </p>
          <div className="corporate-phase-grid">
            {corporateProgramPhases.map((phase) => (
              <article key={phase.number}>
                <span>{phase.number}</span>
                <small>{phase.label}</small>
                <h3>{phase.title}</h3>
                <p>{phase.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="corporate-system site-shell">
        <div>
          <span className="eyebrow">Görüşmeden günlük hayata</span>
          <h2>Bir uygulama üyeliğinden fazlası: insanla yürüyen bir pratik.</h2>
          <p>
            Her çalışanın iş günü, deneyimi ve ihtiyacı farklıdır. Süreyi, saati ve tekniği bu
            gerçekliğe göre belirleriz.
          </p>
        </div>
        <ol>
          {corporateSystemSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="corporate-privacy">
        <div className="site-shell">
          <span className="eyebrow">Çalışan gizliliği</span>
          <h2>Çalışanı ölçmek için değil, pratiği anlayabilmek için takip.</h2>
          <div className="corporate-privacy-grid">
            <article>
              <Eye />
              <h3>Kurum neyi görür?</h3>
              <p>
                En az beş katılımcı olduğunda anonim ve toplulaştırılmış katılım, tamamlanan pratik
                ve süre özeti. Bu özet gerektiğinde manuel hazırlanır.
              </p>
            </article>
            <article>
              <EyeOff />
              <h3>Kurum neyi görmez?</h3>
              <p>
                İsimler, bireysel check-in’ler, yazılı veya sesli refleksiyonlar, görüşme notları ve
                kişisel güçlükler paylaşılmaz.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="corporate-role site-shell">
        <div className="corporate-role-image">
          <Image
            src="/images/necip-sulbu-birebir.jpg"
            alt="Necip Sülbü"
            fill
            sizes="(max-width: 800px) 100vw, 40vw"
          />
        </div>
        <div>
          <span className="eyebrow">Bu süreçte benim rolüm</span>
          <h2>Öğretmek, birlikte uygulamak, takip etmek ve gerektiğinde yön değiştirmek.</h2>
          <p>
            Pratiği yalnızca anlatmıyorum. Görüşmede birlikte uyguluyor, sonraki günlerde nasıl
            ilerlediğini takip ediyor ve çalışanın gerçek deneyimine göre planı değiştiriyorum.
          </p>
          <p>
            İyi olma hali, iş listesinin son maddesi değildir. Bu nedenle programı yeni bir görev
            daha eklemek yerine, günün içinde gerçekten karşılığı olan küçük bir alan olarak
            kuruyoruz.
          </p>
        </div>
      </section>

      <section className="corporate-faq site-shell">
        <div>
          <span className="eyebrow">Merak edilenler</span>
          <h2>Program hakkında sık sorulan sorular</h2>
        </div>
        <FAQ items={corporateFaq} />
      </section>

      <section className="corporate-contact" id="iletisim">
        <div className="site-shell corporate-contact-grid">
          <div>
            <span className="eyebrow eyebrow-light">İletişim</span>
            <h2>Kurumunuz için nasıl bir çalışma düşündüğünüzü anlatın.</h2>
            <p>
              Katılımcı sayısı, zamanlama ve kurumunuzdaki ihtiyaca dair kısa bir not bırakın.
              İnceleyip e-posta üzerinden size döneceğim.
            </p>
          </div>
          <CorporateInquiryForm />
        </div>
      </section>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replaceAll('<', '\\u003c') }}
        />
      ))}
    </main>
  );
}
