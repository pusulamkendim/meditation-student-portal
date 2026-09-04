import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gizlilik ve Aydınlatma',
  description: 'Sakin Zihin kurumsal iletişim talepleri ve çalışan gizliliği hakkında aydınlatma.',
  alternates: { canonical: '/gizlilik' },
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page site-shell">
      <span className="eyebrow">Gizlilik</span>
      <h1>Kurumsal iletişim ve çalışan verileri aydınlatma metni</h1>
      <p className="privacy-note">
        Son güncelleme: 4 Eylül 2026 · Bu metin yayın öncesinde hukuki danışman tarafından ayrıca
        gözden geçirilmelidir.
      </p>
      <section>
        <h2>İletişim formunda hangi bilgiler işlenir?</h2>
        <p>
          Ad, soyad, e-posta adresi, firma adı ve paylaştığınız not; talebinizi değerlendirmek, size
          e-posta üzerinden dönmek ve iletişim sürecini yürütmek amacıyla işlenir. Bu bilgiler
          pazarlama listesine eklenmez.
        </p>
      </section>
      <section>
        <h2>Nasıl korunur ve ne kadar saklanır?</h2>
        <p>
          Formdaki kişisel alanlar veritabanında şifreli saklanır. İletişime geçildi veya kapatıldı
          durumundaki taleplerin kişisel alanları son aktiviteden on iki ay sonra otomatik olarak
          silinir. Kötüye kullanımın önlenmesi için IP adresinin geri döndürülemez özeti kısa süreli
          oran sınırlamasında kullanılır; ham IP saklanmaz.
        </p>
      </section>
      <section>
        <h2>Çalışanların bireysel program verileri</h2>
        <p>
          Kurum; çalışanların isimlerini, bireysel check-in cevaplarını, yazılı veya sesli
          refleksiyonlarını, görüşme notlarını ve kişisel güçlüklerini göremez. En az beş katılımcı
          olduğunda yalnızca anonim ve toplulaştırılmış katılım, pratik ve süre özeti
          hazırlanabilir.
        </p>
      </section>
      <section>
        <h2>Paylaşım ve e-posta</h2>
        <p>
          Talebinizin alındığına dair e-posta göndermek ve yanıt sürecini yürütmek için e-posta
          teslimat hizmeti kullanılır. Verileriniz, hizmetin yürütülmesi için gerekli teknik
          sağlayıcılar dışında üçüncü kişilerle paylaşılmaz.
        </p>
      </section>
      <section>
        <h2>Haklarınız</h2>
        <p>
          Verilerinize erişim, düzeltme veya silme talebinizi Sakin Zihin’in mevcut iletişim
          kanalları üzerinden iletebilirsiniz.
        </p>
      </section>
    </main>
  );
}
