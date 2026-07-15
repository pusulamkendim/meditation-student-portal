# E2E Kesiflerinden Cikan Refaktor Maddeleri

Bu belge, mevcut davranisi anlamak icin eklenen bagimsiz E2E senaryolarinin ortaya
cikardigi urun ve altyapi aciklarini kaydeder. Testler hedef davranisi zorla
dogrulamak yerine sistemin bugunku sonucunu gozlemler. Kanitlar
`apps/api/src/e2e/registration.e2e.test.ts` icindeki `EXPL-*` senaryolaridir.

## RF-001 - Birlesik sorularda ikinci niyet kayboluyor

- Onem: Yuksek
- Kanit: `EXPL-01`, `EXPL-02`
- Gozlem: "Paketim ne zaman bitiyor ve gorusmem ne zaman?" sorusu yalnizca
  gorusme olarak siniflandiriliyor. Tek domain icindeki saat ve sure sorusunda da
  yanit bir sonraki pratik yerine gunluk toplam sureyi veriyor.
- Etki: Agent dogru fakat eksik yanit uretiyor; kullanici eksik bolumu tekrar
  sormak zorunda kaliyor ve niyet kaybi gorunur bir hataya donusmuyor.
- Refaktor: Siniflandirici sonucunu tek `domain/action` yerine sinirli bir niyet
  listesi veya alt-soru listesi uretecek bicimde genislet. Agent baglamini bu
  listeye gore birden fazla izinli bolumden topla. Yaniti gondermeden once her
  alt-sorunun karsilandigini denetle.
- Kabul olcutu: Iki farkli domain veya ayni domaindeki iki veri istegi tek
  mesajda soruldugunda yanit her iki bilgiyi de acikca icerir.

## RF-002 - Birlesik tamamlama ve refleksiyon mesaji veri kaybediyor

- Onem: Yuksek
- Kanit: `EXPL-04`
- Gozlem: "Yaptim, basta odaklanmakta zorlandim ama sonra sakinlestim."
  mesaji pratigi `COMPLETED` yapiyor fakat ayni mesajdaki refleksiyon
  `practice_reflections` tablosuna yazilmiyor.
- Etki: Ogrencinin en degerli nitel verisi sessizce kayboluyor; haftalik ozetler
  ve gorusme hazirligi eksik veriye dayaniyor.
- Refaktor: Niyet sonucuna ikincil eylem/varlik destegi ekle veya completion
  isleminden sonra ayni mesajdaki kalan metni refleksiyon olarak degerlendir.
  Oturum durumu ile refleksiyon kaydini tek transaction ve ayni idempotency
  anahtariyla isle.
- Kabul olcutu: Tek mesaj hem oturumu tamamlar hem de tam refleksiyon metnini
  ilgili oturuma bir kez kaydeder.

## RF-003 - Mevcut Meet baglantisi ogrenciye ulasamiyor

- Onem: Yuksek
- Kanit: `EXPL-03`
- Gozlem: Guncel gorusmede sifreli Meet URL bulunmasina ve agent `MEETINGS`
  baglamini okumasina ragmen projeksiyon yalnizca `meetAvailable` boolean degeri
  sagliyor. Agent gercek baglantiyi veremiyor.
- Etki: Ogrenci toplantidan hemen once linki sordugunda gereksiz handover veya
  eksik yanit alabilir.
- Refaktor: Yalnizca ogrencinin guncel/gelecek gorusmesine erisen, URL'yi cozen
  dar kapsamli bir `meeting_link` sorgusu ekle. Mumkunse cevabi deterministik
  sistem mesaji olarak uret; URL'yi genel amacli prompt baglamina yayma.
- Kabul olcutu: Linki olan gelecek gorusmede ogrenci kendi Meet URL'sini alir;
  baska ogrenciye veya gecmis gorusmeye ait URL sizmaz.

## RF-004 - Baglam sayfalama bir sonraki pratigi gizliyor

- Onem: Yuksek
- Kanit: `EXPL-10`
- Gozlem: Guncel paket icinde 50 gecmis oturum oldugunda ilk baglam sayfasi
  doluyor. Sayfa disinda kalan gercek bir `SCHEDULED` oturum bulunmasina ragmen
  "Bir sonraki pratigim ne zaman?" sorusu handover ile sonuclaniyor.
- Etki: Uzun sureli veya yogun kaydi olan ogrencilerde agentin guvenilirligi
  zamanla azalir. Ayni tasarim prompt boyutunu da gereksiz buyutur.
- Refaktor: `nextPractice` ve son tamamlanan pratik gibi operasyonel degerleri
  oturum gecmisi sayfasindan bagimsiz, hedefli sorgularla getir. Gecmis listeyi
  sayfali tut; toplamlar icin aggregate kullan.
- Kabul olcutu: Gecmis kayit sayisindan bagimsiz olarak en yakin gelecek pratik
  dogru bulunur ve prompta en fazla sabit sayida ozet kayit girer.

## RF-005 - Celiskili ifadeler durumu kesin olarak degistiriyor

- Onem: Orta
- Kanit: `EXPL-05`
- Gozlem: "Yaptim diyecektim ama aslinda yapamadim." mesaji dogrudan `SKIP`
  seciliyor ve oturum `SKIPPED` oluyor. Siniflandirici celiskiyi ayri bir sinyal
  olarak tasimiyor.
- Etki: Daha belirsiz celiskili cumlelerde yanlis durum mutasyonu yapilabilir;
  kullaniciya dogrulama sansi verilmez.
- Refaktor: Yapilandirilmis sonuca `ambiguous/conflictingEvidence` alani ekle.
  Karsit eylem sinyalleri birlikteyse guven esigi ne olursa olsun durumu
  degistirmeden netlestirme mesaji gonder.
- Kabul olcutu: Birbirine ters completion/skip sinyalleri iceren mesajlar oturum
  durumunu degistirmez ve tek bir aciklama sorusu uretir.

## RF-006 - Gecmis kacirilmis pratik sonradan uzlastirilamiyor

- Onem: Orta
- Kanit: `EXPL-06`
- Gozlem: Ogrenci "Dunku aksam pratigimi yaptim." dediginde ilgili oturum
  `MISSED` kalmaya devam ediyor ve mesaj pratik cevabi olarak islenmiyor.
- Etki: Gec yanit veren ogrencilerin gercek uyum verisi duzeltilemiyor; admin
  raporu yanlis kaliyor.
- Refaktor: Politika karariyla sinirli bir gec bildirim penceresi tanimla veya
  otomatik mutasyon yerine ilgili oturumla baglantili duzeltme handover'i ac.
  Mesaji ilgisiz genel sorguya dusurme.
- Kabul olcutu: Gec bildirim ilgili oturumla korele edilir ve secilen politikaya
  gore ya guvenli bicimde duzeltilir ya da tek bir admin aksiyonu olusturur.

## RF-007 - Ogrenci kendi kayitli adini sorgulayamiyor

- Onem: Orta
- Kanit: `EXPL-07`
- Gozlem: "Sistemde kayitli ismim ne?" sorusu `ADMIN_HANDOFF` uretiyor; account
  baglaminda ogrencinin cozulmus gorunen adi bulunmuyor.
- Etki: Basit hesap sorulari admin kuyrugunu dolduruyor ve ogrencide sistemin
  kendi verisini bilmedigi algisini olusturuyor.
- Refaktor: Kimligi dogrulanmis kanal icin dar kapsamli hesap projeksiyonuna
  gorunen adi ekle veya deterministik `ACCOUNT_QUERY` cevabi uret.
- Kabul olcutu: Ogrenci yalnizca kendi kayitli gorunen adini handover olmadan
  alabilir.

## RF-008 - Handover takip mesaji yinelenen acik kayit uretiyor

- Onem: Orta
- Kanit: `EXPL-08`
- Gozlem: Ilk handover'dan sonra gelen "Ne zaman donus yapacaksin?" mesaji ayni
  acik kayda eklenmek yerine ikinci bir `OPEN` handover olusturuyor.
- Etki: Admin operasyon kuyrugu sisiyor, ayni konusma iki kez ele alinabilir ve
  ogrenciye tutarsiz cevap verilebilir.
- Refaktor: Ogrenci ve aktif konusma icin acik handover'i belirli korelasyon
  penceresinde yeniden kullan. Takip mesajlarini ayni kaydin timeline'ina ekle;
  uygun bir kismi unique constraint veya transaction kilidiyle koru.
- Kabul olcutu: Ayni acik konuya gelen takip mesajlari yeni handover olusturmaz,
  mevcut kaydin son aktivite zamanini ve mesaj listesini gunceller.

## RF-009 - Handover admin bildirim akimina ulasmiyor

- Onem: Kritik
- Durum: Kapatildi
- Kanit: `HANDOFF-01`
- Onceki gozlem: Ogrenci mesaji basariyla bir `OPEN` handover olusturuyor; ancak ayni
  handover icin `admin.notifications` outbox olayi uretilmiyor. Admin panelindeki
  Operasyon > Admin bildirimleri endpoint'i de herhangi bir handover teslimati
  dondurmuyor.
- Etki: Agent ogrenciye "Bunu Necip'e iletecegim" demesine ragmen admin proaktif
  bildirim almiyor. Handover yalnizca Bilgi Bankasi ekranina manuel girilip liste
  yenilenirse fark edilebilir ve ogrenci cevapsiz kalabilir.
- Refaktor: Handover ve `ADMIN_HANDOFF_REQUIRED` outbox olayini ayni transaction
  icinde olustur. Admin notification consumer bu olayi idempotent bir teslimata
  donustursun; admin panelindeki bildirim akisi handover kimligi, ogrenci ve neden
  bilgisini gostersin. Bildirim teslimati basarisiz olsa bile handover kaydi
  korunmali ve retry edilebilmeli.
- Kabul olcutu: Yeni handover tek bir admin notification olusturur, Operasyon
  endpoint'inde gorunur, provider retry yinelenen teslimat uretmez ve handover
  cozuldugunde bildirim durumu panelde guncellenir.
- Uygulama: `ADMIN_HANDOFF_REQUIRED` olayi worker tarafinda idempotent
  `ADMIN_PANEL` teslimatina donusturuluyor. Operasyon ve ogrenci konusma API'leri
  handover'lari listeliyor; admin opsiyonel mesajla ayni transaction icinde
  handover'i kapatip ogrenci mesajini kuyruga alabiliyor.

## Kontrol Sonucu

- `EXPL-09`: Guvenlik mesaji pratik tamamlama ifadesiyle birlikte geldiginde
  `SAFETY/HANDOFF` onceligi korunuyor ve oturum yanlislikla tamamlanmiyor. Bu
  davranis mevcut haliyle korunmali.

## RF-010 - Odeme ek bilgi talebi ogrenciye iletilmiyor

- Onem: Yuksek
- Kanit: `ADMIN-01`
- Gozlem: Admin odemeyi `ACTION_REQUIRED` durumuna alip inceleme notu yazdiginda
  odeme kaydi guncelleniyor; ancak `PAYMENT_ACTION_REQUIRED` sistem olayi veya
  ogrenciye gidecek bir message intent olusmuyor. Admin daha sonra onay verirse
  aktivasyon ve `PAYMENT_APPROVED` mesaji normal calisiyor.
- Etki: Admin panelinde ogrenciden bilgi istendigi gorunurken ogrenci bu talepten
  haberdar olmuyor ve odeme sureci sessizce bekliyor.
- Refaktor: Durum degisikligi, `PAYMENT_ACTION_REQUIRED` occurrence ve standart
  mesaj intent'ini ayni transaction icinde olustur. Inceleme notunu `actionText`
  degiskenine aktar ve provider retry icin odeme surumune bagli idempotency
  anahtari kullan.
- Kabul olcutu: Admin ek bilgi talep ettiginde ogrenci varsayilan kanalindan tek
  mesaj alir; tekrar deneme yinelenen mesaj uretmez ve talep konusma gecmisinde
  gorunur.

## RF-011 - Admin yaniti aktif olmayan ogrenciye gonderilemiyor

- Onem: Yuksek
- Kanit: `ADMIN-02`
- Gozlem: `PAYMENT_PENDING` durumundaki ogrenci icin admin konusma ekranindan
  yanit intent'i olusturuluyor ve endpoint basarili donuyor. Dispatcher genel
  aktif ogrenci politikasini uygulayarak intent'i `STUDENT_INACTIVE` gerekcesiyle
  `SUPPRESSED` yapiyor. Mesaj kanala gitmiyor ve konusma timeline'inda gonderilmis
  mesaj olarak gorunmuyor.
- Etki: Admin odeme veya kayit sorunu yasayan ogrenciye en cok ihtiyac duyulan
  anda yanit veremiyor; arayuz ise islemi basarili gibi bildiriyor.
- Refaktor: `ADMIN_REPLY` icin kayit sureci devam eden ve mesajlasma izni bulunan
  ogrencileri kapsayan acik bir gonderim politikasi tanimla. API kuyruga alma
  sonucunu teslimat olarak sunmamali; bastirma nedeni admin panelinde gorunmeli.
- Kabul olcutu: Mesajlasma izni bulunan `LEAD`, `PAYMENT_PENDING` ve `ACTIVE`
  ogrencilere admin yaniti gonderilebilir; izin/kanal engeli varsa admin bunu
  acik bir hata durumu olarak gorur.

## Test Altyapisi Notu

Kesif kosusu sirasinda yayinlanmis varsayilan mesajlarin `effectiveAt` degeri
gercek saatle, servislerin saati ise fake clock ile uretiliyordu. Birkac dakikalik
fark `PRACTICE_PLAN_CONFIRMED` intent'inin sessizce olusmamasina neden olabiliyordu.
E2E kurulumu yayinlanmis surumleri sabit bir gecmis tarihte etkinlestirerek
deterministik hale getirildi.

Handover mesajla kapatma testi ayrica admin conversation controller'inin intent
zamanlarini `new Date()` ile urettigini ortaya cikardi. Bu durumda fake clock ile
intent gerceklesmeden suresi dolmus gorunebiliyordu. Controller ortak `Clock`
soyutlamasina baglandi; normal admin yaniti ve handover yaniti ayni zaman
kaynagini kullaniyor.
