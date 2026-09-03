import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { FAQ } from '../../components/one-to-one/faq';
import { ProcessFlow } from '../../components/one-to-one/process-flow';
import { SystemPreview } from '../../components/one-to-one/system-preview';
import { ProgressOverview, TrackingDemo } from '../../components/one-to-one/tracking-demo';
import { PageViewTracker } from '../../components/shared/page-view-tracker';
import { SectionHeading } from '../../components/shared/section-heading';
import { Testimonials } from '../../components/shared/testimonials';
import { TrackedLink } from '../../components/shared/tracked-link';
import {
  oneToOneFaq,
  oneToOneIncluded,
  oneToOneProcessSteps,
  oneToOneWeekSteps,
} from '../../lib/content/marketing';
import { publicRoutes, siteConfig } from '../../lib/config/site';

export const metadata: Metadata = {
  title: 'Birebir Meditasyon ve Günlük Pratik Takibi',
  description:
    'Haftalık Google Meet görüşmeleri, kişisel meditasyon planı, günlük hatırlatmalar, check-in ve refleksiyonlarla sürdürülebilir bir pratik oluştur.',
  alternates: { canonical: '/birebir-meditasyon' },
};

const practiceCycle = [
  'Görüşme',
  'Kişisel plan',
  'Hatırlatma',
  'Pratik',
  'Check-in ve refleksiyon',
  'Değerlendirme',
  'Yeni plan',
] as const;

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
          <span className="eyebrow">Birebir meditasyon ve günlük pratik takibi</span>
          <h1>Meditasyonu yalnızca öğrenmiyor, hayatının içinde birlikte sürdürüyoruz.</h1>
          <p>
            Birebir çalışma; haftalık Google Meet görüşmeleri, sana göre oluşturulan günlük pratik
            takvimi ve WhatsApp veya Telegram üzerinden yürütülen günlük takip sisteminden oluşur.
            Görüşmede pratiği birlikte öğrenir ve uygular, görüşmeler arasında süreci takip ederiz.
          </p>
          <p className="one-to-one-hero-summary">
            Haftalık görüşme <span>·</span> Günlük 10 dakikadan başlayan pratik <span>·</span>{' '}
            Görüşmeler arasında takip
          </p>
          <div className="hero-actions">
            <TrackedLink
              className="button button-dark"
              href="#tanisma"
              event="intro_call_click"
              eventProperties={{ location: 'one-to-one-hero' }}
            >
              Ücretsiz Tanışma Görüşmesi Yap <ArrowRight size={17} />
            </TrackedLink>
            <Link className="button button-outline" href="#surec">
              Sistem Nasıl İşliyor? <ArrowRight size={17} />
            </Link>
          </div>
        </div>
        <SystemPreview />
      </section>

      <section className="continuity-section site-shell" aria-labelledby="continuity-title">
        <div className="continuity-heading">
          <span className="eyebrow">Haftalık görüşmeden günlük pratiğe</span>
          <h2 id="continuity-title">
            Görüşmede öğrendiğini, sonraki günlerde kendi pratiğine dönüştürüyorsun.
          </h2>
        </div>
        <div className="continuity-copy">
          <p>
            Meditasyonla ilgili birçok şeyi bir görüşmede konuşabiliriz. Fakat pratiğin gerçekten
            nasıl ilerlediği, çoğunlukla görüşmeden sonraki günlerde ortaya çıkar. Hangi gün oturmak
            zor geldi? Zihin çok hareketli olduğunda ne oldu? Belirlediğimiz saat gerçek hayatına
            uydu mu? Bir teknik sana iyi gelirken diğeri neden zorladı?
          </p>
          <p>
            Bu nedenle birebir çalışma yalnızca haftada bir kez yaptığımız görüşmeden oluşmuyor.
            Görüşmede öğrendiklerini günlük hayatında uygulayabileceğin bir plana dönüştürüyoruz.
            Sistem sana uygun saatlerde hatırlatma gönderiyor, pratik sonrasında kısa bir check-in
            yapıyor ve istersen deneyimini yazılı veya sesli olarak paylaşabiliyorsun.
          </p>
          <p>
            Ben de görüşmeler arasındaki süreci takip edebiliyorum. Böylece bir sonraki görüşmede
            yalnızca “haftan nasıl geçti?” diye sormak yerine, pratiğin gerçek akışı üzerinden
            konuşuyoruz.
          </p>
        </div>
      </section>

      <section className="process-section" id="surec">
        <div className="site-shell">
          <SectionHeading
            eyebrow="İlk mesajdan yeni plana"
            title="Sistem dört aşamada ilerliyor."
            description="Görüşme, günlük uygulama ve takip birbirinden ayrı parçalar değil; her hafta tekrar eden tek bir çalışma döngüsüdür."
            light
          />
          <ProcessFlow steps={oneToOneProcessSteps} detailed />
        </div>
      </section>

      <section className="week-flow-section site-shell" aria-labelledby="week-flow-title">
        <div className="week-flow-intro">
          <span className="eyebrow">Bir haftanın akışı</span>
          <h2 id="week-flow-title">Görüşmeden sonraki günlerde ne oluyor?</h2>
          <p>
            Sürecin her adımı bir sonraki adıma bilgi taşır. Günlük uygulama yalnızca bir görev
            listesi değil, sonraki görüşmenin temelidir.
          </p>
        </div>
        <div className="week-flow-list">
          {oneToOneWeekSteps.map((step) => (
            <article className="week-flow-item" key={step.number}>
              <div className="week-flow-marker">
                <span>{step.number}</span>
              </div>
              <div>
                <span className="week-flow-label">{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="tracking-section site-shell" aria-labelledby="tracking-title">
        <div className="tracking-copy">
          <span className="eyebrow">Günlük sistem</span>
          <h2 id="tracking-title">Pratik zamanı geldiğinde ne yapacağını bilirsin.</h2>
          <p>
            Belirlediğimiz saatte WhatsApp veya Telegram üzerinden günlük hatırlatmanı alırsın.
            Sayacı açıp pratiğini tamamladıktan sonra kısa bir check-in yaparsın. Yaşadığın bir
            güçlük, fark ettiğin bir şey veya sormak istediğin bir konu varsa refleksiyon
            bırakabilirsin.
          </p>
          <p>
            Refleksiyon zorunlu değildir. Bazı günler yalnızca “Yaptım” veya “Yapamadım” demen
            yeterlidir. İstersen birkaç cümle yazabilir, istersen sesli mesaj bırakabilirsin.
          </p>
          <div className="tracking-points">
            <span>
              <Check size={16} /> Otomatik günlük hatırlatma
            </span>
            <span>
              <Check size={16} /> Sayaç ve pratik bağlantısı
            </span>
            <span>
              <Check size={16} /> Check-in ve isteğe bağlı refleksiyon
            </span>
          </div>
        </div>
        <TrackingDemo />
      </section>

      <section className="adaptive-plan-section site-shell" aria-labelledby="adaptive-plan-title">
        <div className="adaptive-plan-copy">
          <span className="eyebrow">Kişisel ritim</span>
          <h2 id="adaptive-plan-title">
            Hayatını pratiğe göre değil, pratiği hayatına göre düzenliyoruz.
          </h2>
          <p>
            Her öğrenci için aynı süreyi, aynı saati veya aynı meditasyonu kullanmıyorum. Sabah
            pratik yapmak sana uygun değilse akşamı seçebiliriz. Her gün uzun süre ayıramıyorsan 10
            dakikayla başlayabiliriz. Rehberli meditasyonla başlamak gerekiyorsa onu kullanır,
            sessiz pratiğe geçmek gerekiyorsa planı buna göre değiştiririz.
          </p>
          <p>
            Önemli olan kusursuz bir takvim oluşturmak değil; gerçek hayatının içinde
            sürdürülebilecek bir ritim bulmaktır. “Yapamadım” cevabı da bu nedenle sistemin anlamlı
            bir parçasıdır. Bazen planın sana uymadığını ancak uygulanamadığında görebiliriz.
          </p>
        </div>
        <div className="sample-plan-card">
          <div className="sample-plan-head">
            <span>Örnek günlük plan</span>
            <small>Öğrenciye göre değişir</small>
          </div>
          <div className="sample-plan-row">
            <span>Günler</span>
            <strong>Her gün</strong>
          </div>
          <div className="sample-plan-row">
            <span>Saat</span>
            <strong>21.30</strong>
          </div>
          <div className="sample-plan-row">
            <span>Süre</span>
            <strong>10 dakika</strong>
          </div>
          <div className="sample-plan-row">
            <span>Pratik</span>
            <strong>Nefes farkındalığı</strong>
          </div>
          <div className="sample-plan-row">
            <span>Hatırlatma</span>
            <strong>WhatsApp</strong>
          </div>
          <p>Bu yalnızca bir örnektir. Günler, saat, süre ve pratik türü birlikte belirlenir.</p>
        </div>
      </section>

      <section className="monitoring-section">
        <div className="site-shell monitoring-grid">
          <ProgressOverview />
          <div className="monitoring-copy">
            <span className="eyebrow eyebrow-light">Görüşmeler arasında</span>
            <h2>Günlük takip bir kontrol mekanizması değil, pratiği anlayabilmenin bir yolu.</h2>
            <p>
              Sistem üzerinden hangi günlerde pratik yaptığını, planlanan ve tamamlanan pratik
              sayılarını, toplam meditasyon süreni ve bıraktığın refleksiyonları görebiliyorum. Bu
              bilgiler pratiğin gerçek hayatta nasıl ilerlediğine dair bir çerçeve sunuyor.
            </p>
            <p>
              Amaç seni her gün daha fazla pratik yapmaya zorlamak değil. Zorlandığın noktaları
              erken görebilmek, işe yaramayan bir planı sürdürmemek ve ihtiyaç olduğunda
              yönlendirmeyi değiştirebilmektir.
            </p>
          </div>
        </div>
      </section>

      <section className="practice-cycle-section site-shell" aria-labelledby="practice-cycle-title">
        <div className="practice-cycle-copy">
          <span className="eyebrow">Her hafta yeniden</span>
          <h2 id="practice-cycle-title">Aynı programı tekrar etmiyoruz.</h2>
          <p>
            Bir sonraki görüşmede haftanın kayıtlarını ve asıl olarak senin deneyimini birlikte
            değerlendiriyoruz. Pratik uzun geldiyse süreyi azaltabilir, düzen oluştuysa
            artırabiliriz. Bir teknik seni gereğinden fazla zorluyorsa başka bir yaklaşım
            deneyebiliriz.
          </p>
        </div>
        <div className="practice-cycle" aria-label="Haftalık çalışma döngüsü">
          {practiceCycle.map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
              {index < practiceCycle.length - 1 ? <ArrowRight size={17} /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="testimonial-section site-shell">
        <SectionHeading eyebrow="Öğrenci deneyimleri" title="Pratik hayatın içine yerleştiğinde." />
        <Testimonials />
      </section>

      <section className="instructor-section site-shell" aria-labelledby="instructor-title">
        <div className="instructor-image">
          <Image
            src="/images/necip-sulbu-birebir.jpg"
            alt="Meditasyon eğitmeni Necip Sülbü"
            fill
            sizes="(max-width: 800px) 100vw, 40vw"
          />
        </div>
        <div className="instructor-copy">
          <span className="eyebrow">Birlikte çalışacağın yaklaşım</span>
          <h2 id="instructor-title">Bu süreçte benim rolüm ne?</h2>
          <p>
            Rolüm sana her gün aynı meditasyonu hatırlatmakla sınırlı değil. Görüşmelerde pratiği
            öğretmek, birlikte uygulamak, deneyimini anlamak ve gerektiğinde yönünü değiştirmek için
            buradayım.
          </p>
          <p>
            Günlük kayıtlar pratiğin dışarıdan görünen kısmını gösterir. Görüşmelerde ise o
            kayıtların arkasındaki deneyime bakarız: Zihin ne zaman zorlandı, beden nasıl tepki
            verdi, hangi yaklaşım yardımcı oldu ve pratiği gündelik hayatına nasıl taşıyabiliriz?
          </p>
          <Link className="text-link" href={publicRoutes.about}>
            Hakkımda daha fazla oku <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="pricing-section" id="tanisma" aria-labelledby="pricing-title">
        <div className="site-shell pricing-grid">
          <div className="pricing-copy">
            <span className="eyebrow eyebrow-light">Çalışma düzeni</span>
            <h2 id="pricing-title">
              Dört hafta boyunca görüşme ve günlük pratik birlikte ilerler.
            </h2>
            <div className="pricing-included">
              {oneToOneIncluded.map((item) => (
                <span key={item}>
                  <Check size={15} /> {item}
                </span>
              ))}
            </div>
          </div>
          <div className="price-card">
            <span>Aylık birebir çalışma</span>
            <strong>{siteConfig.price}</strong>
            <small>4 hafta · haftalık birebir görüşme · günlük pratik takibi</small>
            <TrackedLink
              className="button button-light"
              href={siteConfig.links.introCallWhatsapp}
              event="whatsapp_click"
              eventProperties={{ location: 'pricing' }}
            >
              Ücretsiz Tanışma Görüşmesi Yap <ArrowRight size={17} />
            </TrackedLink>
          </div>
        </div>
      </section>

      <section className="faq-section site-shell">
        <SectionHeading
          eyebrow="Sisteme dair"
          title="Sık sorulan sorular"
          description="Görüşmeler, günlük takip ve mesaj akışıyla ilgili merak edebileceğin ayrıntılar."
        />
        <FAQ />
      </section>

      <section className="conversion-section" aria-labelledby="final-conversion-title">
        <div className="site-shell conversion-inner">
          <span className="eyebrow eyebrow-light">Birlikte başlayalım</span>
          <h2 id="final-conversion-title">İlk adım yalnızca bir mesaj.</h2>
          <p>
            WhatsApp üzerinden bana ulaşabilirsin. Kısa bir tanışma görüşmesinde mevcut deneyimini,
            neden meditasyon yapmak istediğini ve çalışma düzeninin sana uygun olup olmadığını
            konuşalım.
          </p>
          <TrackedLink
            className="button button-light"
            href={siteConfig.links.introCallWhatsapp}
            event="intro_call_click"
            eventProperties={{ location: 'one-to-one-final' }}
          >
            Ücretsiz Tanışma Görüşmesi Yap <ArrowRight size={17} />
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
