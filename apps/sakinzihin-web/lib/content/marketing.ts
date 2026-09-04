export const homeCopy = {
  eyebrow: 'Sakin Zihin',
  title: 'Meditasyon yapmayı öğren. Zihnini daha yakından tanı.',
  description:
    'Yeni başlayanlar için rehberli meditasyonlar, farkındalık okumaları ve kişiye özel birebir çalışma. Ücretsiz pratiklerle hemen başlayabilirsin.',
  mobileDescription:
    'Yeni başlayanlar için rehberli meditasyonlar, farkındalık okumaları ve kişiye özel birebir çalışma. Ücretsiz pratiklerle hemen başlayabilirsin.',
};

export const needCards = [
  {
    title: 'Zihnim çok hareketli',
    detail: 'Düşüncelerin arasında biraz alan aç.',
    mobileTitle: 'Sakinleşmek',
    mobileDetail: 'Stresi azalt',
    href: '/pratik',
  },
  {
    title: 'Meditasyona yeni başlıyorum',
    detail: 'Başlamak için sade ve rehberli pratikler.',
    mobileTitle: 'Yeni başlıyorum',
    mobileDetail: 'İlk pratiğini seç',
    href: '/pratik',
  },
  {
    title: 'Odaklanmakta zorlanıyorum',
    detail: 'Dikkatin nereye gittiğini fark etmeyi öğren.',
    mobileTitle: 'Odaklanmak',
    mobileDetail: 'Zihni netleştir',
    href: '/pratik',
  },
  {
    title: 'Düzenli pratik oluşturamıyorum',
    detail: 'Kendine uygun, sürdürülebilir bir ritim kur.',
    mobileTitle: 'Kendine iyi bak',
    mobileDetail: 'İç dengeyi güçlendir',
    href: '/birebir-meditasyon',
  },
  {
    title: 'Duygularımla çalışmak istiyorum',
    detail: 'Ortaya çıkan deneyime daha yakından bak.',
    mobileTitle: 'Duygular',
    mobileDetail: 'Deneyime alan aç',
    href: '/oku',
  },
  {
    title: 'Meditasyonu derinleştirmek istiyorum',
    detail: 'Pratiğini kendi deneyimine göre geliştir.',
    mobileTitle: 'Derinleşmek',
    mobileDetail: 'Pratiği geliştir',
    href: '/birebir-meditasyon',
  },
] as const;

export const principles = [
  {
    number: '01',
    title: 'Gözlemle',
    text: 'Zihin ve bedende ne olduğunu fark et.',
  },
  {
    number: '02',
    title: 'Anla',
    text: 'Ortaya çıkan deneyime otomatik tepki vermeden bak.',
  },
  {
    number: '03',
    title: 'Uyumla',
    text: 'Pratiği mevcut deneyime göre geliştir.',
  },
] as const;

export const processSteps = [
  {
    number: '01',
    title: 'Görüşme',
    text: 'Mevcut pratiğini ve ihtiyaçlarını anlamaya çalışıyorum.',
  },
  { number: '02', title: 'Plan', text: 'Sana özel bir pratik planı oluşturuyorum.' },
  {
    number: '03',
    title: 'Pratik',
    text: 'Günlük pratiklerinden önce sana hatırlatmalar gönderiyorum.',
  },
  {
    number: '04',
    title: 'Check-in',
    text: 'Düzenli check-in ve destekle pratiğini takip ediyorum.',
  },
  { number: '05', title: 'Refleksiyon', text: 'Deneyimini daha yakından görmene eşlik ediyorum.' },
  { number: '06', title: 'Değerlendirme', text: 'İlerlemene göre pratiğini yeniden düzenliyorum.' },
] as const;

export const oneToOneProcessSteps = [
  {
    number: '01',
    title: 'Kayıt ve görüşme takvimi',
    text: 'WhatsApp veya Telegram üzerinden sisteme kaydolur, her hafta görüşeceğimiz gün ve saati birlikte belirleriz.',
  },
  {
    number: '02',
    title: 'Görüşme ve birlikte pratik',
    text: 'Google Meet bağlantın görüşmeden önce otomatik gelir. Görüşmede tekniği açıklar, birlikte uygular ve deneyimini konuşuruz.',
  },
  {
    number: '03',
    title: 'Kişisel haftalık plan',
    text: 'Günlerini, saatlerini, süreyi ve meditasyon türünü hayatına göre belirleriz. Başlangıç için günde 10 dakika bile yeterli olabilir.',
  },
  {
    number: '04',
    title: 'Takip ve yeni plan',
    text: 'Günlük check-in ve refleksiyonlarını takip ederim. Sonraki görüşmede pratiği derinleştirir, sadeleştirir veya değiştiririz.',
  },
] as const;

export const oneToOneWeekSteps = [
  {
    number: '01',
    label: 'Görüşme günü',
    title: 'Önce deneyimine bakıyor, sonra birlikte pratik yapıyoruz.',
    text: 'Geçen haftanın nasıl ilerlediğini konuşuyoruz. O gün çalışacağımız meditasyonu açıklıyor, birlikte uyguluyor ve pratik sırasında yaşadıklarını değerlendiriyoruz.',
  },
  {
    number: '02',
    label: 'Görüşmeden sonra',
    title: 'O haftanın günlük takvimini birlikte oluşturuyoruz.',
    text: 'Hangi günlerde, saat kaçta ve kaç dakika pratik yapacağını belirliyoruz. Süre, saat ve meditasyon türü hazır bir programa göre değil, senin hayatına göre şekilleniyor.',
  },
  {
    number: '03',
    label: 'Her gün',
    title: 'Hatırlatma, belirlediğimiz saatte sana geliyor.',
    text: 'WhatsApp veya Telegram üzerinden günlük pratik mesajını alıyorsun. Mesajdaki bağlantıyı kullanarak sayacı açabilir ve o günkü pratiğine başlayabilirsin.',
  },
  {
    number: '04',
    label: 'Pratikten sonra',
    title: 'Kısa bir check-in ile sonucu işaretliyorsun.',
    text: 'Pratiğini “Yaptım” veya “Yapamadım” olarak kaydediyorsun. İstersen meditasyonun nasıl geçtiğini yazılı ya da sesli bir refleksiyonla paylaşabiliyorsun.',
  },
  {
    number: '05',
    label: 'Hafta boyunca',
    title: 'Görüşmeler arasındaki süreci takip ediyorum.',
    text: 'Pratik durumlarını ve paylaştığın refleksiyonları görebiliyorum. Tekrarlayan bir güçlük varsa bir sonraki görüşmeyi beklemeden kısa bir yönlendirme yapabiliyorum.',
  },
  {
    number: '06',
    label: 'Sonraki görüşme',
    title: 'Plan, gerçek deneyimine göre yeniden şekilleniyor.',
    text: 'Hangi pratiğin yardımcı olduğunu ve nerede zorlandığını birlikte değerlendiriyoruz. Ardından süreyi, tekniği veya haftalık ritmi derinleştiriyor ya da değiştiriyoruz.',
  },
] as const;

export const oneToOneIncluded = [
  'Haftada bir Google Meet görüşmesi',
  'Görüşme öncesi otomatik bağlantı gönderimi',
  'Sana göre oluşturulan günlük pratik takvimi',
  'WhatsApp veya Telegram hatırlatmaları',
  'Pratik sayacı ve pratik sonrası check-in',
  'İsteğe bağlı yazılı veya sesli refleksiyon',
  'Görüşmeler arasında günlük takip',
] as const;

export const aboutSections = [
  {
    title: 'Benim meditasyon yolculuğum bir kariyer planıyla başlamadı.',
    paragraphs: [
      '2015 yılında ODTÜ Endüstri Mühendisliği bölümünden mezun oldum. Mezuniyetin ardından yaklaşık yedi yıl boyunca kurumsal hayatta iş analisti olarak çalıştım. Günlerim toplantılar, kararlar, projeler ve sürekli çözülmesi gereken problemler arasında geçiyordu. Bir süre sonra şunu daha açık görmeye başladım: iş günü bitse bile zihin aynı kolaylıkla kapanmıyordu. Ve yoğun stres altında zihin kolay tüketilebilir alışkanlıklar geliştirmeye başlıyordu. Bu durumun farkına varmak, meditasyon ve içsel pratiklere yönelmemin ilk adımı oldu.',
      'Başlangıçta aradığım şey daha sakin bir zihindi. Fakat yıllar içinde bu arayış beni çok daha farklı bir yere götürdü.',
    ],
  },
  {
    title: 'Myanmar: Budizmle ilk karşılaşma',
    paragraphs: [
      'Budizmle ilk kez 2019 yılında Myanmar’da tanıştım. Orada meditasyonun yalnızca rahatlamak veya zihni susturmak için yapılan bir teknik olmadığını görmeye başladım. Pratiğin merkezinde, beden ve zihinde ortaya çıkan deneyimi olduğu haliyle gözlemlemek vardı.',
      'Bu karşılaşma benim için önemli bir dönüm noktası oldu. Meditasyona bakışım, “nasıl daha az düşünebilirim?” sorusundan yavaş yavaş “zihin nasıl çalışıyor?” sorusuna doğru değişmeye başladı.',
    ],
  },
  {
    title: 'Hindistan: Yoga eğitmenliği',
    paragraphs: [
      'Daha sonra Hindistan’a giderek yoga eğitimlerimi derinleştirdim. Kundalini ve Ashtanga yoga eğitmenlik eğitimlerimi Hindistan’da tamamladım; Hatha yoga ile de uzun süre çalıştım.',
      'Yoga pratiği bana yalnızca hareketi değil, bedenin dikkat ve zihinle ilişkisini de farklı bir yerden görme imkânı verdi. Zamanla yoga ve meditasyon benim için iki ayrı alan olmaktan çıktı.',
    ],
  },
  {
    title: 'Tayland, Sri Lanka ve inziva pratiği',
    paragraphs: [
      'Sonraki yıllarda pratiğimi inzivalar ve manastır ortamlarında derinleştirmeye devam ettim. Tayland’da Suan Mokkh gibi orman geleneği merkezlerinde Vipassanā pratiği yaptım ve manastır yaşamını deneyimledim. S.N. Goenka geleneğindeki Dhamma merkezlerinde de inzivalara katıldım.',
      'Sri Lanka’da ve Güneydoğu Asya’nın farklı bölgelerinde katıldığım inzivalar, pratiği gündelik hayatın dışındaki kısa bir deneyim olmaktan çıkarıp daha sürekli bir yaşam biçimi olarak görmemde etkili oldu.',
    ],
  },
] as const;

export const approachPrinciples = [
  {
    title: 'Gözlemle',
    text: 'Önce bedende ve zihinde gerçekten ne olduğunu fark et.',
  },
  {
    title: 'Anla',
    text: 'Ortaya çıkan deneyime hemen tepki vermeden veya anlam yüklemeden biraz daha yakından bak.',
  },
  {
    title: 'Uyumla',
    text: 'Pratiği teorik bir programa değil, gerçek deneyimine göre geliştir.',
  },
] as const;

export const testimonials = [
  {
    quote:
      '15 dakikayla başladığım pratikleri artık yarım saate çıkardım. Beden farkındalığımın ve odaklanmamın geliştiğini hissediyorum.',
    label: 'Birebir çalışma katılımcısı',
  },
  {
    quote:
      'Meditasyon artık yalnızca oturduğum süreyle sınırlı değil; günlük hayatta da tepkilerimi fark etmeye başladım.',
    label: 'Birebir çalışma katılımcısı',
  },
  {
    quote: 'Artık bu pratiği bırakmak istemiyorum. İmkânım olduğu sürece devam etmek istiyorum.',
    label: 'Birebir çalışma katılımcısı',
  },
] as const;

export const oneToOneFaq = [
  {
    question: 'Sisteme nasıl kaydoluyorum?',
    answer:
      'Tanışma görüşmesinden sonra tercih ettiğin WhatsApp veya Telegram kanalı üzerinden sisteme kaydolursun. Görüşme bağlantılarını, günlük hatırlatmaları ve check-in mesajlarını bu kanaldan alırsın.',
  },
  {
    question: 'WhatsApp ve Telegram arasında seçim yapabilir miyim?',
    answer:
      'Evet. Öğrenci sistemi her iki kanalı da destekler. Public sayfadaki ilk iletişim WhatsApp üzerinden başlar; kayıt sırasında günlük mesajlarını hangi kanaldan almak istediğini birlikte belirleriz.',
  },
  {
    question: 'Görüşmeler nerede gerçekleşiyor ve bağlantı nasıl geliyor?',
    answer:
      'Görüşmeler Google Meet üzerinden gerçekleşir. Birlikte belirlediğimiz haftalık görüşmeden önce Meet bağlantısı sistem tarafından mesaj olarak otomatik gönderilir.',
  },
  {
    question: 'Günlük ne kadar zaman ayırmam gerekiyor?',
    answer:
      'Başlangıç için günde 10 dakika bile yeterli olabilir. Süreyi, pratik türünü ve haftalık yoğunluğu mevcut deneyimine ve günlük hayatına göre birlikte belirleriz.',
  },
  {
    question: 'Pratik saatlerini sonradan değiştirebilir miyiz?',
    answer:
      'Evet. Takvim sabit bir programa bağlı değildir. Belirlediğimiz saat gerçek hayatına uymuyorsa sonraki planı daha uygun gün ve saatlere göre yeniden düzenleriz.',
  },
  {
    question: 'Bir gün pratik yapamazsam ne olur?',
    answer:
      '“Yapamadım” cevabı da sürecin anlamlı bir parçasıdır. Amaç kusursuz bir seri oluşturmak değil, pratiğin nerede zorlandığını görmek ve planı sürdürülebilir hâle getirmektir.',
  },
  {
    question: 'Refleksiyon bırakmak zorunlu mu?',
    answer:
      'Hayır. Bazı günler yalnızca “Yaptım” veya “Yapamadım” olarak check-in yapman yeterlidir. Paylaşmak istediğin bir deneyim ya da soru olduğunda refleksiyon bırakabilirsin.',
  },
  {
    question: 'Sesli refleksiyon gönderebilir miyim?',
    answer:
      'Evet. Meditasyonunun nasıl geçtiğini kısa bir metinle yazabilir veya sesli mesaj olarak paylaşabilirsin.',
  },
  {
    question: 'Görüşmeler arasında paylaştıklarımı takip ediyor musun?',
    answer:
      'Evet. Günlük pratik durumlarını ve bıraktığın refleksiyonları takip ediyorum. Tekrarlayan bir güçlük görürsem gerektiğinde bir sonraki görüşmeyi beklemeden kısa bir yönlendirme yapabiliyorum.',
  },
  {
    question: 'Pratik bana uygun gelmezse değiştirilebilir mi?',
    answer:
      'Evet. Bir sonraki görüşmede gerçek deneyimin üzerinden geçer; süreyi, tekniği veya haftalık ritmi derinleştirir, sadeleştirir ya da tamamen değiştiririz.',
  },
  {
    question: 'Daha önce hiç meditasyon yapmadıysam katılabilir miyim?',
    answer:
      'Evet. Görüşmede pratiğin nasıl yapılacağını adım adım açıklıyor ve birlikte uyguluyoruz. Süreç başlangıç seviyene göre oluşturulur.',
  },
] as const;

export const corporateProgramPhases = [
  {
    number: '01',
    label: 'Başlangıç görüşmesi',
    title: 'Deneyimi ve gündelik ritmi anlamak',
    text: 'Dikkat, otomatik pilot ve stres sinyalleri üzerine çalışır; kişiye özel meditasyon ve pratik planını birlikte oluştururuz.',
  },
  {
    number: '02',
    label: 'Sekiz hafta boyunca',
    title: 'Pratiği gündelik hayatın içinde takip etmek',
    text: 'Çalışan Sakin Zihin portalını, hatırlatmaları, sayacı ve check-in sistemini kullanır. Gerektiğinde kısa mesaj desteğiyle planı uygulanabilir tutarız.',
  },
  {
    number: '03',
    label: 'Üç takip görüşmesi',
    title: 'Gerçek deneyime göre pratiği uyarlamak',
    text: 'Düşünceler, duygular ve bedenle ilişkiyi ele alır; süreyi, tekniği ve haftalık ritmi çalışanın deneyimine göre derinleştirir veya sadeleştiririz.',
  },
  {
    number: '04',
    label: 'Program sonu',
    title: 'Bireysel değerlendirme ve sürdürülebilir plan',
    text: 'Sekiz haftayı birlikte değerlendirir, çalışanın tek başına sürdürebileceği bir pratik düzeni oluştururuz.',
  },
] as const;

export const corporateSystemSteps = [
  'Bireysel başlangıç görüşmesi',
  'Teorik açıklama ve birlikte yapılan pratik',
  'Kişiye göre gün, saat, süre ve teknik seçimi',
  'Sekiz hafta boyunca Sakin Zihin portalına erişim',
  'WhatsApp veya Telegram üzerinden günlük hatırlatma',
  'Sayaçla pratik ve “Yaptım / Yapamadım” check-in’i',
  'İsteğe bağlı yazılı veya sesli refleksiyon',
  'Üç bireysel takip görüşmesi',
  'Gerektiğinde kısa mesaj ve check-in desteği',
  'Program sonunda bireysel değerlendirme',
] as const;

export const corporateFaq = [
  {
    question: 'Program grup eğitimi mi?',
    answer:
      'Hayır. Kurum programı çalışanlarına sunar; eğitim ve takip her çalışanla birebir yürütülür.',
  },
  {
    question: 'Sekiz hafta nasıl ilerliyor?',
    answer:
      'Program bir başlangıç görüşmesiyle başlar. Ardından sekiz haftalık pratik takibi içinde üç takip görüşmesi yapılır; program bireysel değerlendirmeyle tamamlanır.',
  },
  {
    question: 'Daha önce meditasyon yapmış olmak gerekiyor mu?',
    answer:
      'Hayır. Teknikler başlangıçtan itibaren açıklanır ve görüşmede birlikte uygulanır. Plan, çalışanın deneyimine göre şekillenir.',
  },
  {
    question: 'Görüşmeler mesai saatleri dışında yapılabilir mi?',
    answer:
      'Evet. Kurumun çerçevesi ve çalışanın programı doğrultusunda uygun saatler birlikte belirlenebilir.',
  },
  {
    question: 'Şirket bireysel verileri görebilir mi?',
    answer:
      'Hayır. İsimler, görüşme içerikleri, check-in’ler, refleksiyonlar ve kişisel güçlükler kurumla paylaşılmaz. En az beş katılımcı olduğunda yalnızca anonim toplu özet hazırlanabilir.',
  },
  {
    question: 'Refleksiyon bırakmak zorunlu mu?',
    answer:
      'Hayır. Çalışan yalnızca “Yaptım” veya “Yapamadım” diyebilir; yazılı ya da sesli refleksiyon tamamen isteğe bağlıdır.',
  },
  {
    question: 'WhatsApp ve Telegram arasında seçim yapılabilir mi?',
    answer:
      'Evet. Günlük hatırlatma ve check-in mesajları için çalışan tercih ettiği kanalı kullanabilir.',
  },
  {
    question: 'Program terapi veya psikolojik danışmanlık mı?',
    answer:
      'Hayır. Bu çalışma mindfulness ve meditasyon eğitimidir; psikoterapi, klinik değerlendirme veya acil destek hizmeti değildir.',
  },
  {
    question: 'Sekiz haftadan sonra devam edilebilir mi?',
    answer:
      'Evet. Program sonu değerlendirmesinde ihtiyaç ve pratik düzeni ele alınarak yeni bir çalışma dönemi planlanabilir.',
  },
  {
    question: 'Aynı anda kaç çalışan katılabilir?',
    answer:
      'Birebir görüşme kapasitesi ve kurumun takvimi birlikte değerlendirilir. Formda düşündüğünüz katılımcı sayısını ve zamanlamayı paylaşabilirsiniz.',
  },
] as const;
