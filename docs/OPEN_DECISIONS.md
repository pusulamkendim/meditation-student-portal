# Açık Kararlar

| Alan | Değer |
| --- | --- |
| Belge durumu | Aktif |
| Son güncelleme | 10 Temmuz 2026 |

Bu belge, geliştirmeye başlamadan önce netleştirilmesi gereken kararları önem
sırasıyla takip eder. Her karar verildiğinde sonuç, gerekçe ve tarih aynı kayda
eklenmelidir.

## P0 - Geliştirmeyi Bloke Eden Kararlar

### D-001: Ücret ve Paket Modeli

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Ürün aylık paket olarak sunulacak.
- Aylık paket ücreti 4.000 TL olacak.
- Paket haftalık düzende toplam dört online birebir görüşme içerecek.
- Beş haftalı takvim dönemlerinde beşinci görüşme pakete otomatik dahil olmayacak.
- Görüşmeler Google Meet üzerinden yapılacak.
- Haftalık görüşme saatini admin belirleyecek.
- Günlük pratik takibi ve hatırlatmalar pakete dahil olacak.
- Admin gerektiğinde öğrenci için yeni bir aylık paket dönemi tanımlayabilecek.
- Yeni paket dört yeni görüşme hakkı oluşturacak; eski paketin tarihleri değiştirilmeyecek.
- Her paket dönemi kendi tarih ve kullanım geçmişiyle ayrı saklanacak.
- Aktif paket varsa yeni paket mevcut paketin bitişinden sonraki gün başlayacak.
- Aktif paket yoksa yeni paketin başlangıç tarihini admin seçecek.
- İlk paket ödeme onayı sırasında adminin seçtiği başlangıç tarihiyle oluşturulacak.
- Paket takvim ayına değil, seçilen başlangıç tarihine bağlı bir takvim ayı sürecek.
- Başlangıç tarihi dahil, bir sonraki ayın aynı günü hariç tutulacak.
- Örneğin 10 Temmuz başlangıçlı paket 9 Ağustos gün sonuna kadar geçerli olacak.
- Hedef ayda aynı gün yoksa hariç bitiş tarihi hedef ayın son gününe sınırlanacak.
- Paket tarihleri öğrencinin IANA saat dilimindeki yerel tarihler olarak hesaplanacak.
- Aynı öğrenciye ait paket dönemlerinin tarihleri çakışamayacak.
- Paket bittiğinde sırada yeni paket yoksa üyelik `INACTIVE` olacak.
- Paket bittiğinde pratik, değerlendirme ve görüşme mesajları durdurulacak.
- Öğrenci profili ve izin verilen geçmiş veriler korunacak.
- Yeni paket başladığında üyelik ve yeni dönemin zamanlanmış işleri tekrar aktifleştirilecek.
- Paket bitmeden üç gün önce öğrenciye yenileme hatırlatması gönderilecek.
- Hatırlatma 4.000 TL ücret, IBAN ve yenilemeye özel ödeme referansı içerecek.
- Aynı anda admin panelinde yenileme bildirimi oluşturulacak.
- Hatırlatma yeni paket oluşturmayacak; paket yalnızca ödeme bildirimi admin tarafından onaylanınca oluşturulacak.
- İade, eksik ve fazla ödeme banka üzerinden admin tarafından manuel yönetilecek.
- Sistem banka transferi veya otomatik iade başlatmayacak.
- Admin portalda işlem türü, tutar, açıklama ve tarihi kaydedecek.
- Orijinal ödeme değiştirilmeyecek; düzeltme ayrı finansal kayıt olarak tutulacak.
- Tam iade edilen ödeme `REFUNDED` durumuna alınacak.
- Finansal iade paketi kendiliğinden iptal etmeyecek; paket iptali ayrı gerekçeli admin işlemi olacak.

### D-002: Ödeme Doğrulama Süreci

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Dekont zorunlu olmayacak.
- Öğrencinin `ÖDEME YAPTIM` mesajı admin inceleme kaydı oluşturacak.
- Öğrenci isterse ödeme bildirimine dekont ekleyebilecek.
- Admin ödemeyi banka hesabından kontrol edecek.
- Öğrenci ancak admin onayından sonra aktifleştirilecek veya yeni paketi oluşturulacak.
- Agent ve yapay zeka ödeme onayı veremeyecek.
- Onaylanan ödemeye ait dekont dosyası 30 gün sonra otomatik silinecek.
- Tutar, referans, onay tarihi ve admin işlem kaydı saklama politikasına göre korunacak.
- Otomatik dosya silme işlemi audit log'a yazılacak.
- Admin ödemeyi doğrulayamazsa `ACTION_REQUIRED` durumuna alacak.
- Admin `Ödeme bulunamadı`, `Tutar eksik/hatalı`, `Referans eşleşmedi` veya `Diğer` nedenini seçecek.
- Öğrenciye seçilen nedene uygun düzeltme mesajı gönderilecek.
- `ACTION_REQUIRED` durumunda paket oluşturulmayacak veya aktifleştirilmeyecek.
- Öğrenci yeni bilgi ya da dekont gönderdiğinde ödeme tekrar `REVIEW` durumuna dönecek.

### D-003: Veri İşleme ve Saklama Politikası

**Karar:** Ürün tercihi kaydedildi, hukuki değerlendirme bekliyor - 10 Temmuz 2026.

Kabul edilen ürün tercihleri:

- KVKK aydınlatma metni kişisel veri işlenmeden önce öğrenciye gönderilecek.
- Aydınlatma metninin sürümü ve iletim zamanı kaydedilecek.
- Aydınlatmanın kendisi için öğrenciden onay/rıza istenmeyecek.
- Planlı hizmet mesajları için kanal bazlı opt-in kapsamı, kaynağı ve zamanı ayrı tutulacak.
- Aydınlatmadan sonra serbest pratik/duygu notlarının kaydı için ayrı açık rıza istenecek.
- Serbest notların AI ile analizi için ikinci ve ayrı açık rıza istenecek.
- AI destekli serbest agent yanıtı için ayrı `AGENT_REPLY_AI` tercihi/rızası istenecek.
- Rızalar `REFLECTION_STORAGE`, `REFLECTION_AI` ve `AGENT_REPLY_AI` kapsamlarıyla ayrı tutulacak.
- Rıza yanıtı kapsam, metin sürümü, kanal, zaman ve harici mesaj kimliğiyle kaydedilecek.
- Rıza vermeyen öğrenci kayıt ve ödeme akışına devam edebilecek.
- Serbest not rızası yoksa yalnızca temel `Yaptım/Yapamadım` durumu tutulacak.
- AI rızası yoksa metinler AI sağlayıcısına gönderilmeyecek ve otomatik analiz yapılmayacak.
- Öğrenci rızasını geri çekebilecek; gelecekteki ilgili işlemler durdurulacak.
- `RIZA İPTAL` ilgili kapsamdaki kuyruk işlerini gönderim/çağrı anında da geçersiz kılacak.
- Öğrencinin ödemesi paket/sözleşme aktivasyonu olarak kaydedilecek.
- Ödeme teknik veya hukuki kayıtlarda genel bir `otomatik açık rıza` olarak işaretlenmeyecek.
- WhatsApp/Telegram konuşma içerikleri son paket bitişinden 12 ay sonra otomatik silinecek.
- Pratik notları, AI etiketleri ve haftalık özetler aynı 12 aylık kurala tabi olacak.
- Öğrenci yasal olarak saklanması zorunlu olmayan veriler için daha erken silme talep edebilecek.
- Ödeme, açık rıza ve audit kayıtları hukuken gereken süre boyunca ayrı saklanacak.
- Silme işlemi aktif veritabanı, dosya deposu, indeksler ve yedek yaşam döngüsünü kapsayacak.
- Öğrenci `VERİLERİMİ SİL` yazarak silme talebi oluşturabilecek.
- WhatsApp komutu verileri doğrudan silmeyecek; admin doğrulaması gerekecek.
- Onay sonrası otomatik mesajlar ve zamanlanmış işler durdurulacak.
- Rızalar geri çekilmiş olarak işaretlenecek.
- Yasal zorunluluğu olmayan veriler silinecek; zorunlu kayıtlar ayrıştırılacak.
- Tamamlanan işlem öğrenciye bildirilecek ve audit log'a yazılacak.
- Admin onayından sonra aktif sistemlerde silme en fazla 7 gün içinde tamamlanacak.
- Şifreli yedeklerde kalan kopyalar en fazla 30 günlük döngü sonunda silinecek.
- Tamamlanmış silmeler veritabanından ayrı append-only deletion journal'da tutulacak.
- Yedekten geri dönüşte bu günlük uygulanmadan API ve worker açılmayacak.

Hukuken doğrulanacak konular:

- Ad, telefon, ödeme, program ve pratik durumunun işleme şartları nelerdir?
- Açık rıza metinlerinin kesin kapsamı ve ifadesi nasıl olmalı?
- Yurt dışındaki bir AI sağlayıcısına veri aktarım şartları nelerdir?
- Finansal, açık rıza ve audit kayıtları için kesin yasal saklama süreleri nedir?
- Öğrenci verilerini sildiğinde finansal kayıtlar nasıl ayrıştırılacak?

**Canlıya geçiş kuralı:** Veri envanteri ve hukuki işleme şartları uzman
tarafından doğrulanmadan gerçek öğrenci verisiyle pilot yapılmamalı. Rıza
metinleri ve AI aktarım süreci doğrulanmadan ilgili özellikler kapalı tutulmalı.

### D-004: WhatsApp Numara ve Hesap Yapısı

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Cloud API'ye bağlı mevcut işletme numarası `+905428078429`.
- Bu numara için Meta WhatsApp Cloud API uygulaması ve telefon numarası kimliği mevcut.
- Access token ve webhook doğrulama tokenı mevcut.
- Mevcut callback `https://agentapi.pusulamkendim.com/webhook` adresinde çalışıyor.
- Mevcut entegrasyon `projects/whatsapp-agent` FastAPI servisi tarafından yürütülüyor.
- Token değerleri proje belgelerine veya Git'e kopyalanmayacak.
- Mevcut diğer agentlar yalnızca test amaçlı ve aktif kullanımda değil.
- Portal için TypeScript ve NestJS tabanlı ayrı bir backend servisi kurulacak.
- Yeni servis mevcut FastAPI agent servisine çalışma zamanında bağımlı olmayacak.
- WhatsApp üretim webhook'u yeni NestJS servisine taşınacak.
- Eski FastAPI servisinin bu numaradaki WhatsApp test akışı geçişten sonra devre dışı kalacak.
- Alternatif WhatsApp Business numarası olarak `+66634937176` mevcut.
- Backend numara veya Meta telefon numarası kimliğini kaynak kodda sabitlemeyecek.
- MVP aynı anda yalnızca bir üretim WhatsApp numarası kullanacak.
- Üretimde `+905428078429` kullanılacak.
- `+66634937176` geliştirme/test veya yedek numara olarak kullanılacak.
- Test ortamı yalnızca izin listesindeki test numaralarına mesaj gönderecek.
- Test ortamında gerçek öğrenci verisi kullanılmayacak.
- Staging ayrı Meta/Google/Gemini kimlikleri ve zorunlu E.164 allowlist kullanacak.
- Yeni backend mevcut Coolify sunucusunda bağımsız uygulama olarak yayınlanacak.
- API alan adı `meditation-api.pusulamkendim.com` olacak.
- Meta callback `https://meditation-api.pusulamkendim.com/webhooks/whatsapp` olacak.
- Öğrenci `DESTEK` yazarak insan desteği isteyebilecek.
- Destek talebi admin panelinde görev ve bildirim oluşturacak.
- Agentın serbest yanıtları öğrenci bazında durdurulacak.
- Admin portal içinden öğrencinin varsayılan kanalına yanıt verecek.
- Planlı pratik mesajları admin ayrıca durdurmadıkça devam edecek.
- Admin destek kaydını kapattığında agentın normal akışı devam edecek.
- 24 saatlik pencere dışında admin yanıtı dahil yalnızca onaylı template gönderilecek.
- Webhook HMAC doğrulaması için Meta App Secret ayrı deployment secret olacak.

Canlıya geçiş ön koşulları:

- Mevcut token uzun ömürlü üretim tokenı mı ve yenileme/rotasyon süreci nedir?
- Hatırlatma ve görüşme mesajı şablonları Meta tarafında oluşturuldu mu?

### D-005: Haftalık Görüşmenin Planlanması

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Görüşme online ve Google Meet üzerinden yapılacak.
- Haftalık görüşme saatini admin panelinden eğitmen belirleyecek.
- Sistem görüşmeden önce Meet bağlantısını öğrenciye gönderecek.
- Admin ilk görüşmenin gün ve saatini seçecek.
- Sistem diğer üç görüşmeyi 7, 14 ve 21 gün sonrasına otomatik planlayacak.
- Admin her görüşmeyi ayrı ayrı değiştirebilecek.
- Tek görüşme değişikliği diğer görüşmeleri otomatik kaydırmayacak.
- Tüm seriyi değiştirme ayrı bir admin işlemi olacak.
- Her paket için tek bir Google Calendar görüşme serisi oluşturulacak.
- Dört görüşme aynı Google Meet bağlantısını kullanacak.
- Meet bağlantısı her görüşmeden önce öğrenciye tekrar gönderilecek.
- Yeni paket yeni Calendar serisi ve yeni Meet bağlantısı oluşturacak.
- Tekil görüşme değişikliği ilgili Calendar occurrence kaydıyla eşitlenecek.
- Her occurrence için Google instance ID, original start, etag ve sync durumu tutulacak.
- Dış Calendar değişiklikleri incremental sync ve periyodik reconciliation ile uyarıya dönüşecek.
- Meet oluşturma `PENDING/READY/FAILED` olarak izlenecek; link hazır değilse linkli reminder gönderilmeyecek.
- Öğrenciye görüşmeden 24 saat ve 1 saat önce hatırlatma gönderilecek.
- Her iki hatırlatma Google Meet bağlantısını içerecek.
- Görüşme değişirse eski hatırlatmalar iptal edilip yeni saate göre oluşturulacak.
- Görüşme yalnızca yetkili admin tarafından admin portalından değiştirilebilecek.
- Öğrenci veya agent görüşme kaydını doğrudan değiştiremeyecek.
- Öğrenci değişiklik isteğini `DESTEK` üzerinden iletebilecek.
- Portal dışındaki Google Calendar değişiklikleri sistem kaydını doğrudan değiştirmeyecek.
- Her görüşme değişikliği audit log'a yazılacak.
- Haftalık özet görüşmeden 3 saat önce oluşturulacak.
- Özet yalnızca güvenli admin portalında gösterilecek.
- Özet veri aralığı önceki görüşmeden mevcut görüşmeye kadar olacak.
- İlk görüşmede paket başlangıcı veri aralığının başlangıcı olacak.
- AI rızası varsa duygu, zorluk ve konu taslağı üretilecek.
- AI rızası yoksa yalnızca deterministik ölçümler ve izin verilen ham kayıtlar gösterilecek.
- `COMPLETED` ve `NO_SHOW` append-only credit event ile bir görüşme hakkı tüketecek.
- `CANCELLED` ve yeniden planlama görüşme hakkı tüketmeyecek.
- `RESCHEDULED` terminal durum değil schedule history event'i olacak; görüşme `SCHEDULED` kalacak.
- Görüşme durumunu yalnızca admin değiştirecek.
- Durum düzeltmelerinde hak yeniden hesaplanacak ve audit log'a yazılacak.

Canlıya geçiş ön koşulu:

- Google Calendar/Meet erişimi için üretim OAuth yapılandırması tamamlanmalı.
- OAuth projesi `Production` durumunda olmalı; revoke/reconnect akışı test edilmeli.

## P1 - İlk Sürüm Davranış Kararları

### D-006: Pratik Programının Esnekliği

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Günlük program yalnızca sabah ve akşam pratiklerinden oluşacak.
- Öğlen pratiği olmayacak.
- Her iki pratik de 1. hafta 15 dakika olacak.
- Her iki pratik de 2. hafta 20 dakika olacak.
- Her iki pratik de 3. hafta 25 dakika olacak.
- Her iki pratik de 4. hafta 30 dakika olacak.
- Paket 28 günden uzunsa kalan günlerde 30 dakika devam edecek.
- Öğrenci sabah ve akşam başlangıç saatlerini ayrı ayrı seçecek.
- Değerlendirme zamanı haftanın güncel süresine göre hesaplanacak.
- 15/20/25/30 dakika ilerlemesi yalnızca öğrencinin ilk paketinde uygulanacak.
- İkinci ve sonraki paketlerde sabah ve akşam 30 dakika devam edecek.
- Üyelik dönemleri arasındaki boşluk süreyi otomatik olarak 15 dakikaya sıfırlamayacak.
- Admin öğrenciye özel süre planı tanımlayabilecek.
- Özel süre planı değişiklikleri sürümlenecek ve audit log'a yazılacak.
- Varsayılan sabah/akşam programı hafta sonu dahil her gün uygulanacak.
- Admin öğrenciye özel belirli günleri kapatabilecek.
- Admin her zaman özel süre planı uygulayabilecek.
- Admin programı günde iki pratikten tek pratiğe düşürebilecek.
- Plan değişikliği geçmiş ve tamamlanmış seansları değiştirmeyecek.
- Yeni plan seçilen yürürlük zamanından sonraki başlamamış seanslara uygulanacak.
- Eski zamanlanmış işler iptal edilip yeni plana göre oluşturulacak.
- Öğrenci ilk programda başlangıç saatlerini varsayılan kanalından seçecek.
- Öğrenci sonradan `PROGRAM DEĞİŞTİR` ile değişiklik talebi oluşturabilecek.
- Agent mevcut programı doğrudan değiştiremeyecek.
- Plan yalnızca admin portalından admin tarafından değiştirilebilecek.
- Yeni plan varsayılan olarak bir sonraki başlamamış pratikte yürürlüğe girecek.
- Admin isterse ileri bir yürürlük tarihi/saatini seçebilecek.
- Öğrenciye aktif gün, pratik sayısı, saat ve süreleri içeren WhatsApp özeti gönderilecek.


### D-007: Erteleme ve Kaçırılan Pratik

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Pratik için erteleme özelliği olmayacak.
- Öğrenci veya agent planlanan pratik saatini değiştiremeyecek.
- `Yaptım` yanıtı seansı `COMPLETED` yapacak.
- `Bugün yapamadım` yanıtı seansı `SKIPPED` yapacak.
- Geri dönüş yapılmayan pratik `MISSED` olacak.
- Yanıt önce button/reply context ile ilgili seansa bağlanacak; birden fazla adayda seçim istenecek.
- Plan/paket değişikliği `CANCELLED`, pause/safety/politika engeli `SUPPRESSED` olacak.
- `CANCELLED` ve `SUPPRESSED` seanslar `MISSED` veya devam oranı paydası sayılmayacak.
- Yanıtsız pratik için ek baskı/hatırlatma mesajı gönderilmeyecek.
- Değerlendirme mesajının gönderildiği yerel günün sonuna kadar yanıt beklenecek.
- Gün sonundan sonra gelen yanıt seans durumunu otomatik değiştirmeyecek.
- Admin seans durumunu düzeltebilecek ve değişiklik audit log'a yazılacak.
- Admin gerekçeyle tek bir başlamamış pratiği veya tarih/slot aralığındaki gelecek pratikleri iptal edebilecek.
- İptal edilen pratik `CANCELLED` olacak, mesaj intent'leri geçersiz kılınacak ve `MISSED` sayılmayacak.
- Admin iptali yalnızca başlangıç geçmemiş, paket aktif ve plan sürümü güncelse geri alabilecek.
- Restore eski intent'i kullanmayacak; yeni idempotent reminder/check-in intent'leri oluşturacak.
- İptal/geri alma kapsamı, gerekçesi ve eski/yeni durum audit log'a yazılacak.

### D-008: Değerlendirme Soruları

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Öğrencinin `Yaptım` yanıtı pratiği tamamlamak için yeterli olacak.
- Serbest not rızası varsa birkaç cümlelik deneyim paylaşımı istenecek.
- Serbest değerlendirme isteğe bağlı olacak.
- Değerlendirmeye yanıt vermemek `COMPLETED` durumunu değiştirmeyecek.
- Yanıtsız değerlendirme için ek hatırlatma gönderilmeyecek.
- MVP yalnızca yazılı değerlendirme kabul edecek.
- Sesli mesajlar işlenmeyecek, indirilmeyecek veya saklanmayacak.


### D-009: Hatırlatma Mesajlarının Tonu ve Sıklığı

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Mesajlar kısa, sakin, nötr ve yargılamayan bir dil kullanacak.
- Otomatik sistem tarafından gönderildiği gizlenmeyecek.
- Eğitmenin kişisel olarak yazdığı mesaj taklit edilmeyecek.
- Yanıtsızlık suçlayıcı değil, nötr ifadelerle anlatılacak.
- MVP'de öğrenciye mesaj tonu seçimi sunulmayacak.
- `PRATİĞİ DURDUR` pratik hatırlatma ve değerlendirmelerini durduracak.
- `TÜMÜNÜ DURDUR` tüm proaktif otomatik kanal mesajlarını durduracak.
- `MESAJ İZNİ İPTAL` varsayılan kanal opt-in kaydını geri çekecek ve yeni proaktif mesajları engelleyecek.
- Öğrenci durdurma sonrasında mesaj yazmaya ve admin yanıtı almaya devam edebilecek.
- `DEVAM`, aktif paket varsa gelecekteki mesajları yeniden başlatacak.
- Geçmişte gönderilmemiş mesajlar `DEVAM` sonrasında topluca gönderilmeyecek.
- Mesaj tercihleri admin panelinde gösterilecek ve admin tarafından yönetilebilecek.
- Genel günlük mesaj tavanı uygulanmayacak.
- Normal gün iki pratik hatırlatması ve iki değerlendirme isteği içerecek.
- Öğrenci yanıtına bağlı değerlendirme soruları reaktif mesaj sayılacak.
- Görüşme ve yenileme mesajları gerekli günlerde ayrıca gönderilecek.
- Her olay/kategori için idempotency anahtarıyla çift gönderim engellenecek.
- Gelen mesaj ve teslim durumları ayrı anahtarlarla tekilleştirilecek; teslim durumu geriye dönmeyecek.
- Her harici gönderimden hemen önce paket, opt-in, 24 saat/template, pause, safety,
  plan sürümü ve son kullanım zamanı yeniden kontrol edilecek.
- Geçersiz veya geç kalmış mesajlar `SUPPRESSED` olacak ve sonradan topluca gönderilmeyecek.

### D-010: Haftalık Özet İçeriği

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Sayısal özet doğrulanmış/deterministik verilerden üretilecek.
- AI metni açıkça `taslak` olarak gösterilecek.
- AI taslağı model, prompt sürümü ve üretim tarihiyle değişmeden saklanacak.
- Admin AI taslağından ayrı eğitmen notu ekleyip düzenleyebilecek.
- Eğitmen notu değişiklikleri audit log'a yazılacak.
- AI taslağı veya eğitmen notu öğrenciye otomatik gönderilmeyecek.
- Geçmiş haftaların özet ve eğitmen notları admin portalında görüntülenebilecek.

Riskli veya acil durum ifadelerinin işlenmesi `D-013` kapsamında ayrıca
kararlaştırılacaktır.

## P2 - Operasyon ve Büyüme Kararları

### D-011: Admin Kullanıcıları

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- MVP'de tek admin/eğitmen hesabı olacak.
- Giriş e-posta, güçlü parola ve TOTP iki aşamalı doğrulama kullanacak.
- Kritik işlemler audit log'a yazılacak.
- Veri modeli ileride asistan veya muhasebe rolleri eklenebilecek şekilde tasarlanacak.
- Admin tüm WhatsApp/Telegram konuşmalarını panelde görebilecek ve filtreleyebilecek.
- Admin konuşma ekranından öğrencinin varsayılan kanalına yanıt verebilecek.

### D-012: Yapay Zeka Sağlayıcısı ve Veri Konumu

**Karar:** MVP ürün kapsamı kabul edildi; hukuki canlı kontrolü bekliyor - 10 Temmuz 2026.

Kabul edilenler:

- Admin panelinde LLM provider/model registry olacak.
- Admin aktif modeller arasından kullanılacak LLM modelini seçebilecek.
- Model bağlantı testi, etkinleştirme ve devre dışı bırakma işlemleri olacak.
- API anahtarları panel/veritabanında düz metin tutulmayacak; deployment secret referansı kullanılacak.
- Her çağrıda input/output/toplam token, maliyet, gecikme, başarı/hata ve fallback bilgisi tutulacak.
- Varsa cached/thinking/tool/modality tokenları, provider request ID ve fiyat sürümü de tutulacak.
- İstek maliyeti provider usage metadata'sı ve fiyat snapshot'ından tahmini olarak hesaplanacak.
- İstenen ve gerçekte kullanılan provider/model ayrı kaydedilebilecek.
- Kullanım 1/7/30 günlük toplamlar ve provider/model/görev/öğrenci kırılımlarıyla gösterilecek.
- LLM kullanım logu prompt/yanıt metnini tekrar saklamayacak; ilgili kayda referans verecek.
- `projects/whatsapp-agent` model registry, usage log ve konuşma ekranı için referans alınacak; çalışma zamanı bağımlılığı olmayacak.
- Global bir varsayılan LLM modeli seçilebilecek.
- Reflection analizi, haftalık özet ve agent yanıtı için görev bazlı model seçilebilecek.
- Her görev için ayrı fallback model tanımlanabilecek.
- Model çözümleme görev modeli, global varsayılan ve fallback sırasını izleyecek.
- Model ayarı değişikliği yalnızca gelecekteki çağrıları etkileyecek ve audit log'a yazılacak.
- İlk üretim provider'ı Gemini API olacak.
- Kesin Gemini modeli admin panelindeki registry'den seçilecek; kaynak kodda sabitlenmeyecek.
- Üretimde yalnızca Cloud Billing bağlı Paid Services projesi kullanılacak.
- Free tier üzerinden öğrenci metni işlenmeyecek.
- Google ile log/dataset paylaşımı ve model iyileştirme katkısı kapalı tutulacak.
- Data Processing Addendum ve yurt dışı aktarım şartları canlı öncesinde doğrulanacak.
- Mevcut Gemini projesinde aktif Cloud Billing olduğu ürün sahibi tarafından doğrulandı.
- Canlıya geçişte API anahtarı ile Paid Services proje eşleşmesi teknik olarak kontrol edilecek.
- Birincil model geçici hatada bir kez yeniden denenecek.
- İkinci hatadan sonra görev için seçilen fallback model kullanılacak.
- Fallback hatasında temel öğrenci akışı devam edecek.
- Reflection analizi `PENDING` kalacak; haftalık deterministik özet yine hazırlanacak.
- Admin hata detayını görebilecek ve manuel yeniden deneme başlatabilecek.
- Her deneme ayrı usage kaydı oluşturacak ve işlemler idempotent olacak.
- Admin günlük ve aylık USD bütçesi belirleyebilecek.
- Yüzde 80 kullanımda uyarı, yüzde 100 kullanımda kritik bildirim oluşacak.
- İsteğe bağlı hard limit etkinleştirilebilecek.
- Hard limit yalnızca AI görevlerini duraklatacak; temel sistem akışları devam edecek.
- Bekleyen AI işleri kaybolmayacak ve bütçe açıldığında yeniden çalıştırılabilecek.
- Hard limit eşzamanlı worker'lar için atomik maliyet rezervasyonuyla uygulanacak.
- Gemini'ye öğrenci adı, telefon, ödeme, Meet bağlantısı veya doğrudan DB kimliği gönderilmeyecek.
- Yalnızca gerekli reflection metni, ölçümler ve rastgele işlem kimliği gönderilecek.
- Metindeki belirgin telefon, e-posta ve doğrudan tanımlayıcılar çağrı öncesinde maskelenecek.
- Pseudonymization sürümü ve maskeleme sonucu usage metadata'sında izlenecek.
- Provider adapter/base URL/secret alias kod allowlist'iyle sınırlanacak; admin serbest URL giremeyecek.

Canlıya geçiş ön koşulları:

- Paid Services proje/anahtar eşleşmesi teknik olarak doğrulanmalı.
- Google log/dataset paylaşımının kapalı olduğu doğrulanmalı.
- Data Processing Addendum ve yurt dışı veri aktarımı hukuken doğrulanmalı.
- Seçilen üretim ve fallback modelleri görev bazlı test edilmeli.

**Önerilen başlangıç:** AI sistemin çalışması için zorunlu olmasın. Servis
çalışmazsa sayısal özet yine hazırlanabilsin; metin özeti daha sonra tekrar
denensin.

### D-013: Kriz veya Acil Durum İfadeleri

**Karar:** MVP güvenlik akışı kabul edildi; uzman doğrulaması bekliyor - 10 Temmuz 2026.

Kabul edilenler:

- Sistem terapi, teşhis, tıbbi tavsiye veya kriz müdahalesi iddiasında bulunmayacak.
- Açık ve yakın tehlike ihtimalinde agent serbest yanıt üretmeyecek.
- Öğrenciye LLM yerine uzman onaylı sabit yönlendirme mesajı gönderilecek.
- Türkiye'deki öğrenci 112'yi aramaya veya en yakın acil servise yönlendirilecek.
- Admin panelinde yüksek öncelikli uyarı ve ayrıca anlık admin bildirimi oluşacak.
- Sistem otomatik olarak 112'yi veya üçüncü kişileri aramayacak.
- Kayıtta mesajların sürekli/anlık takip edilmediği belirtilecek.
- Risk işareti bir teşhis veya kusursuz güvenlik mekanizması sayılmayacak.
- Safety alert açıkken öğrenciye ait tüm planlı otomatik mesajlar duracak.
- Admin e-posta ve ayrı bir admin WhatsApp numarasıyla anlık bilgilendirilecek.
- Bildirim hedefleri deployment secret/ayarlarından yönetilecek.
- Alert yalnızca admin tarafından kapatılabilecek ve audit log'a yazılacak.
- Alert kapatıldığında yalnızca gelecekteki mesajlar yeniden planlanacak.

Canlıya geçiş ön koşulu:

- Risk kuralları, hizmet sınırı metni ve sabit yönlendirme mesajı uzman tarafından doğrulanmalı.

### D-014: Barındırma ve Operasyon

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- İlk kapasite hedefi 100 aktif öğrenci olacak.
- Kapasite sınırı kaynak kodda sabitlenmeyecek.
- Bir NestJS API süreci ve ayrı job worker kullanılacak.
- Worker, kuyruk gecikmesi ve hata metriklerine göre yatay ölçeklenebilecek.
- Üretim mevcut Coolify sunucusunda bağımsız uygulama olarak çalışacak.
- Üretim ve geliştirme ortamları ayrı secret ve veritabanı kullanacak.
- PostgreSQL ve dosyalar her gün şifreli yedeklenecek.
- Yedekler 30 gün saklanacak.
- RPO en fazla 24 saat, RTO en fazla 4 saat olacak.
- Ayda bir gerçek geri yükleme testi yapılacak.
- Yedekleme veya geri yükleme hatası admin bildirimi oluşturacak.
- Restore ortamı worker/API ve harici provider egress kapalı olarak başlatılacak.
- Harici deletion journal uygulanıp stale job/outbox kayıtları bastırılmadan trafik açılmayacak.
- PostgreSQL Coolify sunucusunda projeye özel veritabanı ve kalıcı disk kullanacak.
- Üretim veritabanı başka uygulamalarla paylaşılmayacak.
- Dekont/dosyalar sunucu dışı private S3 uyumlu obje deposunda tutulacak.
- Veritabanı yedekleri harici obje deposunda ayrı erişim alanında tutulacak.
- Dosya erişimleri kısa ömürlü imzalı URL kullanacak.
- Pilot öncesinde sabit altyapı hard limiti uygulanmayacak.
- Coolify, obje deposu, WhatsApp ve Gemini maliyetleri ayrı izlenecek.
- İlk 30 günlük gerçek kullanım sonrasında bütçe eşikleri belirlenecek.
- Beklenmeyen maliyet artışı admin uyarısı oluşturacak.

### D-015: Bilgi Bankası, RAG ve Agent Yanıtı

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Admin panelinden bir bilgi bankasına birden fazla dosya yüklenebilecek.
- PDF, DOCX, Markdown ve TXT desteklenecek; OCR MVP kapsamında olmayacak.
- Dosyalar `GENERAL`, `WEEK_1`, `WEEK_2`, `WEEK_3`, `WEEK_4`, `INTERMEDIATE`,
  `ADVANCED` aşamalarından bir veya daha fazlasına atanabilecek.
- İlk paket haftaları aşamayı otomatik belirleyecek; sonrası `INTERMEDIATE` olacak.
- `ADVANCED` ve manuel aşama override yalnızca admin tarafından atanacak.
- Retrieval yalnızca `GENERAL` ve öğrencinin güncel aşamasındaki yayınlanmış dosyalarda çalışacak.
- Doküman değişikliği mevcut dosyayı ezmeyecek; yeni immutable sürüm oluşturacak.
- Admin extracted text/chunk önizleme, test araması, publish, archive ve reindex yapabilecek.
- PostgreSQL pgvector ve keyword aramasıyla hybrid retrieval kullanılacak.
- Embedding ve opsiyonel rerank/query rewrite kullanımları LLM usage/bütçeye dahil olacak.
- Skor eşiği üstünde kaynak varsa agent yalnızca seçilen chunk'larla yanıt verecek.
- Kaynak yoksa, çelişiyorsa veya soru kapsam dışıysa agent tahmin etmeyecek.
- Bu durumda sabit mesaj ve `KNOWLEDGE_NOT_FOUND` nedenli handoff oluşacak.
- RAG logu soru metnini tekrar kopyalamayacak; source message, chunk, skor ve handoff referansı tutacak.
- `projects/whatsapp-agent` RAG/index/retrieval/admin test yaklaşımı referans olacak,
  fakat raw payload logu, raw query kopyası ve `vector_json` fallback devralınmayacak.
- Prompt kaynak gerçekliği Git'te immutable sürümlü dosyalar olacak; admin yalnızca onaylı sürüm seçip rollback yapabilecek.

### D-016: Telegram ve Varsayılan Mesajlaşma Kanalı

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Öğrenci WhatsApp veya Telegram üzerinden `KAYIT` akışını başlatabilecek.
- Telegram ayrı bot hesabı ve webhook ile çalışacak; yalnızca private chat kabul edilecek.
- Telegram webhook secret header sabit zamanda doğrulanacak ve `update_id` tekilleştirilecek.
- Telegram kaydında telefon zorunlu olmayacak; harici kanal kimliği şifreli/HMAC olarak tutulacak.
- Kaydın tamamlandığı ilk doğrulanmış kanal öğrencinin varsayılan kanalı olacak.
- Proaktif mesaj, agent yanıtı ve admin yanıtı varsayılan kanaldan gönderilecek.
- Kanal opt-in ve messaging preference kanal kimliğiyle ilişkili tutulacak.
- Mevcut öğrenci ikinci kanalı kısa ömürlü tek kullanımlı deep-link token'la bağlayabilecek.
- Doğrulanmış ikinci kanal öğrenci komutu veya audit'li admin işlemiyle default yapılabilecek.
- WhatsApp 24 saat/template veya delivery hatası Telegram'a otomatik fallback yapmayacak.
- Farklı kanaldan gönderim açık default-channel değişikliği gerektirecek.
- Telegram'da 24 saat/template kuralı yerine botun başlatılmış olması, opt-in,
  identity durumu ve genel send-time kontrolleri uygulanacak.
- Bot engellenirse identity `BLOCKED` olacak, kalıcı hata retry edilmeyecek ve admin uyarılacak.
- Production ve staging ayrı Telegram bot/token/webhook secret kullanacak.

Canlıya geçiş ön koşulları:

- Production Telegram bot hesabı, kullanıcı adı ve görünen metinleri hazırlanmalı.
- Telegram aydınlatma/opt-in metni hukuki kontrolden geçmeli.
- Link token, default-channel change ve blocked-bot E2E testleri geçmeli.

### D-017: System Events ve Standart Mesaj Yönetimi

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Backend'in desteklediği event key kataloğu kod/migration ile sürümlenecek ve admin için read-only olacak.
- MVP event grupları kayıt/izin, ödeme/paket, pratik, görüşme, bilgi/destek,
  kanal, gizlilik/safety ve admin bildirimlerini kapsayacak.
- Event; audience, izinli kanal, variable JSON schema, compliance, expiry ve protected bilgisi taşıyacak.
- Admin desteklenen event'e bağlı yeni standart mesaj tanımı ve varyantı oluşturabilecek.
- Admin event key, backend davranışı, serbest cron/SQL veya yeni template variable oluşturamayacak.
- Varyant kanal, dil, curriculum stage, sabah/akşam slotu, öncelik ve effective range taşıyacak.
- Mesaj içeriği doğrudan ezilmeyecek; DRAFT/PUBLISHED/ARCHIVED immutable version oluşacak.
- Admin preview, allowlist test-send, publish, archive ve rollback yapabilecek.
- `CUSTOM_MANUAL` yalnızca tek öğrenciye manuel mesaj olacak; otomatik trigger veya toplu yayın yapmayacak.
- Privacy/rıza, safety, deletion ve finansal yönerge event'leri protected olacak.
- Protected event/schema admin tarafından değiştirilemeyecek; yalnızca onaylı sürüm seçilebilecek.
- WhatsApp pencere dışı varyantı Meta template name/language/category/approval binding taşıyacak.
- Her inbound mesaj için `SYSTEM_STANDARD_MESSAGE`, `AGENT_CONTEXTUAL`, `ADMIN_HANDOFF`
  veya `NO_REPLY` response owner'larından yalnızca biri seçilecek.
- Button, açık komut ve beklenen state cevabı event tetiklerse standart mesaj gönderilecek; aynı inbound için LLM cevabı üretilmeyecek.
- Belirsiz doğal dilde LLM yalnızca allowlist `proposedIntent/confidence/requiredConfirmation` önerebilecek.
- State-changing command LLM intent'iyle doğrudan uygulanmayacak; standart confirmation/button gerekecek.
- Event mesajı tüketmezse student context ve/veya RAG kullanan `AGENT_CONTEXTUAL`
  denenecek; gerekli veri/kaynak yoksa handoff açılacak.
- Tüm standart mesaj değişiklikleri ve provider binding işlemleri audit log'a yazılacak.

### D-018: Genel Student Context Query

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- Kişisel bilgi soruları için her soru cümlesine ayrı system event tanımlanmayacak.
- LLM yalnızca typed, read-only `get_student_context` backend aracını kullanacak.
- Tool section'ları `PRACTICE`, `MEETINGS`, `MEMBERSHIP`, `PAYMENT`, `ACCOUNT` olacak.
- Range `CURRENT_PACKAGE`, `LAST_30_DAYS`, `ALL_PAGED` ile sınırlı olacak.
- Student ID LLM argümanı olmayacak; backend doğrulanmış kanal kimliğinden enjekte edecek.
- LLM repository, Prisma, SQL, ham tablo veya başka öğrenci verisine erişemeyecek.
- Practice context aktif plan, timezone, slot/saat/süre/pause, session kayıtları ve deterministik toplamları içerecek.
- Varsayılan range aktif paket olacak; bu paketteki tüm pratik kayıtları context'e alınabilecek.
- Tüm geçmiş tek prompt'a doldurulmayacak; sayfalama, row/token ve tool-call limiti uygulanacak.
- Reflection varsayılan context dışı olacak; gerekirse ayrı `REFLECTION_AI` kontrolü yapılacak.
- Dekont, banka detayı, coach note ve safety içeriği genel context'e girmeyecek.
- Oran, tarih ve süre gibi deterministik değerleri backend hesaplayacak; LLM açıklayacak.
- Genel bilgi sorusu RAG, kişisel soru student context, birleşik soru ikisini aynı `AGENT_CONTEXTUAL` cevabında kullanabilecek.
- `AGENT_REPLY_AI` izni yoksa `PROGRAMIM/GÖRÜŞMEM/PAKETİM/ÖDEMEM` komutları
  read-model'i deterministik çağırıp `STUDENT_CONTEXT_RESPONSE` standart mesajı gönderecek.
- Context read logu payload'ı kopyalamadan section/range/asOf/record hash/row count/latency ve cevap referansı tutacak.

### D-019: E-posta, Medya Limitleri, i18n ve Feature Flags

**Karar:** MVP altyapısı için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- İlk admin e-posta provider'ı AWS SES `eu-central-1` olacak ve provider adapter
  arkasında kullanılacak.
- E-posta bildiriminde hassas öğrenci içeriği bulunmayacak; olay özeti, pseudonymous
  referans ve admin panel bağlantısı yer alacak.
- Safety bildirimleri e-posta ve ayrı admin WhatsApp kanalına bağımsız gönderilecek;
  delivery/bounce/complaint durumları izlenecek.
- Ödeme dekontu maksimum 10 MiB, bilgi bankası dokümanı dosya başına 25 MiB,
  çoklu bilgi bankası isteği toplam 100 MiB olacak.
- Boyut limiti metadata, stream ve storage katmanlarında uygulanacak; kısmi obje temizlenecek.
- İlk locale `tr-TR`; öğrenci tercihi BCP 47 olarak saklanacak ve saat diliminden ayrı tutulacak.
- Mesaj/event altyapısı locale-aware olacak; fallback ana dil ve ardından `tr-TR` sırasını izleyecek.
- Safety/hukuki metinler otomatik çevrilmeyecek; yeni dil çeviri onayı, kanal template
  onayı ve testlerden sonra açılacak.
- Feature flag anahtar ve tipleri kodda kayıtlı, hedefleme konfigürasyonu DB'de olacak.
- Allowlist, kanal/cohort/öğrenci hedefleme, deterministik yüzdesel rollout ve kill switch desteklenir.
- Flag değişiklikleri step-up TOTP, gerekçe ve audit ister; consent, auth, safety,
  retention ve ödeme invariant'larını devre dışı bırakamaz.

### D-020: CI ve Release Orkestrasyonu

**Karar:** MVP için kabul edildi - 10 Temmuz 2026.

Kabul edilenler:

- CI ve release orkestrasyonu GitHub Actions ile yapılacak.
- Pull request pipeline'ı format/lint, typecheck, unit/integration, Prisma migration,
  production build ve dependency/security kontrollerini zorunlu kılacak.
- PostgreSQL/pgvector test service container'ında; zaman bağımlı testler `FakeClock`
  ile çalışacak.
- Container image bir kez üretilecek; staging ve production aynı immutable digest'i kullanacak.
- Coolify deployment lifecycle ve runtime health'ten, GitHub Actions kalite kapıları,
  image üretimi ve deploy tetiklemesinden sorumlu olacak.
- Staging ve production ayrı GitHub Environments, secret ve protection rule kullanacak.
- Her environment `COOLIFY_WEBHOOK` ve yalnızca `deploy` yetkili `COOLIFY_TOKEN`
  secret'larını taşıyacak; eksik/HTTPS olmayan değer veya başarısız HTTP çağrısı
  release'i fail-closed durduracak.
- Production deploy başarılı CI, korumalı branch/tag ve manuel reviewer onayı gerektirecek.
- Third-party action sürümleri commit SHA ile sabitlenecek; fork PR'larına deployment
  secret'ları açılmayacak.

## Karar Kayıt Şablonu

```text
Karar: D-XXX
Durum: Kabul edildi / Reddedildi / Ertelendi
Tarih: YYYY-AA-GG
Sonuç:
Gerekçe:
Etkilenen alanlar:
Takip işi:
```
