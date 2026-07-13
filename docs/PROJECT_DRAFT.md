# Meditasyon Öğrenci Portalı - Proje Taslağı

| Alan | Değer |
| --- | --- |
| Belge durumu | Taslak |
| Sürüm | 0.70 |
| Oluşturulma tarihi | 10 Temmuz 2026 |
| Son güncelleme | 12 Temmuz 2026 |
| Ürün aşaması | M8 bilgi bankası, RAG ve bağlamsal agent uygulaması |

## 1. Amaç

Birebir meditasyon öğrencilerinin WhatsApp veya Telegram üzerinden kaydolabildiği, ödeme
onayından sonra kişisel günlük pratik programına alındığı ve pratik
deneyimlerinin dersler arasında takip edilebildiği bir sistem kurmak.

Sistem, eğitmenin operasyonel işlerini azaltırken öğrencinin kişisel ve düzenli
bir destek aldığını hissettirmelidir. İnsan müdahalesi gerektiren kararlar
otomatikleştirilmemeli; yapay zeka yalnızca kontrollü yardımcı görevlerde
kullanılmalıdır.

## 2. Ürün İlkeleri

1. Kayıt, ödeme, aktivasyon ve zamanlama kuralları deterministik olmalıdır.
2. Yapay zeka ödeme onaylayamaz veya öğrenciyi kendiliğinden aktifleştiremez.
3. Öğrencinin orijinal ifadeleri korunur; yapay zeka çıktısı yardımcı veri olarak tutulur.
4. Mesajların tonu yargılayıcı değil, kısa ve destekleyici olmalıdır.
5. Hassas veriler mümkün olan en az kapsamda toplanmalıdır.
6. Admin, otomatik süreçleri durdurabilmeli ve gerektiğinde elle düzeltebilmelidir.
7. Sistem başarısız mesajları, tekrarlanan webhook'ları ve zamanlama hatalarını güvenli biçimde yönetmelidir.
8. Her proaktif mesaj, gönderim anında üyelik, izin, mesaj tercihi ve güvenlik durumunu yeniden doğrulamalıdır.

## 3. MVP Kapsamı

### Kapsama Dahil

- WhatsApp veya Telegram'dan `KAYIT` komutuyla kayıt başlatma
- Aydınlatma ve gerekli izinlerin alınması
- Ad ve soyad toplama
- IBAN ve öğrenciye özel ödeme referans kodu gönderme
- Öğrenciden ödeme bildirimi ve isteğe bağlı dekont alma
- Admin tarafından manuel ödeme onayı
- Öğrenciyi aktif duruma geçirme
- Aylık paket başlangıç ve bitiş tarihini takip etme
- Sabah ve akşam pratik saatlerini belirleme
- Pratikten 10 dakika önce hatırlatma
- Planlanan pratik bitiminden 10 dakika sonra değerlendirme isteme
- Pratik yapıldı/yapılmadı/geri dönüş alınmadı bilgisini tutma
- Serbest metin deneyim kaydı
- Haftalık görüşme tarihini tutma
- Görüşme öncesinde Google Meet bağlantısını öğrenciye gönderme
- Görüşmeden önce haftalık özet üretme
- Admin portalından tüm bu verilere erişme
- Admin portalından çoklu dosyalı, aşama bazlı bilgi bankası yönetme
- Bilgi bankasında desteklenen sorulara kaynak kontrollü agent yanıtı; diğerlerinde handoff
- Kayıt kanalını öğrencinin varsayılan mesajlaşma kanalı yapma

### İlk Sürümün Dışında

- Bankadan otomatik ödeme doğrulama
- Kredi kartı veya abonelik tahsilatı
- Öğrenciye tıbbi ya da psikolojik değerlendirme sunma
- Tam otonom yapay zeka koçluğu
- Mobil öğrenci uygulaması
- Grup dersleri
- Çoklu eğitmen ve kurum desteği

### Aylık Paket

| Alan | Karar |
| --- | --- |
| Model | Aylık paket |
| Ücret | 4.000 TL |
| Birebir görüşme | Ayda 4 kez, haftalık düzende online |
| Görüşme kanalı | Google Meet |
| Görüşme zamanını belirleyen | Admin |
| Dersler arası destek | Günlük pratik takibi ve hatırlatmalar |
| Yenileme | Admin yeni bir aylık paket dönemi tanımlar |

İlk paket ödeme onayı sırasında adminin seçtiği başlangıç tarihiyle oluşturulur.
Paket takvim ayına bağlı değildir; seçilen başlangıç tarihinden itibaren bir
takvim ayı sürer. Başlangıç günü dahil, bir sonraki ayın aynı günü hariç tutulur.
Örneğin 10 Temmuz'da başlayan paket 9 Ağustos gün sonuna kadar geçerlidir.
Hedef ayda aynı gün bulunmuyorsa hariç bitiş tarihi hedef ayın son gününe
sınırlanır; örneğin 31 Ocak'ta başlayan paketin `end_exclusive` tarihi 28/29
Şubat olur. Tarihler öğrencinin saat dilimindeki yerel takvim tarihi olarak
hesaplanır ve dört görüşmenin tamamı bu yarı açık tarih aralığında planlanır.
Bir paket döneminde en fazla dört birebir görüşme hakkı bulunur; takvimde
beşinci haftaya denk gelen
görüşme otomatik olarak pakete eklenmez.

Üyelik yenilemesi mevcut paketin bitiş tarihini değiştirerek yapılmaz. Admin
öğrenci için yeni bir aylık paket dönemi tanımlar. Yeni dönem kendi başlangıç ve
bitiş tarihine, dört yeni görüşme hakkına ve varsa kendi ödeme kaydına sahip
olur. Böylece önceki paketlerin kullanım ve ödeme geçmişi korunur.

Yeni paket oluşturulurken öğrencinin aktif bir paketi varsa yeni dönem mevcut
paketin bitişinden sonraki gün başlayacak şekilde sıraya alınır. Aktif paket
yoksa başlangıç tarihini admin belirler. Aynı öğrenciye ait paket dönemleri
çakışamaz. Gelecekte başlayacak paket `SCHEDULED`, başlamış paket `ACTIVE`, sona
ermiş paket `EXPIRED` durumunda tutulur.

Aktif paket sona erdiğinde sırada başlayacak yeni paket yoksa öğrencinin üyeliği
`INACTIVE` durumuna alınır. Öğrenci profili, paket geçmişi ve izin verilen geçmiş
veriler korunur; pratik hatırlatmaları, değerlendirme istekleri ve görüşme
mesajları durdurulur. Daha sonra yeni bir paket başladığında üyelik tekrar aktif
hale getirilir ve yeni dönem için zamanlanmış işler oluşturulur.

Paket bitişinden üç gün önce öğrenciye varsayılan kanalından yenileme hatırlatması,
4.000 TL ücret, IBAN ve yenilemeye özel ödeme referansı gönderilir. Aynı anda
admin panelinde yenileme bildirimi oluşturulur. Hatırlatma kendi başına yeni
paket yaratmaz. Öğrencinin ödeme bildirimi admin tarafından onaylandığında yeni
paket dönemi sıraya alınır.

## 4. Öğrenci Kayıt Akışı

1. Öğrenci WhatsApp işletme numarasına veya Telegram botuna `KAYIT` yazar.
2. Sistem veri işlemeye başlamadan önce öğrenciye sürümlü KVKK aydınlatma metnini iletir.
3. Aydınlatmanın iletim zamanı kaydedilir.
4. Planlı hizmet mesajları için kayıt kanalına özel iletişim tercihi/opt-in ayrı olarak istenir.
5. Serbest pratik/duygu notlarının kaydı için ayrı açık rıza istenir.
6. Bu notların AI ile analizi için ikinci ve ayrı açık rıza istenir.
7. AI destekli serbest agent yanıtları için üçüncü ve ayrı tercih/rıza istenir.
8. Opt-in ve rıza yanıtları kapsam, kanal, kaynak, metin sürümü, zaman ve harici mesaj kimliğiyle kaydedilir.
9. Ad ve soyad istenir.
10. Sistem bir ödeme kaydı ve benzersiz referans kodu oluşturur.
11. IBAN, alıcı bilgisi, ücret ve referans kodu öğrenciye gönderilir.
12. Öğrenci `ÖDEME YAPTIM` yazar; isterse dekont iletir.
13. Ödeme admin panelinde inceleme kuyruğuna alınır.
14. Admin banka hesabından ödemeyi kontrol ederek onaylar veya reddeder.
15. Onaylanan öğrenci için aylık paket dönemi oluşturulur ve öğrenci aktif duruma geçirilir.
16. Günlük pratik programı kurulum akışı başlar.

Rıza vermeyen öğrenci kayıt ve ödeme akışına devam edebilir. Serbest not kaydı
için rıza yoksa yalnızca `Yaptım/Yapamadım` gibi temel pratik durumu tutulur. AI
rızası yoksa öğrenci notları AI servisine gönderilmez ve otomatik etiket/özet
üretilmez.

AI destekli agent yanıtı rızası yoksa kayıt, ödeme, pratik ve destek komutları
deterministik olarak çalışır; serbest sorular güvenli sabit yanıtla insan
desteğine yönlendirilir. Kanal opt-in'i verilmemesi proaktif hatırlatmaları
engeller. WhatsApp'ta öğrencinin başlattığı 24 saatlik pencere içindeki
reaktif kayıt ve destek mesajları ayrı politika kontrolüyle devam edebilir.

Öğrencinin ödeme yaptığını söylemesi tek başına aktivasyon oluşturmaz. Aktivasyon
yalnızca doğrulanmış admin işlemiyle yapılır.

Dekont zorunlu değildir. `ÖDEME YAPTIM` mesajı ödeme durumunu `REVIEW` yapar ve
admin inceleme kaydı oluşturur. Ödeme ancak admin banka hesabında doğruladıktan
sonra `APPROVED` olur. Agent veya yapay zeka ödeme onayı veremez.

Admin ödemeyi doğrulayamazsa `Ödeme bulunamadı`, `Tutar eksik/hatalı`, `Referans
eşleşmedi` veya `Diğer` nedenlerinden birini seçerek kaydı `ACTION_REQUIRED`
durumuna alır. Öğrenciye nedene uygun güvenli mesaj gönderilir; paket
aktifleştirilmez. Öğrenci yeni bilgi veya dekont gönderdiğinde ödeme tekrar
`REVIEW` durumuna döner.

Öğrenci dekont göndermişse dosya, ödeme onayından 30 gün sonra otomatik olarak
silinir. Ödeme tutarı, referans kodu, bildirim ve onay zamanı ile işlemi yapan
admin kaydı saklama politikasına göre korunur. Dosya silme görevi ve sonucu
audit log'a yazılır.

İade, eksik veya fazla ödeme için sistem banka işlemi başlatmaz. Admin gerekli
para hareketini banka üzerinden manuel tamamladıktan sonra portalda işlem türü,
tutar, açıklama ve tarihi kaydeder. Orijinal ödeme kaydı değiştirilmez; finansal
geçmiş ayrı bir düzeltme kaydıyla korunur. Tam iade edilen ödeme `REFUNDED`
durumuna alınır.

Finansal iade paket durumunu kendiliğinden değiştirmez. Aktif veya planlanmış
paketin sona erdirilmesi ayrı, gerekçeli bir admin işlemidir; arayüz tam iade
sırasında bu kararı adminin açıkça vermesini ister.

## 5. Öğrenci Durumları

Tek bir durum alanı onboarding, paket, mesaj tercihi ve güvenlik durumunu
birbirine karıştırmaz. Ayrı eksenler kullanılır:

```text
Onboarding: NEW -> NOTICE_SENT -> CONSENT_PENDING -> NAME_PENDING
            -> PAYMENT_PENDING -> PAYMENT_REVIEW -> COMPLETE
Membership: NO_PACKAGE | SCHEDULED | ACTIVE | INACTIVE | CANCELLED
Messaging:  ACTIVE | PRACTICE_PAUSED | ALL_PAUSED
Safety:     CLEAR | HOLD
```

`Membership` aktif paketlerden türetilir; profilin onboarding durumunu geriye
taşımaz. Durum geçişleri backend tarafından doğrulanır. Gelen serbest metin
doğrudan durum değiştiremez; önce tanımlı bir komut veya doğrulanmış
kullanıcı işlemi haline getirilir.

## 6. Günlük Pratik Programı

Varsayılan günlük program sabah ve akşam olmak üzere iki pratikten oluşur. Öğlen
pratiği bulunmaz. Süre paket haftasına göre kademeli olarak artar:

| Paket dönemi | Sabah | Akşam |
| --- | ---: | ---: |
| 1. hafta, gün 1-7 | 15 dakika | 15 dakika |
| 2. hafta, gün 8-14 | 20 dakika | 20 dakika |
| 3. hafta, gün 15-21 | 25 dakika | 25 dakika |
| 4. hafta, gün 22-paket sonu | 30 dakika | 30 dakika |

Öğrenci sabah ve akşam için birer başlangıç saati seçer. Sistem saatleri
öğrenciye tekrar göstererek açık onay alır. Paket günü başlangıç tarihine göre
hesaplanır; 28 günden uzun aylık dönemlerin kalan günlerinde 30 dakikalık süre
devam eder.

İlk program kurulurken öğrenci başlangıç saatlerini varsayılan kanalından seçer ve
sistem doğrulama mesajından sonra ilk planı kaydeder. Daha sonraki değişiklikte
öğrenci `PROGRAM DEĞİŞTİR` yazarak admin talebi oluşturabilir ancak agent planı
doğrudan değiştiremez. Yeni plan yalnızca admin portalındaki işlemle oluşturulur.

Örnek sabah akışı:

| Olay | Saat |
| --- | --- |
| Hatırlatma | 07:50 |
| Planlanan başlangıç | 08:00 |
| Planlanan bitiş | 08:15 |
| Değerlendirme isteği | 08:25 |

Değerlendirme başlangıçtan değil, planlanan bitişten 10 dakika sonra istenir.
Planlanan bitiş, ilgili paket haftasının 15/20/25/30 dakikalık süresine göre
dinamik hesaplanır.

Kademeli 15/20/25/30 dakika planı yalnızca öğrencinin ilk paketinde uygulanır.
İkinci ve sonraki paketler, üyelik dönemleri arasında boşluk olsa bile sabah ve
akşam 30 dakika ile başlar ve devam eder. Admin öğrenci ihtiyacına göre başlangıç
tarihi belirlenmiş özel bir süre planı tanımlayabilir. Özel plan değişiklikleri
sürümlenir ve audit log'a yazılır.

Varsayılan program hafta sonu dahil her gün sabah ve akşam uygulanır. Admin her
zaman öğrenciye özel yeni bir plan sürümü oluşturabilir; belirli günleri
kapatabilir, süreleri değiştirebilir veya programı günde tek pratiğe indirebilir.
Değişiklik geçmiş/tamamlanmış seansları değiştirmez ve seçilen yürürlük
zamanından sonraki henüz başlamamış seanslara uygulanır. Eski zamanlanmış işler
geçersiz kılınır ve yeni plana göre tekrar oluşturulur.

Admin yeni plan için ileri bir yürürlük tarihi seçmezse plan bir sonraki
başlamamış pratikte devreye girer. Kaydedildikten sonra öğrenciye aktif günleri,
günlük pratik sayısını, saatleri ve süreleri içeren kanal özeti gönderilir.

### Hızlı Yanıtlar

- Yaptım
- Bugün yapamadım

`Yaptım` yanıtı seansı hemen `COMPLETED` yapar. Öğrencinin serbest not rızası
varsa meditasyonun nasıl geçtiğini, yaşadığı zorlukları ve fark ettiği duyguları
birkaç cümleyle anlatması isteğe bağlı olarak sorulur. Öğrenci bu soruya yanıt
vermezse seansın `COMPLETED` durumu değişmez ve ek hatırlatma gönderilmez.

MVP yalnızca yazılı değerlendirme kabul eder. Sesli mesajlar işlenmez, indirilmez
ve saklanmaz; öğrenciye özelliğin desteklenmediğini belirten kısa yanıt gönderilir.

Her hatırlatma ve değerlendirme mesajı ilgili pratik kimliğini taşıyan bir
button/reply context ile gönderilir. `Yaptım` veya `Bugün yapamadım` yanıtı önce
bu bağlamla eşleştirilir. Bağlamsız düz metin yalnızca aynı yerel günde tam bir
uygun seans varsa otomatik uygulanır; birden fazla aday varsa öğrenciden sabah/
akşam seçimi istenir.

Öğrenci pratiği erteleyemez ve agent planlanan saati değiştiremez. Değerlendirme
mesajından sonra yanıt bekleyen seans `AWAITING_RESPONSE` durumunda tutulur.
Öğrenci `Yaptım` derse `COMPLETED`, `Bugün yapamadım` derse `SKIPPED`, hiç yanıt
vermezse `MISSED` olur. `SKIPPED` öğrencinin geri bildirim verdiğini, `MISSED`
ise geri dönüş yapmadığını gösterir. Yanıtsız pratik için ek baskı/hatırlatma
mesajı gönderilmez.

Plan değişikliği, paket iptali veya admin işlemiyle gelecekteki bir seans
`CANCELLED`; mesaj tercihi, safety hold veya gönderim anı politika kontrolü
nedeniyle bilinçli olarak gönderilmeyen seans `SUPPRESSED` olur. Bu durumlar
`MISSED` sayılmaz ve devam oranının paydasına girmez.

Admin tek bir başlamamış pratiği veya seçilen yerel tarih aralığındaki
başlamamış pratikleri gerekçe girerek iptal edebilir. Toplu işlem sabah/akşam
slotu ve tarih aralığıyla sınırlanabilir. İptal, ilgili reminder/check-in
intent'lerini geçersiz kılar ve öğrenciye iptal özeti varsayılan kanalından
gönderilir.

Admin yanlış iptali yalnızca planlanan başlangıç geçmemişse, paket aktifse ve
seansın plan sürümü halen güncelse geri alabilir. Geri alınan seans `SCHEDULED`
olur ve reminder/check-in intent'leri yeniden oluşturulur. Eski plan sürümüne
ait, başlamış veya tamamlanmış seans geri alınamaz. İptal/geri alma eski-yeni
durum, kapsam, gerekçe ve admin kimliğiyle audit log'a yazılır. Geri alma
sonrasında güncel pratik zamanı öğrenciye varsayılan kanalından bildirilir.

Yanıt son tarihi, değerlendirme mesajının gönderildiği öğrencinin yerel takvim
gününün sonudur. Süre dolduğunda hâlâ yanıt yoksa seans `MISSED` olarak kapatılır.
Sonraki gün gelen yanıt mesaj geçmişinde tutulur ancak seans durumunu otomatik
değiştirmez. Admin gerekli görürse durumu düzeltebilir; eski/yeni durum audit
log'a yazılır.

## 7. Haftalık Görüşme Akışı

Her aktif öğrenci için aylık pakete bağlı dört haftalık görüşmenin tarihi, saati,
saat dilimi ve Google Meet bağlantısı tutulur. Her görüşme 60 dakikadır. Haftalık görüşme saatini admin
panelinden eğitmen belirler. Sistem görüşmeden önce öğrencinin varsayılan kanalından
görüşme hatırlatmasını ve Meet bağlantısını gönderir; WhatsApp kullanılıyorsa
gerekli onaylı şablon politikası uygulanır.

Admin ilk görüşmenin gün ve saatini seçtiğinde sistem kalan üç görüşmeyi sırasıyla
7, 14 ve 21 gün sonrasına otomatik planlar. Admin her görüşmeyi daha sonra ayrı
ayrı değiştirebilir. Tek bir görüşmenin değiştirilmesi diğer görüşmeleri
kendiliğinden kaydırmaz; tüm seriyi değiştirmek ayrı bir admin işlemi olur.

Görüşme tarihi, saati, iptali veya yeniden planlanması yalnızca yetkili admin
tarafından admin portalından yapılabilir. Öğrenci mesajları, agent veya Google
Calendar'da portal dışında yapılan değişiklikler sistemdeki görüşmeyi doğrudan
değiştiremez. Öğrenci değişiklik isteğini `DESTEK` üzerinden iletebilir; nihai
işlem admin portalında yapılır ve audit log'a yazılır.

Her paket için Google Calendar'da dört haftalık tek bir görüşme serisi ve bu
seriye ait tek bir Google Meet bağlantısı oluşturulur. Dört görüşme aynı Meet
bağlantısını kullanır; bağlantı her görüşmeden önce öğrenciye yeniden gönderilir.
Yeni paket yeni bir Calendar serisi ve yeni Meet bağlantısı oluşturur. Tekil
görüşme değişiklikleri ilgili Calendar occurrence kaydıyla eşitlenir.

Öğrenciye her görüşmeden 24 saat ve 1 saat önce varsayılan kanalından iki ayrı hatırlatma
gönderilir. Her iki mesaj da Google Meet bağlantısını içerir. Görüşme tarihi
değiştirilirse eski hatırlatma görevleri geçersiz kılınır ve yeni saate göre
yeniden oluşturulur.

Görüşmenin güncel durumları `SCHEDULED`, `COMPLETED`, `NO_SHOW` ve `CANCELLED`
olarak tutulur. Yeniden planlama terminal durum değil, append-only `RESCHEDULED`
takvim olayıdır; görüşme yeni zamanıyla `SCHEDULED` kalır. `COMPLETED` ve
`NO_SHOW` bir görüşme hakkı tüketir; `CANCELLED` ve yeniden planlama tüketmez.
Durumu yalnızca admin değiştirebilir. Durum sonradan düzeltilirse hak mutable
sayaçla ezilmez; grant/consume/reversal credit olayı eklenir ve audit log tutulur.

Görüşmeden üç saat önce sistem şu deterministik verileri hazırlar:

- Planlanan ve tamamlanan pratik sayısı
- Devam oranı
- Yapılamayan veya geri dönüş alınamayan pratikler
- Öğrencinin sık ifade ettiği zorluklar
- Öğrencinin paylaştığı öne çıkan duygular
- Önceki haftaya göre ölçülebilir değişimler
- Öğrencinin görüşmede konuşmak istediği konular
- M6'da yapay zeka kullanılmaz; AI taslak özet M7 kapsamındadır

Özet görüşmeden 3 saat önce oluşturulur ve admin panelinde bildirim gösterilir.
Veri aralığı önceki görüşmeden mevcut görüşmeye kadardır; paketin ilk
görüşmesinde paket başlangıcı esas alınır. Hassas özet kanal mesajına
yazılmaz, yalnızca güvenli admin portalında gösterilir.

AI rızası varsa duygu notları, zorluklar ve görüşmede ele alınabilecek konular
için AI destekli taslak hazırlanır. AI rızası yoksa yalnızca deterministik devam
oranı, pratik sayıları ve öğrencinin izin verdiği ham kayıtlar gösterilir; AI
analizi veya metin özeti üretilmez.

AI taslağı model, prompt sürümü ve üretim zamanı ile değişmez kaynak kayıt olarak
saklanır. Admin bu metni değiştirmez; ayrı bir eğitmen notu oluşturup
düzenleyebilir. Eğitmen notunun değişiklik geçmişi audit log'a yazılır. AI
taslağı ve eğitmen notu öğrenciye otomatik gönderilmez; yalnızca admin portalında
geçmiş görüşmelerle birlikte görüntülenir.

## 8. Yapay Zekanın Rolü

### Kullanılacağı Yerler

- Öğrencinin serbest metninden kontrollü etiketler çıkarma
- Duygu ve pratik zorluklarını sınıflandırma
- Haftalık sayısal verilerden okunabilir taslak özet oluşturma
- Yazım farklılıkları olan basit komutları tanıma

### Kullanılmayacağı Yerler

- Ödeme doğrulama
- Öğrenci aktivasyonu
- Mesaj zamanlarının hesaplanması
- Yetkilendirme kararları
- Tanı, tedavi veya kriz değerlendirmesi
- Veritabanına doğrudan ve doğrulamasız yazma

Yapay zeka çıktıları şemalı veri olarak alınır, backend tarafından doğrulanır ve
orijinal öğrenci mesajından ayrı saklanır.

### System Events ve Standart Mesajlar

Backend'in bildiği sistem olayları kod tarafından sürümlü bir event kataloğu
olarak tanımlanır. Admin yeni bir backend davranışı veya serbest event key
yaratamaz; ancak desteklenen olaya bağlı yeni mesaj tanımı/varyantı oluşturabilir,
mevcut mesajın yeni immutable sürümünü yayınlayabilir ve eski sürüme dönebilir.

MVP event kataloğu:

| Grup | Event key'leri |
| --- | --- |
| Kayıt ve izin | `REGISTRATION_STARTED`, `PRIVACY_NOTICE_SENT`, `CHANNEL_OPT_IN_REQUEST`, `REFLECTION_STORAGE_CONSENT_REQUEST`, `REFLECTION_AI_CONSENT_REQUEST`, `AGENT_REPLY_AI_CONSENT_REQUEST`, `NAME_REQUEST`, `REGISTRATION_ALREADY_EXISTS`, `CONSENT_WITHDRAWN` |
| Ödeme ve paket | `PAYMENT_INSTRUCTIONS`, `PAYMENT_REPORTED`, `PAYMENT_ACTION_REQUIRED`, `PAYMENT_APPROVED`, `PAYMENT_REFUNDED`, `STUDENT_ACTIVATED`, `SUBSCRIPTION_SCHEDULED`, `SUBSCRIPTION_STARTED`, `SUBSCRIPTION_RENEWAL_REMINDER`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_CANCELLED` |
| Pratik | `PRACTICE_PLAN_CONFIRMATION_REQUEST`, `PRACTICE_PLAN_CONFIRMED`, `PRACTICE_PLAN_UPDATED`, `PRACTICE_REMINDER`, `PRACTICE_CHECKIN`, `PRACTICE_REFLECTION_REQUEST`, `PRACTICE_COMPLETED_ACK`, `PRACTICE_SKIPPED_ACK`, `PRACTICE_RESPONSE_AMBIGUOUS`, `PRACTICE_CANCELLED`, `PRACTICE_RESTORED`, `PRACTICE_PAUSED`, `PRACTICE_RESUMED` |
| Görüşme | `MEETING_SERIES_SCHEDULED`, `MEETING_SCHEDULED`, `MEETING_REMINDER_24H`, `MEETING_REMINDER_1H`, `MEETING_RESCHEDULED`, `MEETING_CANCELLED`, `MEETING_COMPLETED`, `MEETING_NO_SHOW`, `MEET_LINK_UNAVAILABLE` |
| Bilgi ve destek | `STUDENT_CONTEXT_RESPONSE`, `WEEKLY_SUMMARY_SHARED`, `KNOWLEDGE_NOT_FOUND`, `HANDOFF_OPENED`, `HANDOFF_RESOLVED`, `AGENT_UNAVAILABLE`, `UNKNOWN_MESSAGE_FALLBACK`, `UNSUPPORTED_MEDIA` |
| Kanal | `CHANNEL_LINK_REQUESTED`, `CHANNEL_LINK_CONFIRMED`, `DEFAULT_CHANNEL_CHANGED`, `CHANNEL_OPT_IN_WITHDRAWN`, `MESSAGING_PAUSED`, `MESSAGING_RESUMED`, `CHANNEL_DELIVERY_FAILED` |
| Gizlilik ve safety | `DELETION_REQUEST_RECEIVED`, `DELETION_REQUEST_APPROVED`, `DELETION_REQUEST_REJECTED`, `DELETION_COMPLETED`, `SAFETY_STUDENT_GUIDANCE`, `SAFETY_ALERT_CLOSED` |
| Admin bildirimi | `ADMIN_PAYMENT_REVIEW_REQUIRED`, `ADMIN_SUBSCRIPTION_EXPIRING`, `ADMIN_WEEKLY_SUMMARY_READY`, `ADMIN_HANDOFF_REQUIRED`, `ADMIN_SAFETY_ALERT`, `ADMIN_DELETION_REQUEST`, `ADMIN_MESSAGE_DELIVERY_FAILED`, `ADMIN_CALENDAR_DISCREPANCY`, `ADMIN_KNOWLEDGE_INDEX_FAILED` |

Her event; hedef kitle (`STUDENT/ADMIN`), izinli kanallar, izinli/zorunlu
değişkenlerin JSON schema'sı, compliance sınıfı, varsayılan son kullanım
süresi ve `protected` bilgisini taşır. `CUSTOM_MANUAL` yalnızca adminin tek
öğrenciye manuel mesajı için kullanılabilir; otomatik trigger, toplu yayın,
serbest cron/SQL veya yeni template değişkeni oluşturmaz.

Admin standart mesajda event, kanal, dil, müfredat aşaması, sabah/akşam slotu,
öncelik ve geçerlilik zamanı seçebilir. İçerik yalnızca event schema'sındaki
değişkenleri kullanabilir. Birden fazla varyant eşleşirse kanal+dil+aşama+slot
özgüllüğü ve admin önceliğiyle deterministik seçim yapılır. Admin preview,
test alıcısına gönderim, publish, archive ve rollback yapabilir.

KVKK/rıza, safety, veri silme ve finansal yönerge event'leri `protected` olur.
Admin bunların event/variable schema'sını değiştiremez; yalnızca uzman tarafından
onaylanmış içerik sürümleri arasında seçim yapabilir. WhatsApp pencere dışı
varyantı ayrıca Meta template adı, dili, kategorisi ve approval durumuyla eşleşir;
içerik değişikliği yeni Meta onayı gerektirir.

Her inbound mesaj için tek bir `response owner` seçilir:

```text
SYSTEM_STANDARD_MESSAGE | AGENT_CONTEXTUAL | ADMIN_HANDOFF | NO_REPLY
```

Button, açık komut veya beklenen state cevabı bir domain command/event tetiklerse
`SYSTEM_STANDARD_MESSAGE` sahibi olur; event uygulanır ve standart mesaj
gönderilir, aynı inbound için generatif LLM çağrılmaz. Belirsiz doğal dilde LLM
yalnızca allowlist içindeki `proposedIntent` ve confidence önerebilir. Backend
kritik işlemi bununla doğrudan yapmaz; standart onay mesajı/button gönderir. Öğrenci
onayladığında domain event ve onun standart sonucu çalışır. Hiçbir system event
mesajı tüketmezse `AGENT_CONTEXTUAL` çalışır. Kişisel operasyon sorularında
backend'in güvenli read-model context'i, genel meditasyon sorularında stage-filtered
RAG, birleşik sorularda ikisi birlikte kullanılabilir. Gerekli veri/kaynak yoksa
handoff sahibi olur.
Safety kontrolü bağımsız olarak admin alarmı oluşturabilir; öğrenciye giden tek
cevapta safety standart mesajı en yüksek önceliktedir. Bir inbound hem event hem
serbest soru içeriyorsa MVP event'i uygular ve yalnızca standart event cevabını
gönderir; aynı turda ikinci bir RAG cevabı eklenmez.

### Genel Öğrenci Context Query

Kişisel bilgi soruları için her soru cümlesine ayrı system event tanımlanmaz.
Agent tek bir kontrollü `get_student_context` read-only aracını kullanır:

```text
sections: PRACTICE | MEETINGS | MEMBERSHIP | PAYMENT | ACCOUNT
range: CURRENT_PACKAGE | LAST_30_DAYS | ALL_PAGED
```

LLM `student_id` veya serbest SQL vermez. Backend mesajın doğrulanmış kanal
kimliğinden öğrenciyi bağlar, izinli section/range'i doğrular ve yalnızca bu
öğrenciye ait typed projection döndürür. Pratik context'i aktif plan, saat
dilimi, sabah/akşam saatleri, süre, pause durumu, ilgili dönemdeki session kayıtları
ve backend tarafından hesaplanmış toplamları kapsar. Ham ORM satırı, internal
alan, başka öğrenci verisi veya serbest DB erişimi verilmez.

Varsayılan pratik aralığı `CURRENT_PACKAGE` olup bu dönemdeki tüm pratik
kayıtları context'e girebilir. Geçmiş paketler sorulursa `ALL_PAGED` sayfalı ve
context token limitiyle okunur. Reflection metinleri varsayılan olarak dışlanır;
yalnızca soru için gerekliyse ve `REFLECTION_AI` rızası aktifse ayrı izinli alan
olarak eklenir. Dekont, banka detayı, coach note ve safety içeriği hiçbir genel
context query'ye girmez.

`AGENT_CONTEXTUAL` DB gerçeklerini icat etmez; saat, süre, durum, sayı ve tarihleri
tool sonucundan kullanır. Tamamlanma/kaçırma oranları backend tarafından
deterministik hesaplanır, LLM yalnızca açıklar. Her context read; section, range,
`asOf`, dönen kayıt kimliği/hash'leri ve kaynak mesajla audit/usage kaydına bağlanır;
payload ikinci kez loglanmaz.

`AGENT_REPLY_AI` izni yoksa LLM/context tool çağrılmaz. Temel hizmet bilgileri
erişilebilir kalır: `PROGRAMIM`, `GÖRÜŞMEM`, `PAKETİM`, `ÖDEMEM` komutları veya
button'ları backend read-model'i doğrudan çağırır ve tek genel
`STUDENT_CONTEXT_RESPONSE` event'inin section'a uygun standart mesaj varyantını
gönderir. Bu deterministic yol generatif reasoning yapmaz.

### Bilgi Bankası ve Agent Yanıtı

Agent serbest bilgi sorularına yalnızca admin tarafından yayınlanmış bilgi
bankasına dayanarak cevap verir. Bilgi bankası aşamaları `GENERAL`, `WEEK_1`,
`WEEK_2`, `WEEK_3`, `WEEK_4`, `INTERMEDIATE` ve `ADVANCED` olarak ayrılır. Admin
bir bilgi bankasına birden fazla dosya ekleyebilir ve her dosyayı bir veya birden
fazla aşamaya atayabilir.

Öğrencinin ilk paketindeki gün 1-7, 8-14, 15-21 ve 22-paket sonu sırasıyla
`WEEK_1`-`WEEK_4` kapsamını belirler. İlk paket tamamlandıktan sonra varsayılan
aşama `INTERMEDIATE` olur. `ADVANCED` yalnızca admin tarafından atanır. Admin
gerektiğinde öğrencinin aşamasını audit kaydıyla değiştirebilir. Retrieval
yalnızca `GENERAL` ve öğrencinin güncel aşamasına atanmış yayınlanmış dosyalarda
çalışır; bir dosyanın birden fazla aşamada görünmesi admin etiketiyle sağlanır.

Admin PDF, DOCX, Markdown veya düz metin dosyalarını toplu yükleyebilir; dosya
ayrıştırma ve indeksleme durumu `DRAFT`, `PROCESSING`, `READY`, `FAILED`,
`PUBLISHED`, `ARCHIVED` olarak görünür. Admin çıkarılan metni/chunk'ları önizler,
test sorgusu çalıştırır ve ancak sonra yayınlar. Dosya değiştirme mevcut kaydı
ezmez; yeni immutable sürüm ve yeniden indeksleme işi oluşturur.

Bilgi bankası dosyası en fazla 25 MiB, tek çoklu yükleme isteği toplam 100 MiB
olabilir. Ödeme dekontu için dosya başına limit 10 MiB'dir. Limit aşımı indirme
veya kalıcı saklama tamamlanmadan reddedilir; yarım yüklenen obje temizlenir.

Arama varsayılan olarak PostgreSQL/pgvector üzerinde hybrid anahtar kelime ve
embedding retrieval kullanır. Skor eşiğini geçen kaynak bulunursa agent yalnızca
seçilen parçalardaki bilgiyle kısa yanıt üretir; kullanılan doküman/chunk ve
skorlar admin incelemesi için kaydedilir. Kaynak yoksa, kaynaklar çelişiyorsa
veya soru izinli kapsamın dışındaysa agent tahmin yürütmez. Öğrenciye bilgi
bankasında doğrulanmış yanıt bulunamadığını belirten sabit mesaj gönderilir ve
`KNOWLEDGE_NOT_FOUND` nedenli handoff açılır.

Bilgi bankasında öğrenci verisi, coach note, dekont veya başka kişisel veri
bulunmaz. Embedding model çağrıları LLM usage ve bütçe kayıtlarına dahil edilir.
RAG sorgu logu soru metnini ikinci kez kopyalamaz; kaynak mesaj ve seçilen chunk
kimliklerine referans verir.

### İnsan Desteğine Geçiş

Öğrenci `DESTEK` yazdığında öğrenciye bağlı bir destek kaydı açılır ve admin
panelinde bildirim oluşturulur. Bilgi bankasında yeterli kaynak bulunamaması da
aynı mekanizmayı `KNOWLEDGE_NOT_FOUND` nedeniyle açar. Agentın serbest metin
yanıtları bu öğrenci için durur. Admin portal içinden öğrencinin varsayılan
kanalına yanıt verir.

Planlanmış pratik hatırlatmaları ve değerlendirme mesajları destek kaydı açıkken
varsayılan olarak devam eder. Admin gerektiğinde otomatik mesajları ayrıca
duraklatabilir. Admin destek kaydını çözüldü olarak kapattığında agentın normal
akışı tekrar etkinleşir. Açma, duraklatma, admin yanıtı ve kapatma işlemleri
audit log'a yazılır.

## 9. Önerilen Mimari

İlk sürüm TypeScript ve NestJS tabanlı bağımsız bir modüler monolit olarak
geliştirilir. Mevcut genel amaçlı FastAPI agent servisi portal backend'inin
çalışma zamanı bağımlılığı olmayacaktır.

### Mevcut WhatsApp Altyapısı

- Cloud API'ye bağlı mevcut işletme numarası: `+905428078429`
- Üretim numarası: `+905428078429`
- Test/yedek numarası: `+66634937176`
- Meta WhatsApp Cloud API uygulaması ve telefon numarası kimliği mevcut
- Mevcut webhook: `https://agentapi.pusulamkendim.com/webhook`
- Mevcut servis: `projects/whatsapp-agent`, Python ve FastAPI
- Access token ve doğrulama tokenı mevcut serviste ortam değişkenlerinden okunuyor
- Webhook imzası için Meta App Secret yeni servise ayrı deployment secret olarak tanımlanacak
- Operasyon bilgileri yerel `CHEATSHEET.md` dosyasında bulunuyor

Token değerleri bu proje belgelerine veya Git'e kopyalanmaz. Mevcut servis metin
mesajı alma/gönderme ve kanal yönlendirmeyi destekliyor. Meditasyon portalı için
şablon mesajlar, medya/dekont alma, kalıcı zamanlama, alan modeli ve hassas
logların maskelenmesi ayrıca geliştirilmelidir.

Mevcut numaradaki diğer agentlar yalnızca deneme/test amaçlıdır ve aktif müşteri
trafiği taşımamaktadır. Üretim webhook callback'i yeni NestJS servisine
taşınacaktır. Aynı numara için eski FastAPI webhook'u paralel üretim tüketicisi
olarak kullanılmayacak; test agentlarının WhatsApp mesaj akışı geçişten sonra
devre dışı kalacaktır.

Backend telefon numarasını veya Meta telefon numarası kimliğini kaynak kodda
sabit tutmaz. Üretim numarası deployment secret/ortam değişkenlerinden seçilir.
MVP tek üretim numarasıyla çalışır; ikinci numara için aynı anda çoklu hesap
desteği ilk sürüm kapsamına alınmaz. Test ortamı yalnızca izin verilen test
numaralarına mesaj gönderebilir ve gerçek öğrenci verisi kullanmaz.

### Telegram ve Varsayılan Kanal

MVP ayrı bir Telegram bot hesabıyla kayıt, deterministik komut, pratik takibi,
hatırlatma, agent yanıtı ve admin yanıtını destekler. Telegram bot token'ı ve
webhook secret'ı deployment secret olarak tutulur. Yalnızca botla `/start` veya
`KAYIT` başlatmış private chat'ler kabul edilir; grup ve kanal mesajları işlenmez.

Öğrencinin ilk tamamladığı kayıt kanalı varsayılan kanal olur. Bütün proaktif
mesajlar, admin yanıtları ve agent yanıtları bu kanala gönderilir. Telegram
kaydında telefon zorunlu değildir; öğrenci UUID ile, Telegram chat/user kimliği
ise şifreli alan ve lookup HMAC'iyle tutulur.

Mevcut öğrenci ikinci kanalı kısa ömürlü, tek kullanımlı bağlama token'ıyla
doğrular. Token bot deep link'iyle kullanılır, veritabanında yalnızca hash'i
tutulur. Doğrulanmış ikinci kanal varsayılan yapılabilir; değişiklik öğrencinin
bağlı kanal komutu veya adminin audit'li işlemiyle gerçekleşir.

WhatsApp 24 saatlik pencere veya template hatası Telegram'a sessiz otomatik
fallback oluşturmaz. Bu davranış kanal iznini aşabilir ve çift mesaj üretebilir.
Öğrenci Telegram'ı bağlayıp varsayılan kanal yaptığında sonraki mesajlar
Telegram'dan gider. Varsayılan kanal kullanılamıyorsa intent başarısız olur ve
admin uyarılır; ancak açıkça onaylanmış ilerideki bir failover politikası olmadan
başka kanaldan gönderilmez.

```text
WhatsApp Cloud API ----+
                       +--> Channel Webhook API
Telegram Bot API ------+           |
                                   v
                         Kayıt ve Konuşma Motoru
        |
   +----+------------------+
   |                       |
PostgreSQL          Zamanlanmış İşler
   |                       |
   +----+------------------+
        |
Kanal Mesaj Gönderici
        |
Yapay Zeka Özetleme Servisi
        |
Admin API ve Admin Portalı
```

### Teknoloji Taslağı

| Katman | Öneri |
| --- | --- |
| Backend | TypeScript ve NestJS tabanlı bağımsız servis |
| Veritabanı | PostgreSQL |
| İş kuyruğu | PostgreSQL tabanlı pg-boss |
| WhatsApp | Meta WhatsApp Cloud API |
| Telegram | Telegram Bot API |
| Vektör arama | PostgreSQL pgvector + hybrid retrieval |
| Admin portalı | Next.js |
| Dosya saklama | S3 uyumlu özel obje deposu |
| Admin e-posta | AWS SES (`eu-central-1`) |
| Yerelleştirme | BCP 47 locale, başlangıç dili `tr-TR` |
| Feature flag | DB tabanlı typed registry ve deterministik rollout |
| Şema doğrulama | NestJS DTO ve/veya Zod |
| Gözlemlenebilirlik | Yapılandırılmış log, metrik ve hata izleme |
| CI/release | GitHub Actions |

İlk ölçekte ayrı mikroservisler veya Redis zorunlu değildir. İş hacmi büyüdüğünde
mesaj worker'ları ayrıştırılabilir ve Redis tabanlı kuyruk değerlendirilebilir.

WhatsApp Cloud API callback'i yeni NestJS servisindeki doğrulama ve mesaj
endpoint'lerine yönlendirilecektir. Kimlik bilgileri yeni servise deployment
ortam değişkenleri/secret yönetimi üzerinden verilecek; kaynak koda veya proje
belgelerine yazılmayacaktır.

Telegram webhook'u ayrı endpoint'e yönlendirilir ve
`X-Telegram-Bot-Api-Secret-Token` sabit zamanda doğrulanır. Telegram `update_id`
kanal hesabıyla birlikte tekilleştirilir.

### Üretim Dağıtımı

- CI ve release orkestrasyonu GitHub Actions ile yapılır.
- Pull request'lerde lint, typecheck, test, migration, build ve güvenlik kontrolleri zorunludur.
- Staging otomatik, production korumalı environment ve manuel onayla deploy edilir.
- Coolify aynı immutable container image digest'ini API, worker ve admin süreçlerinde çalıştırır.
- Barındırma: mevcut Coolify sunucusunda bağımsız uygulama
- API alan adı: `meditation-api.pusulamkendim.com`
- WhatsApp callback: `https://meditation-api.pusulamkendim.com/webhooks/whatsapp`
- Telegram callback: `https://meditation-api.pusulamkendim.com/webhooks/telegram`
- Üretim WhatsApp numarası: `+905428078429`
- Test/yedek WhatsApp numarası: `+66634937176`
- Telegram bot hesabı/token/secret: deployment öncesi BotFather ve secret yönetiminde tanımlanacak
- Üretim ve geliştirme ortamlarının secret ve veritabanları birbirinden ayrılır
- Staging, ayrı Meta/Google/Gemini kimlikleri ve zorunlu E.164 alıcı allowlist'i kullanır
- İlk kapasite hedefi: 100 eşzamanlı aktif öğrenci
- Çalışma süreçleri: bir NestJS API ve aynı kod tabanından ayrı bir job worker
- Worker ölçeği kuyruk gecikmesi ve hata metriklerine göre artırılabilir
- PostgreSQL ve dosyalar günlük şifreli yedeklenir
- Yedek saklama süresi: 30 gün
- RPO: en fazla 24 saat veri kaybı
- RTO: en fazla 4 saat geri dönüş
- Ayda bir gerçek geri yükleme testi yapılır
- Yedekleme/geri yükleme hataları admin bildirimi oluşturur
- PostgreSQL mevcut Coolify sunucusunda projeye özel veritabanı/kalıcı disk kullanır
- Dekontlar ve dosyalar sunucu dışı özel S3 uyumlu obje deposunda tutulur
- Şifreli veritabanı yedekleri harici obje deposunda ayrı erişim alanında tutulur
- Üretim veritabanı başka uygulamalarla paylaşılmaz
- Pilot öncesinde sabit altyapı hard limiti uygulanmaz
- Coolify, obje deposu, WhatsApp ve Gemini maliyetleri ayrı izlenir
- İlk 30 günlük gerçek kullanım sonrasında bütçe eşikleri belirlenir
- Beklenmeyen maliyet artışları admin uyarısı oluşturur

## 10. Backend Modülleri

- `students`: öğrenci profili ve yaşam döngüsü
- `consents`: aydınlatma ve izin kayıtları
- `payments`: ödeme bildirimi ve admin onayı
- `subscriptions`: aylık paket dönemi ve yenileme durumu
- `practice-plans`: program ve pratik saatleri
- `practice-sessions`: tekil planlanmış meditasyonlar
- `reflections`: pratik sonuçları ve öğrenci metinleri
- `meetings`: haftalık görüşmeler
- `summaries`: haftalık ölçümler ve yapay zeka özetleri
- `llm`: provider/model registry, görev ayarları ve kullanım kayıtları
- `knowledge`: bilgi bankası, dosya sürümü, chunk, embedding ve retrieval
- `channels`: WhatsApp/Telegram hesapları, webhook ve kanal kimlikleri
- `messaging`: kanal-bağımsız mesaj intent'i, gönderim ve teslim durumu
- `system-events`: kod-sürümlü event kataloğu, occurrence ve response ownership
- `message-catalog`: admin yönetimli standart mesaj, varyant, sürüm ve provider binding
- `student-context`: LLM için öğrenciye bağlı, section-filtered read-model projection
- `notifications`: admin e-posta/WhatsApp delivery ve escalation
- `localization`: locale çözümleme, çeviri kataloğu ve fallback
- `feature-flags`: pilot hedefleme, yüzdesel rollout ve kill switch
- `jobs`: kalıcı zamanlanmış görevler
- `admin`: yetkilendirme ve operasyon işlemleri
- `handoffs`: insan desteği ve admin yanıtları
- `safety`: olası acil risk işaretleri, sabit yönlendirme ve admin uyarıları
- `audit`: kritik değişikliklerin kayıtları

### Çoklu Dil ve Kademeli Yayın

İlk ürün dili `tr-TR` olur. Öğrenci tercih dili BCP 47 locale olarak saklanır;
saat dilimi bundan bağımsızdır. Event anahtarları dilden bağımsız, standart mesaj,
Meta template ve gerektiğinde bilgi bankası içeriği locale bazlı sürümlenir. Eksik
bölgesel çeviri önce ana dile, sonra onaylı `tr-TR` metnine düşer. Safety ve hukuki
metinler LLM tarafından otomatik çevrilmez; yeni dil uzman/çeviri kontrolü ve kanal
template onayı olmadan açılamaz.

Yeni veya riskli özellikler typed feature flag ile önce öğrenci allowlist'ine,
sonra deterministik yüzdesel gruplara ve en son genel kullanıma açılır. WhatsApp,
Telegram, LLM, RAG ve proaktif mesajlar için kill switch bulunur. Flag hiçbir zaman
rıza, yetki, safety, ödeme veya saklama kurallarını devre dışı bırakamaz; tüm flag
değişiklikleri gerekçe ve admin kimliğiyle audit edilir.

## 11. Temel Veri Varlıkları

| Varlık | Temel İçerik |
| --- | --- |
| Student | Opsiyonel telefon, ad-soyad, durum, müfredat aşaması, saat dilimi ve varsayılan kanal kimliği |
| Consent | REFLECTION_STORAGE/REFLECTION_AI/AGENT_REPLY_AI kapsamı, metin sürümü, GRANTED/DENIED/WITHDRAWN durumu, zaman ve mesaj kimliği |
| ChannelIdentity | WHATSAPP/TELEGRAM hesabı, şifreli harici kimlik, HMAC lookup, VERIFIED/BLOCKED durumu |
| ChannelOptIn | Kanal ve hizmet mesajı kapsamı, kaynak, metin sürümü, GRANTED/WITHDRAWN durumu ve zaman |
| ChannelLinkToken | Tek kullanımlı hash'lenmiş token, hedef kanal ve son kullanım zamanı |
| PrivacyNoticeReceipt | Aydınlatma sürümü, iletim kanalı ve zamanı |
| Payment | Tutar, referans, dekont; PENDING/REVIEW/ACTION_REQUIRED/APPROVED/REFUNDED durumu ve düzeltme nedeni |
| PaymentAdjustment | İade/eksik/fazla ödeme türü, tutar, açıklama, tarih ve admin |
| SubscriptionPeriod | Dahil başlangıç/hariç bitiş tarihi, dört görüşme hakkı, ödeme bağlantısı ve durum |
| PracticePlan | Sürümlü plan, geçerlilik aralığı, haftanın aktif günleri ve admin override |
| PracticeSlot | Tek/çift günlük pratik, başlangıç saati, süre ve aktiflik durumu |
| PracticeDurationRule | Paket/öğrenci bazında hafta, süre, geçerlilik ve admin override kaydı |
| ScheduleChangeRequest | Öğrencinin talebi, istenen değişiklik, durum ve admin işlemi |
| PracticeSession | Planlanan başlangıç/bitiş, plan sürümü ve reply context; AWAITING_RESPONSE/COMPLETED/SKIPPED/MISSED/CANCELLED/SUPPRESSED durumu |
| Reflection | İsteğe bağlı özgün yazılı metin; PENDING/SUBMITTED/SKIPPED durumu |
| ReflectionTag | Yapay zeka etiketi, güven değeri ve model sürümü |
| MeetingSeries | Paket, Google Calendar seri kimliği ve ortak Meet bağlantısı |
| WeeklyMeeting | Logical hak slotu, tarih, Google occurrence kimliği/original start/etag, Meet bağlantısı, sync ve görüşme durumu |
| MeetingScheduleEvent | Görüşme planlama/yeniden planlama geçmişi, eski/yeni zaman ve admin |
| WeeklySummary | Sayısal ölçümler, deterministik kaynak ve üretim zamanı |
| CoachNoteVersion | Haftalık görüşmeye bağlı sürümlü eğitmen notu ve değişiklik geçmişi |
| Message | Kanal, kanal hesabı, gelen/giden içerik, harici kimlik ve teslim durumu |
| MessageIntent | Kategori, hedef kanal kimliği, plan sürümü, due/expiry, idempotency ve politika sonucu |
| MessageDeliveryEvent | Kanal, harici mesaj kimliği, teslim durumu, provider zamanı ve tekilleştirme anahtarı |
| SystemEventDefinition | Kod-sürümlü event key, audience, kanal, variable schema, compliance, expiry ve protected bilgisi |
| SystemEventOccurrence | Event, aggregate, allowlist payload, causation/correlation, kaynak mesaj ve işlenme durumu |
| StandardMessageDefinition | Admin mesaj türü, bağlı event, ad, aktiflik ve manuel/otomatik kullanım |
| StandardMessageVariant | Kanal, dil, aşama, slot, öncelik, geçerlilik aralığı ve provider binding |
| StandardMessageVersion | Immutable içerik, değişken schema snapshot'ı, DRAFT/PUBLISHED/ARCHIVED ve onay bilgisi |
| KnowledgeBase | Ad, açıklama, aktiflik ve varsayılan retrieval ayarları |
| KnowledgeDocumentVersion | Dosya, hash, aşama etiketleri, parser/index durumu, yayın ve sürüm bilgisi |
| KnowledgeChunk | Doküman sürümü, başlık yolu, içerik, hash, token ve aşama metadata'sı |
| KnowledgeEmbedding | Chunk, embedding modeli/sürümü, pgvector ve durum |
| RagQueryLog | Kaynak mesaj, öğrenci aşaması, seçilen chunk/skorlar, eşik sonucu ve handoff referansı |
| AgentContextRead | Kaynak mesaj, section/range, asOf, kayıt kimliği/hash'leri, row count, latency ve cevap referansı |
| LlmProvider | Allowlist adapter kimliği, sabitlenmiş base URL/secret referansı ve aktiflik |
| LlmModel | Model referansı, provider, fiyat, bağlam, özellikler ve aktiflik |
| LlmTaskConfig | Görev bazlı seçili model, fallback ve üretim ayarları |
| LlmUsageLog | Görev, model, ayrıntılı tokenlar, fiyat sürümü, tahmini maliyet, gecikme, provider request ID ve ilgili kayıt |
| LlmBudget | Günlük/aylık USD limiti, eşikler, hard limit ve mevcut durum |
| ScheduledJob | Çalışma zamanı, deneme sayısı ve sonuç |
| Handoff | Öğrenci, OPEN/RESOLVED durumu, admin yanıtları ve zamanlar |
| MessagingPreference | ACTIVE/PRACTICE_PAUSED/ALL_PAUSED durumu, kaynak ve değişim zamanı |
| SafetyAlert | Öğrenci, mesaj, risk kuralı, OPEN/ACKNOWLEDGED/CLOSED durumu ve zamanlar |
| DataDeletionRequest | REQUESTED/APPROVED/RUNNING/FAILED/REJECTED/COMPLETED durumu, manifest, öğrenci, admin ve zamanlar |
| DeletionJournal | Veritabanından ayrı, append-only silme manifesti ve geri yükleme uygulama durumu |
| AuditLog | İşlemi yapan kişi, değişiklik, eski/yeni değer |

## 12. Mesajlaşma ve Zamanlama Kuralları

- Otomatik mesajlar kısa, sakin, nötr ve yargılamayan bir dil kullanır.
- Mesajın otomatik sistem tarafından gönderildiği gizlenmez.
- Mesajlar eğitmen tarafından kişisel olarak yazılmış izlenimi oluşturmaz.
- `Pratiğini yapmadın` gibi suçlayıcı ifadeler kullanılmaz.
- Yanıtsızlık `Bu pratik için geri dönüş alınamadı` gibi nötr dille ifade edilir.
- MVP'de öğrenciye mesaj tonu seçimi sunulmaz.
- Genel günlük mesaj tavanı uygulanmaz.
- Normal günde iki pratik hatırlatması ve iki değerlendirme isteği planlanır.
- `Yaptım` yanıtına bağlı isteğe bağlı değerlendirme soruları reaktif mesajdır.
- Görüşme ve üyelik mesajları ilgili günlerde ayrı kategori olarak gönderilir.
- Her mesaj kategorisi/olayı için idempotency anahtarıyla çift gönderim engellenir.
- Gelen mesajlar kanal hesabı ve kanalın harici event/mesaj kimliğiyle tekilleştirilir.
- Teslim olayları kanal, harici mesaj kimliği, durum ve provider zamanıyla ayrı tekilleştirilir.
- Sırasız teslim olayları mesaj durumunu geriye döndüremez.
- Aynı webhook tekrar gelse bile işlem yalnızca bir kez uygulanır.
- Her gönderim görevi benzersiz ve tekrar çalıştırılabilir olmalıdır.
- Başarısız gönderimler sınırlı sayıda ve artan aralıklarla denenir.
- Kalıcı olarak başarısız işler admin panelinde gösterilir.
- Saatler veritabanında UTC, kullanıcının saat dilimi ayrı alanda tutulur.
- Program değiştiğinde eski gönderim görevleri iptal edilir veya geçersiz kılınır.
- Aktif olmayan öğrenciye pratik mesajı gönderilmez.
- Paket sona erdiğinde gelecekteki pratik ve görüşme görevleri iptal edilir.
- Yeni paket başladığında yalnızca yeni döneme ait görevler oluşturulur.
- Paket bitişinden üç gün önce yenileme hatırlatması yalnızca bir kez gönderilir.
- `PRATİĞİ DURDUR` pratik hatırlatma ve değerlendirme mesajlarını durdurur.
- `TÜMÜNÜ DURDUR` tüm proaktif otomatik kanal mesajlarını durdurur.
- `MESAJ İZNİ İPTAL` varsayılan kanal opt-in kaydını geri çeker ve yeni proaktif intent oluşturulmasını engeller.
- Durdurma komutları öğrencinin mesaj göndermesini veya admin yanıtını engellemez.
- `DEVAM`, aktif paket varsa durdurulan kategorileri geleceğe dönük yeniden başlatır.
- Devam işleminde geçmişte gönderilmemiş mesajlar topluca gönderilmez.
- Admin mesaj tercihlerini portalda görebilir ve aynı işlemleri uygulayabilir.
- `VERİLERİMİ SİL` komutu doğrudan silme yapmaz; admin doğrulama talebi oluşturur.
- Safety kontrolü her gelen metinde komut işlemeden bağımsız çalışır.
- Açık handoff yalnızca serbest AI yanıtını durdurur; deterministik komut ve pratik yanıtları işlenir.
- Worker her harici gönderimden hemen önce aktif paket, opt-in, 24 saatlik pencere,
  onaylı şablon, mesaj tercihi, safety hold, plan sürümü ve son kullanım zamanını kontrol eder.
- Geçersiz veya süresi dolmuş mesajlar geç gönderilmez; `SUPPRESSED` olarak kaydedilir.
- Kayıt tamamlandığında ilk doğrulanmış kanal varsayılan olur; mesaj intent'i gönderim anında bu kimliğe çözümlenir.
- Farklı kanala otomatik fallback yapılmaz; kanal değişikliği doğrulanmış bağlama ve açık tercih gerektirir.

WhatsApp'ta işletme tarafından başlatılan ve 24 saatlik müşteri hizmetleri
penceresinin dışında kalan mesajlar için onaylı şablonlar gerekir. Planlanan
şablonlar:

- `practice_reminder`
- `practice_checkin`
- `practice_plan_updated`
- `weekly_meeting_reminder_24h`
- `weekly_meeting_reminder_1h`
- `weekly_meeting_link`
- `payment_received`
- `payment_action_required`
- `student_activated`
- `subscription_renewal_reminder`
- `weekly_summary_ready`

Son gelen öğrenci mesajının zamanı hesap/numara bazında tutulur. 24 saatlik
pencere dışındaki admin yanıtı dahil her işletme başlatımlı mesaj yalnızca
onaylı kategori/dil/sürümde bir şablonla gönderilir. Şablon gönderimi tek başına
serbest mesaj penceresini açmaz; pencere öğrenci yanıt verdiğinde başlar.

Telegram'da WhatsApp'a ait 24 saat/template kuralı uygulanmaz. Bunun yerine botun
öğrenci tarafından private chat'te başlatılmış olması, kanal opt-in'i, botun
engellenmemiş olması ve genel send-time kontrolleri aranır. Telegram Bot API'den
botun engellendiğini gösteren kalıcı hata geldiğinde kanal kimliği `BLOCKED`
olur, intent retry edilmez ve admin uyarılır.

## 13. Admin Portalı

İlk sürümde aşağıdaki ekranlar bulunur:

- Genel bakış ve yaklaşan işler
- Ödeme onayı bekleyen öğrenciler
- Düzeltme bekleyen ödemeler ve nedenleri
- Manuel iade ve ödeme düzeltme kaydı
- Aktif, duraklatılmış ve pasif öğrenciler
- Öğrenci detay ve mesaj zaman çizelgesi
- Tüm WhatsApp ve Telegram konuşmaları için aranabilir konuşma ekranı
- Öğrenci, kanal, harici kimlik, tarih, yön, mesaj türü ve teslim durumuna göre filtreleme
- Gelen/giden/agent/admin mesajlarını tek zaman çizelgesinde görüntüleme
- Açık destek talepleri ve panelden varsayılan kanala yanıt
- Yüksek öncelikli olası acil durum uyarıları
- Bekleyen pratik programı değişiklik talepleri
- Günlük/haftalık pratik geçmişi
- Öğrenci değerlendirmeleri
- Haftalık görüşme takvimi
- Görüşmeden 3 saat önce hazırlanan haftalık özet bildirimi
- Google Meet bağlantısı oluşturma veya görüşmeye ekleme
- Geçmiş ve aktif aylık paket dönemleri
- Üç gün içinde sona erecek ve yenileme bekleyen paketler
- Kalan görüşme hakkı ve tamamlanan görüşmeler
- Başlangıç tarihi seçerek yeni bir aylık paket dönemi tanımlama
- Görüşme öncesi özet
- Başarısız mesajlar ve yeniden deneme işlemi
- Program değiştirme ve hatırlatma durdurma
- Tekil veya tarih aralığı bazlı gelecek pratik iptali ve uygun iptali geri alma
- Destek talebini kapatma ve agent yanıtlarını devam ettirme
- Veri silme taleplerini doğrulama, onaylama veya reddetme
- LLM provider ve model registry ekranı
- Varsayılan ve görev bazlı LLM modeli seçimi
- Model etkinleştirme, devre dışı bırakma ve bağlantı testi
- 1/7/30 günlük LLM kullanım ve maliyet paneli
- Provider, model, görev, öğrenci ve başarı durumuna göre kullanım filtresi
- Günlük/aylık LLM bütçesi, uyarı eşikleri ve isteğe bağlı hard limit
- Bilgi bankası ve çoklu dosya yükleme/yeni sürüm oluşturma
- Dosya başına `GENERAL/WEEK_1-4/INTERMEDIATE/ADVANCED` aşama atama
- Parse/chunk/embedding durumu, metin önizleme, yayınlama/arşivleme ve yeniden indeksleme
- Öğrenci aşaması filtresiyle RAG test sorgusu ve kaynak/skor inceleme
- Öğrenci kanal kimlikleri, varsayılan kanal ve kanal bağlama/değiştirme işlemleri
- System event kataloğu ve event-variable schema görüntüleme
- Standart mesaj türü/varyantı oluşturma, yeni sürüm, preview, test, publish, archive ve rollback
- Kanal/dil/aşama/slot koşulları, öncelik ve WhatsApp Meta template approval/binding yönetimi
- Agent context read geçmişi: section/range, asOf, row count, latency ve cevap referansı
- Admin işlem geçmişi

Yeni paket dönemi tanımlama işlemi ödeme kaydından bağımsız yapılabilir ancak
işlemi yapan admin, başlangıç/bitiş tarihleri, dört görüşme hakkı ve gerekçe
audit log'a yazılmalıdır. Admin hesabı en az iki aşamalı doğrulama ile
korunmalıdır.

### Konuşma Ekranı

Admin tüm öğrenci konuşmalarını tek ekranda görebilir. Liste öğrenci/kanal,
tarih aralığı, mesaj yönü, gönderici türü (`STUDENT`, `AGENT`, `ADMIN`, `SYSTEM`),
mesaj türü ve teslim durumuna göre filtrelenebilir. Detay ekranında mesaj metni,
zamanı, ilgili pratik/görüşme/ödeme kaydı ve `SENT`, `DELIVERED`, `READ`, `FAILED`
durumu gösterilir. Admin aynı ekrandan destek yanıtı gönderebilir.

Konuşma görünümü `projects/whatsapp-agent` projesindeki kanal ve harici kullanıcı
bazlı zaman çizelgesi/filtreleme yaklaşımını referans alır ancak yeni NestJS/Next.js
uygulamasında bağımsız geliştirilir. Ham webhook payload'ı ekranda gösterilmez;
yalnızca normalize edilmiş mesaj verisi saklanır ve 12 aylık konuşma saklama
kuralı uygulanır.

### LLM Yönetimi ve Kullanımı

Admin panelinde provider ve model registry bulunur. API anahtarının kendisi
panelde saklanmaz veya gösterilmez; yalnızca deployment secret/env değişkeninin
adı ve ayarlanmış/eksik durumu gösterilir. Admin aktif modeller arasından genel
varsayılanı ve `REFLECTION_TAGGING`, `WEEKLY_SUMMARY`, `AGENT_REPLY` gibi görev
bazlı modelleri seçebilir. Model ayarı değişikliği yalnızca sonraki çağrılara
uygulanır ve audit log'a yazılır.

İlk üretim provider'ı Gemini API'dir; kesin model admin registry'sinden seçilir
ve kaynak kodda sabitlenmez. Üretimde yalnızca aktif Cloud Billing hesabına bağlı
Paid Services projesinin API anahtarı kullanılabilir. Free tier anahtarıyla
öğrenci metni işlenmez. Google AI Studio/Gemini loglarını Google ile model
iyileştirme amacıyla paylaşma veya dataset katkısı seçenekleri kapalı tutulur.
Canlı öncesinde proje billing durumu, Data Processing Addendum ve yurt dışı veri
aktarımı hukuki olarak doğrulanır.

Mevcut Gemini API anahtarının bağlı olduğu Google Cloud projesinde aktif billing
bulunduğu ürün sahibi tarafından doğrulanmıştır. Canlıya geçişte kullanılan
secret'ın aynı Paid Services projesine ait olduğu teknik olarak tekrar kontrol
edilir.

Gemini çağrıları veri minimizasyonu ve pseudonymization katmanından geçer.
Öğrencinin adı, telefon numarası, ödeme bilgileri, Meet bağlantısı ve doğrudan
veritabanı kimlikleri modele gönderilmez. Yalnızca görev için gerekli reflection
metni, ölçümler ve rastgele işlem kimliği kullanılır. Serbest metindeki belirgin
telefon, e-posta ve benzeri doğrudan tanımlayıcılar çağrı öncesinde maskelenir.
Maskeleme algoritması/sürümü ve maskelenen alan sayısı usage metadata'sında
tutulur; maskelenmemiş prompt ayrıca usage log'a kopyalanmaz.

Model çözümleme sırası görev özelindeki birincil model, global varsayılan model
ve görev için tanımlı fallback şeklindedir. `REFLECTION_TAGGING`,
`WEEKLY_SUMMARY` ve `AGENT_REPLY` birbirinden farklı model/fallback
kullanabilir. Model veya fallback değişikliği geçmiş AI kayıtlarını etkilemez.

Her LLM çağrısı için aşağıdaki kullanım bilgileri tutulur:

- İstenen provider/model ve varsa gerçekte kullanılan provider/model
- Kaynak görev ve operasyon
- Input, output ve toplam token
- Provider usage metadata'sı ve değişmez fiyat sürümünden hesaplanan tahmini maliyet
- Varsa cached, thinking, tool-use, modality tokenları ve service tier
- Provider request ID ve fiyatlandırma snapshot'ı
- Gecikme süresi
- Başarı/hata durumu ve güvenli hata kodu
- Fallback kullanımı
- İlgili öğrenci, konuşma, reflection veya weekly summary referansı
- Çağrı zamanı ve correlation ID

Kullanım ekranı 1, 7 ve 30 günlük toplam çağrı, input/output token, maliyet,
başarı oranı ve ortalama gecikmeyi gösterir. Provider, model, görev, öğrenci ve
başarı durumuna göre kırılım/filtre sunar. Prompt veya yanıt metni kullanım
logunda ikinci kez tutulmaz; ilgili güvenli alan kaydına referans verilir.

### LLM Hata Davranışı

1. Birincil modelin geçici hatası bir kez yeniden denenir.
2. İkinci hata sonrasında görev için seçilen fallback model çağrılır.
3. Fallback de başarısızsa temel öğrenci ve zamanlama akışı devam eder.
4. Reflection özgün haliyle saklanır, AI analizi `PENDING` durumda kalır.
5. Haftalık deterministik ölçümler hazırlanır, yalnızca AI taslağı beklemeye alınır.
6. Admin panelinde hata, kullanılan modeller ve manuel yeniden deneme işlemi gösterilir.
7. Her model denemesi ayrı LLM usage kaydı oluşturur.
8. Yeniden denemeler idempotent çalışır; çift etiket, özet veya öğrenci mesajı üretmez.

### LLM Bütçe Kontrolü

Admin günlük ve aylık USD bütçesi belirleyebilir. Kullanım ilgili dönemin
limitinin yüzde 80'ine ulaştığında uyarı, yüzde 100'üne ulaştığında kritik
bildirim oluşturulur. Admin isteğe bağlı hard limit'i etkinleştirebilir.

Hard limit aşıldığında yalnızca yeni AI görevleri duraklatılır; mesajlaşma,
ödeme, pratik, görüşme ve deterministik raporlama akışları çalışmaya devam eder.
Bekleyen AI işleri silinmez. Bütçe artırıldığında veya yeni dönem başladığında
admin onayıyla yeniden çalıştırılabilir.
Eşzamanlı worker'ların limiti birlikte aşmasını önlemek için her çağrıdan
önce beklenen azami kullanım atomik olarak rezerve edilir; çağrı sonrasında
rezervasyon provider usage metadata'sıyla kapatılır.

### Acil Durum Güvenlik Akışı

- Sistem terapi, teşhis, tıbbi tavsiye veya kriz müdahalesi iddiasında bulunmaz.
- Açık ve yakın tehlike ihtimali taşıyan mesajda agent serbest yanıt üretmez.
- Öğrenciye LLM yerine uzman onaylı sabit acil yönlendirme metni gönderilir.
- Türkiye'deki öğrenciye 112'yi araması veya en yakın acil servise başvurması söylenir.
- Admin panelinde yüksek öncelikli `SafetyAlert` oluşturulur ve admin anlık bilgilendirilir.
- Sistem kendiliğinden 112'yi, öğrencinin yakınını veya başka üçüncü kişiyi aramaz.
- Kayıtta mesajların sürekli/anlık takip edilmediği ve hizmetin acil destek olmadığı belirtilir.
- Risk işareti teşhis değildir; yanlış pozitif ve yanlış negatif olabileceği kabul edilir.
- Risk tespit kuralları ve sabit mesaj metni canlı öncesinde uzman tarafından doğrulanır.
- `SafetyAlert` açıldığında öğrencinin planlı otomatik mesajları durdurulur.
- Admin hem e-posta hem ayrı admin WhatsApp numarasıyla anlık bilgilendirilir.
- İlk e-posta sağlayıcısı AWS SES'in Frankfurt (`eu-central-1`) bölgesidir.
- E-posta hassas öğrenci içeriği taşımaz; olay özeti ve güvenli admin panel bağlantısı içerir.
- Bildirim hedefleri kaynak kodda değil deployment secret/ayarlarında tutulur.
- Alert yalnızca admin panelinden kapatılabilir ve işlem audit log'a yazılır.
- Alert kapatıldığında yalnızca gelecekteki işler oluşturulur; geçmiş mesajlar gönderilmez.

## 14. Gizlilik ve Güvenlik

- Yalnızca ürün amacı için gerekli veriler toplanır.
- Ruhsal veya fiziksel sağlıkla ilişkili olabilecek metinler hassas kabul edilir.
- Aydınlatma metni kişisel veri işlenmeye başlamadan önce öğrenciye iletilir.
- Aydınlatmanın sürümü, iletim kanalı ve zamanı kanıtlanabilir biçimde kaydedilir.
- Aydınlatma yapılması için öğrenciden onay veya rıza talep edilmez.
- Ödeme paket/sözleşme aktivasyonudur; sistem bunu genel bir açık rıza olarak kaydetmez.
- Her veri kategorisi için hukuki işleme şartı veri envanterinde ayrı tanımlanır.
- Serbest pratik/duygu notlarının kaydı için aydınlatmadan ayrı açık rıza istenir.
- Serbest notların AI ile analizi için ikinci ve ayrı açık rıza istenir.
- Rıza verilmemesi üyelik ve temel pratik takibini engellemez.
- Rıza kapsamı, metin sürümü, yanıt, zaman, kanal ve harici mesaj kimliği saklanır.
- `RIZA İPTAL` akışında kapsam seçilir; ilgili yeni kayıt/AI/agent işlemleri ve bekleyen işler durdurulur.
- Öğrenci rızasını geri çekebilir; geri çekme sonrasındaki ilgili işlemler durdurulur.
- Rıza metinleri ve yurt dışı aktarım süreci uzman tarafından doğrulanmadan özellik canlıya açılmaz.
- Gemini API üretimde Cloud Billing bağlı Paid Services projesiyle kullanılır.
- Gemini free tier'a öğrenciye ait kişisel veya hassas metin gönderilmez.
- Google ile log/dataset paylaşımı ve model iyileştirme katkısı etkinleştirilmez.
- LLM payload'ına ad, telefon, ödeme, Meet bağlantısı veya doğrudan DB kimliği eklenmez.
- Serbest metindeki belirgin doğrudan tanımlayıcılar çağrı öncesinde maskelenir.
- Pseudonymization işleminin sürümü usage metadata'sında izlenir.
- Dekont ve hassas öğrenci verileri uygulama loglarına yazılmaz.
- Onaylanan ödemelerin dekont dosyaları 30 gün sonra otomatik silinir.
- Dekont silinse de gerekli ödeme metadatası ve admin onay kaydı korunur.
- Dosyalar herkese açık bağlantılarla sunulmaz.
- Obje deposu private olur; admin dosya erişimi kısa ömürlü imzalı URL kullanır.
- Dekont ve veritabanı yedekleri ayrı erişim alanı/kimlik bilgileriyle korunur.
- Veriler aktarım sırasında ve saklanırken şifrelenir.
- Silme, dışa aktarma ve mesajları durdurma süreçleri tanımlanır.
- Kanal konuşma içerikleri son paket bitişinden 12 ay sonra silinir.
- Pratik notları, AI etiketleri ve haftalık özetler son paket bitişinden 12 ay sonra silinir.
- Öğrenci, yasal olarak saklanması zorunlu olmayan veriler için daha erken silme talep edebilir.
- Ödeme, açık rıza ve audit kayıtları hukuken gereken süre boyunca ayrı tutulur.
- Hassas verilerin silinmesi aktif veritabanı, dosya deposu, arama/vektör indeksi ve yedek yaşam döngüsünü kapsar.
- Üretim erişimleri en az yetki prensibiyle sınırlandırılır.
- Yedekler şifreli tutulur ve geri yükleme düzenli test edilir.
- Günlük yedekler 30 gün saklanır; hedef RPO 24 saat ve RTO 4 saattir.
- Ayda bir yedek gerçek test ortamına geri yüklenerek bütünlük doğrulanır.
- Tamamlanmış silmelerin hash'lenmiş manifesti veritabanından ayrı, append-only bir günlükte tutulur.
- Geri yüklemede dış silme günlüğü uygulanmadan API ve worker trafiğe açılmaz.
- Yayına çıkmadan önce KVKK açısından uzman değerlendirmesi alınır.

### Saklama Özeti

| Veri | Saklama Kuralı |
| --- | --- |
| WhatsApp/Telegram konuşma içeriği | Son paket bitişinden 12 ay sonra sil |
| Pratik notları | Son paket bitişinden 12 ay sonra sil |
| AI etiketleri ve haftalık özet | Son paket bitişinden 12 ay sonra sil |
| Dekont dosyası | Ödeme onayından 30 gün sonra sil |
| Ödeme metadatası | Hukuken gereken süre |
| Açık rıza ve aydınlatma kanıtı | Hukuken gereken süre |
| Audit kayıtları | Hukuken/operasyonel olarak gereken süre |

### Öğrenci Silme Talebi

1. Öğrenci kayıtlı ve doğrulanmış kanalından `VERİLERİMİ SİL` yazar.
2. Sistem `REQUESTED` durumunda silme talebi oluşturur ve admini bilgilendirir.
3. Admin öğrenci kimliğini ve talebin kapsamını doğrular.
4. Admin talebi onaylar veya gerekçeyle reddeder.
5. Onayda talep `RUNNING` olur; öğrencinin otomatik mesajları ve zamanlanmış işleri durdurulur.
6. Rıza ve kanal opt-in kayıtları geri çekilmiş olarak işaretlenir.
7. Yasal zorunluluğu olmayan öğrenci içerikleri silinir.
8. Finansal ve hukuken saklanması gereken kayıtlar erişimi sınırlı biçimde ayrıştırılır.
9. Silinen, ayrıştırılan ve harici servislerde işlenen kalemler deletion manifest'e yazılır.
10. Hata olursa talep `FAILED` olur ve kontrollü yeniden deneme bekler.
11. İşlem tamamlandığında talep `COMPLETED` olur, dış deletion journal'a eklenir ve öğrenci bilgilendirilir.

Silme talebi doğrudan ve geri alınamaz işlem başlatmaz; yanlışlık veya hesap
erişimi kötüye kullanımı riskine karşı admin doğrulaması zorunludur.
Admin tarafından onaylanan talep aktif veritabanı, dosya deposu ve indekslerde
en fazla 7 gün içinde tamamlanır. Şifreli yedeklerde kalan kopyalar en fazla 30
günlük yedek yaşam döngüsü sonunda ortadan kalkar. Yedekten geri dönüş yapılırsa
tamamlanmış silme kayıtları yeniden uygulanarak silinen içeriğin geri gelmesi
engellenir.

## 15. E2E Ürün Kabul Planı

E2E testleri yalnız ekranların açılmasını değil, öğrencinin kanala mesaj
göndermesinden provider teslimat kaydı oluşmasına kadar bütün iş sonucunu doğrular.
Test ortamında gerçek öğrenci verisi kullanılmaz; her senaryo kendine ait öğrenci,
kanal kimliği, paket ve zaman çizelgesi oluşturur.

### Kritik Öğrenci Yolculukları

| Kimlik | Yolculuk | Beklenen ürün sonucu |
|---|---|---|
| `E2E-REG-01` | Telegram `KAYIT` -> KVKK -> kanal izni -> AI tercihi -> ad-soyad | Şifreli öğrenci kaydı, izin ledger'ı, tek varsayılan kanal ve her inbound için tek cevap |
| `E2E-REG-02` | AI iznine `HAYIR` denilen kayıt | Kayıt ve ödeme devam eder; kişisel AI işleri oluşmaz |
| `E2E-REG-03` | Duplicate webhook ve tekrar `KAYIT` | İkinci öğrenci, izin veya mesaj intent'i oluşmaz |
| `E2E-ROUTE-01` | Kaydı tamamlanmış öğrenci "İlk görüşmem ne zaman?" sorar | Kayıt mesajı değil, öğrenciye bağlı görüşme cevabı veya veri-yok cevabı gönderilir |
| `E2E-PAY-01` | `ÖDEME YAPTIM` -> admin onayı | 4.000 TL ödeme onaylanır, bir aylık aktif paket ve dört görüşme kredisi atomik oluşur |
| `E2E-PRAC-01` | Admin sabah/akşam planı tanımlar | Seanslar oluşur ve öğrenci program saatleri/süreleriyle bilgilendirilir |
| `E2E-PRAC-02` | Reminder -> check-in -> geri bildirim | Tek reminder/check-in gönderilir, cevap reflection olarak saklanır |
| `E2E-PRAC-03` | Cevapsız pratik ve yerel gün sonu | Pratik `MISSED` olur; gecikmiş veya çift mesaj oluşmaz |
| `E2E-MEET-01` | Admin ilk görüşmeyi planlar | Dört görüşme, Meet durumu ve 24 saat/1 saat mesajları doğru kanalda oluşur |
| `E2E-AGENT-01` | Kişisel program sorusu | Yalnız soruyu soran öğrencinin DB bağlamı kullanılır ve kayıt router'ına düşmez |
| `E2E-RAG-01` | Bilgi bankasında bulunan/bulunmayan iki soru | Kaynaklı tek cevap veya `KNOWLEDGE_NOT_FOUND` handoff oluşur |
| `E2E-HANDOFF-01` | Admin konuşmayı devralır ve yanıtlar | Agent cevabı bastırılır, admin yanıtı default kanaldan tek kez gider |
| `E2E-CONSENT-01` | `RIZA İPTAL` | Bekleyen kişisel AI işleri bastırılır; deterministik hesap/program sorguları çalışır |
| `E2E-DELETE-01` | Silme talebi -> admin onayı | Aktif veri silinir, deletion journal yazılır ve öğrenci sonucu alır |

### Admin Portal Kabul Akışları

- Login, TOTP/step-up, session expiry ve yeniden giriş
- Öğrenci, ödeme, pratik, görüşme ve konuşma detayına doğrudan geçiş
- Ödeme onayında çift tıklama/eşzamanlı istek altında tek paket oluşturma
- Pratik planı oluşturma, tek seansa düşürme, özel süre, pause/resume ve yeni revizyon
- Görüşme planlama/değiştirme ve Meet linki hazır değilken güvenli hata durumu
- Standart mesaj preview/publish/rollback ve protected mesaj step-up kontrolü
- Bilgi bankası upload/index/test/publish ve başarısız dosyada anlaşılır hata durumu
- Desktop ve mobile görünümde loading, empty, error, toast ve modal davranışları

### Kabul Eşikleri

- Bir inbound mesaj en fazla bir response owner ve bir öğrenci cevabı üretir.
- Kayıt ve ödeme happy-path testlerinin tamamı release-blocking'dir.
- Test provider ile kayıt adımı yanıtı 15 saniye içinde `SENT` olmalıdır; staging
  canary'de provider gecikmesi ayrıca raporlanır.
- Reminder/check-in/görüşme testleri gerçek süre beklemez; paylaşılan fake clock ile
  ilerletilir.
- Retry, duplicate ve worker restart sonrasında öğrenciye çift mesaj gönderilmez.
- Başka öğrenciye ait veri hiçbir agent cevabında veya admin yetkisiz rolünde görünmez.
- Kritik Playwright testleri Chromium desktop ve mobile viewport'ta geçmeden pilot
  release açılamaz.

### Uygulama Sırası

1. **P0 smoke:** `REG-01/02/03`, `ROUTE-01`, `PAY-01`, `PRAC-01` ve admin login.
2. **P1 lifecycle:** pratik time-travel, görüşme, üyelik yenileme ve kanal değiştirme.
3. **P1 agent:** kişisel context, RAG, handoff, AI rıza ve budget fallback.
4. **P2 resilience:** provider timeout, duplicate storm, rolling worker ve restore replay.
5. **Pilot canary:** allowlist'li gerçek Telegram/WhatsApp, Google ve Gemini sözleşmeleri.

## 16. Teslim Aşamaları

### Aşama 1 - Temel Backend

- Proje iskeleti
- Veritabanı şeması
- Öğrenci durum makinesi
- Admin kimlik doğrulama
- Audit log altyapısı

### Aşama 2 - Kanallar ve Kayıt

- Cloud API webhook'u
- Gelen/giden mesaj kaydı
- Kayıt akışı
- IBAN ve referans kodu
- Ödeme inceleme ve aktivasyon

### Aşama 3 - Pratik Takibi

- Program oluşturma
- Kalıcı zamanlanmış görevler
- Hatırlatma ve değerlendirme mesajları
- Pratik sonuçlarının kaydı

### Aşama 4 - Görüşme ve Özet

- Haftalık görüşme takvimi
- Deterministik istatistikler
- Yapay zeka etiketleri ve özet taslağı
- Admin bildirimleri

### Aşama 5 - Üretim Hazırlığı

- KVKK ve güvenlik kontrolü
- Şablon mesaj onayları
- İzleme, alarmlar ve yedekleme
- Playwright/channel-driver E2E harness ve P0 smoke paketi
- Lifecycle/agent/resilience E2E paketleri ve staging provider canary
- Yük ve hata senaryosu testleri
- Pilot öğrenci grubu

## 17. Başarı Ölçütleri

- Kayıt akışını tamamlayan öğrenci oranı
- Ödeme bildiriminin admin tarafından sonuçlandırılma süresi
- Zamanında gönderilen hatırlatma oranı
- Hatırlatma sonrası cevap oranı
- Haftalık tamamlanan pratik oranı
- Başarısız veya yinelenen mesaj oranı
- Adminin görüşme hazırlığı için harcadığı süre
- Öğrencilerin otomatik mesajları durdurma oranı

## 18. Dış Kaynaklar

- [Meta WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [KVKK sıkça sorulan sorular](https://www.kvkk.gov.tr/Icerik/4196/Kisisel-Verilerin-Korunmasi-Kanunu-Hakkinda-Sikca-Sorulan-Sorular)
- [Özel Nitelikli Kişisel Verilerin İşlenmesine İlişkin Rehber](https://www.kvkk.gov.tr/Icerik/8183/Ozel-Nitelikli-Kisisel-Verilerin-Islenmesine-Iliskin-Rehber)

## 19. Açık Konular

Henüz kararlaştırılmamış ürün ve teknik konular
[Açık kararlar](OPEN_DECISIONS.md) belgesinde tutulur. Alınan her karar tarih,
gerekçe ve etkilediği alanlarla birlikte bu taslağa işlenir.
