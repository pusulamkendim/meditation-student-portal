# Urun Backlog'u

Bu belge, milestone disinda planlanan urun maddelerini ve uygulama durumlarini
kaydeder.

## PB-001 - Sabah ve aksam surelerini ayri belirleme

- Durum: Lokal ortamda tamamlandi - 4 Agustos 2026
- Admin, ogrencinin sabah ve aksam pratikleri icin birbirinden bagimsiz sure
  belirleyebilmeli.
- Tek pratikli planda yalnizca aktif slotun suresi kullanilmali.
- Varsayilan haftalik sure artisi kaldirilmali. Paket haftasi veya mufredat
  seviyesi degistiginde pratik suresi otomatik olarak degismemeli.
- Sabah ve aksam sureleri admin tarafindan acikca degistirilene kadar sabit
  kalmali.
- Plan degisikligi gecmis veya sonuclanmis pratikleri degistirmemeli. Yalnizca
  yururluk zamanindan sonraki baslamamis pratikler yeni surelerle uretilmeli.
- Plan ozeti, hatirlatma, check-in ve admin ekranlari her pratik icin gercek slot
  suresini gostermeli.

Kabul olcutu: Sabah 15, aksam 25 dakika olarak kaydedilen bir planda paket haftasi
degisse bile sureler otomatik artmaz; seanslar, mesajlar ve raporlar kendi
slotlarinin kayitli suresini tutarli bicimde kullanir.

## PB-002 - Haftanin aktif pratik gunlerini belirleme

- Durum: Lokal ortamda tamamlandi - 4 Agustos 2026
- Admin, bir pratik planinin uygulanacagi haftanin gunlerini secebilmeli.
- Gun secimi ogrencinin `Europe/Istanbul` dahil kayitli IANA saat dilimine gore
  degerlendirilmeli.
- Secilmeyen gunler icin seans, reminder veya check-in olusturulmamali; bu gunler
  kacirilmis pratik ve devam orani hesabina girmemeli.
- Plan degisikligi gecmis kayitlari korumali ve yalnizca yururluk zamanindan
  sonraki baslamamis seanslari yeni gun secimine gore uzlastirmali.
- Admin plani formunda haftanin yedi gunu checkbox/toggle grubu olarak
  gosterilmeli ve en az bir aktif gun zorunlu olmali.
- Ogrenciye giden plan ozetinde aktif gunler, slotlar, saatler ve slot bazli
  sureler birlikte belirtilmeli.

Kabul olcutu: Pazartesi, Carsamba ve Cuma secilen bir planda yalnizca bu yerel
gunlerde pratik uretilir; diger gunlerde mesaj veya kacirilmis pratik kaydi
olusmaz.

## Uygulama Sirasi

PB-001 ve PB-002 tek bir pratik-plani teslimati olarak uygulanacak. Iki maddeyi
ayri release'lerde yapmak ayni schedule, API, admin formu ve test yuzeylerini iki
kez degistirir; gecici olarak birbiriyle uyumsuz plan surumleri olusturur.

Oncelik sirasi:

1. Veri modeli ve geriye uyumlu API kontrati
2. Deterministik schedule ureticisi
3. Atomik plan revizyonu ve gelecek seans uzlastirmasi
4. Admin plan editorleri ve plan ozeti mesajlari
5. Canli veri gecisi, gozlem ve eski kontratin kaldirilmasi

## Teknik Kararlar

### Plan ve slot modeli

- Sabah ve aksam suresi `PracticeSlot.durationMinutes` alaninda tutulacak. Yeni
  bir sure tablosu veya plan seviyesinde ortak sure alani eklenmeyecek.
- `PracticePlan` modeline ISO hafta gunlerini (`1=Pazartesi`, `7=Pazar`) tutan
  `activeWeekdays Int[]` alani eklenecek.
- Migration mevcut planlari `[1, 2, 3, 4, 5, 6, 7]` ile dolduracak; boylece
  deploy aninda mevcut gun davranisi degismeyecek.
- API en az bir aktif slot, her aktif slot icin 1-180 dakika sure ve en az bir
  benzersiz hafta gunu zorunlu kilacak.
- Yeni plan icin baslangic varsayilani sabah ve aksam 15 dakika, haftanin yedi
  gunu olacak. Kayitli plan duzenlenirken varsayilan yerine mevcut slot sureleri
  ve gunleri yuklenecek.

### Schedule uretimi

- `generatePracticeSchedule` her slotun kendi `durationMinutes` degerini ve
  planin `activeWeekdays` listesini girdi olarak alacak.
- `durationForPackageDay`, `isFirstPackage` ve `durationOverride` uzerinden
  15/20/25/30 dakika hesaplayan davranis kaldirilacak.
- Gun filtresi `serviceDate` takvim gununun ISO weekday degeriyle uygulanacak;
  saat ise ogrencinin kayitli IANA saat diliminden hesaplanmaya devam edecek.
- DST gap/fold davranisi mevcut kuralla korunacak. Secilmeyen yerel gunlerde
  session, reminder ve check-in kaydi uretilmeyecek.

### Plan revizyonu ve gecmisin korunmasi

- Plan kaydi yine ogrenci bazli PostgreSQL advisory lock icinde ve tek
  transaction'da yapilacak.
- Degisiklik, `effectiveFrom` oncesindeki veya baslamis/sonuclanmis session'lara
  dokunmayacak.
- Yalnizca yeni yururluk zamanindan sonraki `SCHEDULED`/`REMINDED` session'lar
  eski planla birlikte `SUPPRESSED / PLAN_SUPERSEDED` olacak; yeni plan
  kurallariyla yeniden uretilecek.
- Eski session'lara bagli bekleyen message intent'ler bastirilacak. Yeni
  session'lar kendi plan/slot snapshot surelerini tasiyacak.
- Tekil saat degistirme, iptal/geri alma, pause/resume ve reflection kayitlari
  plan revizyonundan bagimsiz mevcut davranislarini koruyacak.

### Mesaj ve sorgu kontrati

- Plan onay/guncelleme ozeti gunleri, slot saatlerini ve slot bazli sureleri tek
  bir `scheduleSummary` degiskeninde gosterecek. Ornek: `Pazartesi, Carsamba ve
  Cuma; sabah 08:00 (15 dk), aksam 21:00 (25 dk)`.
- `PRACTICE_PLAN_CONFIRMED`, `PRACTICE_PLAN_UPDATED` ve gerekirse
  `PRACTICE_PLAN_CONFIRMATION_REQUEST` variable semalari yeni ozete gore
  surumlenecek.
- WhatsApp provider template'i yeni placeholder kontratiyla ayri bir template
  surumu olarak onaya gonderilecek; onaylanmadan eski binding degistirilmeyecek.
- `currentProgram`, ogrenci baglami, admin detay API'si ve raporlar aktif gunler
  ile her slotun gercek suresini donecek.

## Teslimat Dilimleri

### T1 - Schema ve kontrat

- Prisma migration: `PracticePlan.activeWeekdays` ve yedi gun default'u
- Core/API tipleri: slot bazli `durationMinutes`, plan bazli `activeWeekdays`
- Geriye uyumlu gecis: bir release boyunca eski `durationOverride` payload'i
  kabul edilip iki slota uygulanacak; yeni UI yalnizca yeni kontrati kullanacak
- OpenAPI/Zod validation ve audit `safeDiff` alanlarinin guncellenmesi

### T2 - Core schedule ve servis

- Haftalik artis fonksiyonunun kaldirilmasi
- Aktif gun ve slot suresiyle deterministik session uretimi
- Guided meditation render kontrolunun her slotun gercek suresiyle yapilmasi
- Plan revizyonu sonrasi yalnizca gelecegin uzlastirilmasi

### T3 - Admin deneyimi

- Ogrenci detayindaki ve ana Pratikler sayfasindaki iki plan formunun ayni ortak
  form bilesenine alinmasi
- Sabah/aksam icin ayri sure input'u; pasif slotta sure/meditasyon kontrolunun
  disabled olmasi
- Pazartesi-Pazar toggle grubu, tumunu sec/hafta ici kisa aksiyonlari ve en az
  bir gun validation'i
- Kaydetmeden once okunabilir plan ozeti ve API hatalarinda mevcut form
  degerlerinin korunmasi

### T4 - Mesajlar ve gorunumler

- Standart plan mesaji variable semalari ve DB mesaj surumleri
- WhatsApp template v2 ve provider binding gecisi
- Ogrenci detay, genel Pratikler, `PROGRAMIM`/current program ve LLM ogrenci
  baglaminda aktif gun + slot bazli sure gosterimi

### T5 - Canli veri gecisi ve rollout

- Dry-run raporu: aktif plan, gelecek session, mevcut slot suresi ve ilk gelecek
  session suresi farklari
- Mevcut aktif planlar icin kesim anindaki ilk gelecek session suresini slotun
  sabit suresi kabul eden kontrollu backfill
- Kesim anindan sonraki baslamamis session'larin bu sabit sure ve yedi gun
  kuraliyla yeniden uzlastirilmasi; gecmis/terminal kayitlara dokunulmamasi
- Guided meditation kullanan planlarda hedef sure render'i hazir degilse ilgili
  ogrencinin migration'inin fail-closed durmasi ve admin aksiyon listesine dusmesi
- Feature flag ile once lokal/staging, sonra secili ogrenciler, son olarak tum
  aktif planlar icin acilis
- Eski `durationOverride` kontratinin bir sonraki release'de kaldirilmasi

## Test Plani

### Unit

- Sabah 15/aksam 25 dakika ayni gun icin iki farkli session suresi uretir.
- Paket 1., 8., 15. ve 22. gunlerinde sure degismez.
- Pazartesi/Carsamba/Cuma yalnizca bu ISO gunlerinde session uretir.
- Europe/Istanbul ve DST kullanan bir IANA bolgesinde yerel gun/saat dogrudur.
- Bos/tekrarli/gecersiz weekday ve aktif slotsuz plan reddedilir.

### API ve veritabani entegrasyonu

- Yeni plan revizyonu gecmis, completed, skipped, missed, cancelled,
  awaiting-response ve reflection kayitlarini degistirmez.
- Gelecek eski session ve intent'ler bastirilir; yeni session'lar tekil ve dogru
  sure/gunle olusur.
- Eszamanli iki plan guncellemesinden yalnizca tutarli bir revizyon zinciri cikar.
- Pause/resume ve tekil cancel/restore yeni gun/sure modelinde kayip veya cift
  session uretmez.
- Guided meditation atamasi her iki slot icin ilgili sure render'ini dogrular.

### E2E ve UI

- Admin sabah 15, aksam 25 ve Pazartesi/Carsamba/Cuma kaydeder; iki admin
  ekraninda ayni degerleri gorur.
- Plan ozeti ve ogrenci mesaji gunleri, saatleri ve farkli sureleri dogru gosterir.
- Secilmeyen gunlerde lifecycle calistirilsa bile reminder/check-in/missed kaydi
  olusmaz.
- Plan sonraki hafta veya paket donemine gectiginde sure otomatik artmaz.
- Mobil ve desktop formlarda en uzun gun/ozet metni tasma veya overlap yapmaz.

## Tamamlanma Olcutu

- PB-001 ve PB-002 kabul olcutleri lokal PostgreSQL E2E testinde birlikte gecer.
- Mevcut canli planlar icin dry-run ile gercek migration sonucu birebir uyusur.
- Gecmis ve terminal pratik sayilarinda degisim olmaz.
- Secilmeyen gunlerde yeni session veya lifecycle mesaji uretilmez.
- Reminder, check-in, plan ozeti, admin ekranlari ve raporlar ayni slot suresini
  gosterir.
- Yeni WhatsApp plan template'i onayli binding ile smoke testten gecer.

## Uygulama Sonucu

- `PracticePlan.activeWeekdays` migration'i ve mevcut planlari yedi gunle
  dolduran geriye uyumlu veri gecisi eklendi.
- Paket haftasina bagli otomatik sure artisi kaldirildi; schedule her slotun
  kayitli sabit suresini kullaniyor.
- Ogrenci detayi ve ana Pratikler ekraninda sabah/aksam sureleri ile aktif gunler
  yonetilebiliyor. Mevcut meditasyon atamalari plan guncellemesinde korunuyor.
- Ogrenci detayinda aktif veya planli uyeligin bitis tarihi degistirilebiliyor.
  Kisalma yalnizca gelecek baslamamis pratikleri bastiriyor; uzatma mevcut planla
  eksik gunleri uretiyor. Gecmis/terminal pratikler korunuyor ve yeni tarihten
  sonraki gorusmeler varsa islem fail-closed duruyor.
- Core/unit testleri, 62 senaryolu PostgreSQL E2E paketi ve desktop/mobile
  Playwright testi gecti. Canli migration/deploy ve WhatsApp provider smoke testi
  bu lokal teslimatin disindadir.
