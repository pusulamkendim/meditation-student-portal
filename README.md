# Meditasyon Öğrenci Portalı

Meditasyon öğrencilerinin WhatsApp ve Telegram üzerinden kaydolmasını, ödeme ve
üyelik süreçlerinin yönetilmesini, günlük pratiklerin takip edilmesini ve haftalık
görüşmelerin planlanmasını tek yerde toplayan öğrenci operasyon platformu.

Proje; yönetim paneli, ayrı Sakin Zihin public sitesi, öğrenciye açılan içerik
deneyimleri, NestJS API'si ve PostgreSQL tabanlı arka plan işleyicisinden oluşan
bir TypeScript monorepo'sudur.

## Özellikler

- **Kayıt ve üyelik:** Kanal bazlı kayıt akışı, KVKK/AI rızaları, ödeme bildirimi,
  admin onayı, abonelik dönemi ve görüşme kredileri.
- **Öğrenci yönetimi:** Profil, kanal kimlikleri, notlar, izinler, ödeme geçmişi,
  pratik devamlılığı ve öğrenci durum geçmişi.
- **Pratik programı:** Sürümlenmiş günlük planlar, zamanlanmış seanslar,
  hatırlatmalar, hızlı yanıtlar, değerlendirmeler ve duraklatma/iptal akışları.
- **Meditasyon kütüphanesi:** Meditasyon türleri, kaynak sesler, farklı sürelerde
  ses üretimi, öğrenciye özel erişim ve paylaşılabilir herkese açık oynatıcılar.
- **Görüşmeler:** Haftalık seri planlama, Google Calendar/Meet senkronizasyonu,
  görüşmeden 1 saat önce haftalık ve toplam pratik metriklerini içeren
  hatırlatmalar, koç notları ve onaylanan haftalık özetler.
- **Mesajlaşma ve operasyon:** WhatsApp/Telegram webhook'ları, konuşma gelen
  kutusu, admin yanıtları, insan desteğine aktarım, teslimat takibi ve bildirimler.
- **İçerik araçları:** Bölümlü okumalar, PDF/Markdown içe aktarma, öğrenci
  atamaları, herkese açık bağlantılar, okuma ilerlemesi ve salt okunur Excalidraw
  paylaşımları.
- **LLM ve bilgi bankası:** Sürümlenmiş prompt'lar, provider/model seçimi, bütçe
  ve kullanım kayıtları, pgvector tabanlı RAG, bağlam denetimi ve feature flag'ler.
- **Güvenlik:** Parola + TOTP admin girişi, recovery code, CSRF koruması, hassas
  alan şifreleme, arama HMAC'leri, audit log ve transactional outbox.

## Mimari

```mermaid
flowchart LR
  Channels[WhatsApp / Telegram] --> API[NestJS + Fastify API]
  Admin[Next.js admin portalı] --> API
  Public[Next.js Sakin Zihin sitesi] --> API
  API --> DB[(PostgreSQL + pgvector)]
  API --> Outbox[Transactional outbox]
  Outbox --> Worker[pg-boss worker]
  Worker --> DB
  Worker --> Providers[Kanal provider'ları]
  Worker --> Google[Google Calendar / Meet]
  Worker --> Gemini[Gemini]
  API --> Storage[R2 veya yerel dosya alanı]
  Worker --> Storage
```

Çalışan dört ana uygulama süreci vardır:

| Süreç                 | Sorumluluk                                                              | Yerel adres             |
| --------------------- | ----------------------------------------------------------------------- | ----------------------- |
| `apps/admin`          | Admin portalı ve yönetilen öğrenci/içerik ekranları                     | `http://localhost:3001` |
| `apps/sakinzihin-web` | Public Sakin Zihin sitesi, meditasyon ve okuma deneyimleri              | `http://localhost:3002` |
| `apps/api`            | REST API, auth, webhook kabulü ve domain servisleri                     | `http://localhost:3000` |
| `apps/worker`         | Outbox aktarımı, mesaj gönderimi, zamanlanmış işler, RAG ve ses üretimi | Arka plan süreci        |

Worker kuyruğu pg-boss ile PostgreSQL üzerinde çalışır. Böylece domain değişikliği
ile kuyruğa aktarılacak olay aynı transaction sınırı içinde tutulur.

## Teknoloji yığını

- Node.js 22, pnpm 10 ve TypeScript 5
- Next.js 15, React 19 ve ortak UI/design-token paketleri
- NestJS 11, Fastify ve Zod
- PostgreSQL 16, pgvector, Prisma 6 ve pg-boss
- Gemini adapter'ları, Cloudflare R2 uyumlu nesne depolama ve ClamAV
- Vitest, Playwright, ESLint ve Prettier
- Docker multi-stage build, GitHub Actions ve Coolify

## Monorepo yapısı

| Yol                                                | İçerik                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| [`apps/admin`](apps/admin)                         | Admin portalı ve yönetilen öğrenci/içerik ekranları                |
| [`apps/sakinzihin-web`](apps/sakinzihin-web)       | Public Sakin Zihin sitesi ve public içerik deneyimleri             |
| [`apps/api`](apps/api)                             | NestJS/Fastify API ve domain modülleri                             |
| [`apps/worker`](apps/worker)                       | Kuyruk tüketicileri ve zamanlanmış işler                           |
| [`packages/core`](packages/core)                   | Domain kuralları, provider sözleşmeleri ve güvenlik primitive'leri |
| [`packages/database`](packages/database)           | Prisma şeması, migration'lar ve repository altyapısı               |
| [`packages/ui`](packages/ui)                       | Admin tarafında kullanılan paylaşılan React bileşenleri ve stiller |
| [`packages/design-tokens`](packages/design-tokens) | Renk, tipografi ve ölçü token'ları                                 |
| [`packages/prompts`](packages/prompts)             | Git ile sürümlenen LLM prompt'ları                                 |
| [`packages/testing`](packages/testing)             | Fake clock ve kanal test yardımcıları                              |
| [`scripts`](scripts)                               | Yerel kurulum, seed, içerik import ve E2E komutları                |

## Yerel kurulum

### Gereksinimler

- Node.js `>=22.12.0`
- pnpm `>=10` (kilitlenen sürüm: `10.30.3`)
- Docker ve Docker Compose
- Meditasyon sesi üretilecekse yerel worker için `ffmpeg`/`ffprobe`

### 1. Bağımlılıkları ve altyapıyı hazırlayın

```bash
pnpm install
pnpm setup:local
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm --filter @meditation/api sync-prompts
```

`pnpm setup:local`, yalnızca `.env` bulunmadığında [`.env.example`](.env.example)
dosyasını kopyalar ve geliştirme ortamına özel şifreleme/HMAC anahtarları üretir.
Var olan `.env` dosyasını değiştirmez. Tek başına yeni anahtar üretmek için
`pnpm secrets:generate` kullanılabilir.

Bilgi bankasına yüklenen dosyaların yerelde taranması gerekiyorsa ClamAV'ı da
başlatın:

```bash
docker compose up -d --wait clamav
```

### 2. İlk admin hesabını oluşturun

Migration'lardan sonra aşağıdaki tek kullanımlık komutu çalıştırın:

```bash
ADMIN_BOOTSTRAP_ENABLED=true \
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD='en-az-12-karakterli-guclu-parola' \
pnpm --filter @meditation/api bootstrap-admin
```

Komut TOTP secret'ını ve recovery code'ları yalnızca bir kez stdout'a yazar.
Bunları güvenli bir yere kaydedin ve TOTP secret'ını authenticator uygulamanıza
ekleyin. Veritabanı ikinci bootstrap denemesini reddeder.

İsterseniz geliştirme veritabanına örnek öğrenciler, konuşmalar, pratikler ve
görüşmeler ekleyebilirsiniz:

```bash
pnpm seed:demo
```

### 3. Uygulamayı çalıştırın

Dört ayrı terminalde:

```bash
pnpm dev:api
```

```bash
pnpm dev:worker
```

```bash
pnpm dev:admin
```

```bash
pnpm --filter @meditation/sakinzihin-web dev
```

Admin portalına `http://localhost:3001/login` adresinden, public siteye ise
`http://localhost:3002` adresinden erişebilirsiniz. Admin girişinde bootstrap
sırasında belirlenen e-posta, parola ve TOTP kodu kullanılır.

| Adres                                     | Açıklama                                      |
| ----------------------------------------- | --------------------------------------------- |
| `http://localhost:3001`                   | Admin portalı                                 |
| `http://localhost:3002`                   | Public Sakin Zihin sitesi                     |
| `http://localhost:3000/health/live`       | API process canlılık kontrolü                 |
| `http://localhost:3000/health/ready`      | Yapılandırma + veritabanı hazır olma kontrolü |
| `http://localhost:3002/m#<erişim-kodu>`   | Öğrenciye atanmış pratik oynatıcı             |
| `http://localhost:3002/meditasyon/<slug>` | Herkese açık meditasyon sayfası               |
| `http://localhost:3002/read#<token>`      | Öğrenciye atanmış okuma                       |
| `http://localhost:3002/oku/<slug>`        | Herkese açık okuma                            |
| `http://localhost:3002/drawing#<token>`   | Öğrenciye atanmış salt okunur çizim           |

## Yapılandırma ve entegrasyonlar

Temel geliştirme ortamı için gerekli kriptografik değerler `setup:local`
tarafından hazırlanır. Harici özellikler aşağıdaki değişkenler sağlandığında
etkinleştirilebilir:

| Alan                 | Başlıca değişkenler                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Admin/API            | `ADMIN_ORIGIN`, `NEXT_PUBLIC_API_URL`, `ADMIN_SESSION_HMAC_KEY`                                                                     |
| Veri güvenliği       | `DATA_ENCRYPTION_KEYS_JSON`, `ACTIVE_DATA_KEY_ID`, `LOOKUP_HMAC_KEY`                                                                |
| WhatsApp             | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| Telegram             | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ACCOUNT_ID`                                                              |
| Ödeme ve iç komutlar | `PAYMENT_IBAN`, `PAYMENT_ACCOUNT_HOLDER`, `INTERNAL_COMMAND_SECRET`                                                                 |
| Google Calendar      | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`                                                 |
| LLM                  | `GEMINI_API_KEY`                                                                                                                    |
| Nesne depolama       | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, bucket adları                                                            |
| Dosya tarama         | `CLAMAV_HOST`, `CLAMAV_PORT`                                                                                                        |
| Gönderim güvenliği   | `ALLOWED_RECIPIENTS`                                                                                                                |

Google OAuth redirect URI'si yerelde
`http://localhost:3000/v1/admin/google-calendar/oauth/callback` olmalıdır.

R2 bilgileri verilmezse belge ve medya depolama geliştirme ortamında yerel dosya
sistemine düşer. Bilgi bankası ingest/embedding, agent reply ve AI haftalık özet
özellikleri; ilgili Gemini model/task ayarı ve feature flag açılana kadar kapalı
kalır. Prompt dosyaları değiştiğinde tekrar şu komutu çalıştırın:

```bash
pnpm build
pnpm --filter @meditation/api sync-prompts
```

Worker, `WHATSAPP_BUSINESS_ACCOUNT_ID` ve `WHATSAPP_ACCESS_TOKEN` tanımlıysa
yayımlanmış tüm WhatsApp mesajlarını açılışta ve ardından 15 dakikada bir Meta
şablonlarıyla eşitler. Yeni mesajlar otomatik oluşturulur; içerik veya hızlı yanıt
butonları değiştiğinde içerik parmak izine sahip yeni bir şablon sürümü gönderilir.
Yalnızca Meta tarafından onaylanan ve güncel içerikle eşleşen şablonlar mesaj
gönderiminde kullanılır. Senkronizasyonu elle tetiklemek için:

```bash
pnpm sync:whatsapp-templates
```

### Sakin Zihin arama ve ziyaretçi ölçümü

Google Search Console için `sakinzihin.com` bir **Domain property** olarak
eklenir ve Google'ın verdiği `google-site-verification=...` TXT kaydı Cloudflare
DNS'te tutulur. Doğrulamadan sonra `https://sakinzihin.com/sitemap.xml` Search
Console'a gönderilir. TXT kaydı, sahiplik doğrulamasının devam etmesi için
silinmemelidir.

Cloudflare Web Analytics, Cloudflare dashboard üzerinden `sakinzihin.com` için
automatic setup ile etkinleştirilir. Analytics beacon'ı Cloudflare tarafından
proxy katmanında otomatik olarak enjekte edilir; uygulamada manuel token,
environment variable veya JavaScript snippet'i tutulmaz. Okuma ve meditasyon
başlangıç/tamamlama gibi ürün olayları mevcut public API analytics akışında kalır.

Public site'daki `landing_view`, okuma/meditasyon, birebir çalışma ve CTA
event'leri de `window.SakinZihinAnalytics.track(...)` API'sini değiştirmeden
layout açılışında başlatılan küçük bir provider ile
`POST /v1/public/analytics/events` endpoint'ine gönderilir. Gönderim için
`navigator.sendBeacon`, yedek olarak `fetch(..., { keepalive: true })` kullanılır;
analytics hatası sayfa veya CTA davranışını engellemez. API yalnızca anonim bir
session anahtarı, event, pathname/slug, CTA konumu, UTM alanları ve query/hash'i
kırpılmış referrer saklar; öğrenci verisi, iletişim bilgisi veya mesaj içeriği
toplanmaz. Bunun için `NEXT_PUBLIC_API_URL` dışında yeni bir environment variable
gerekmez.

Global `page_view`, public layout üzerinden ilk sayfa açılışında ve her pathname
değişiminde mevcut `track('page_view')` akışıyla bir kez gönderilir. Doğrudan okuma,
meditasyon veya diğer public sayfalara gelen ziyaretler de kapsanır; aynı pathname
içindeki query/hash değişimleri ve React Strict Mode efekt tekrarı ek olay üretmez.
Başka bir sayfadan geri dönmek veya sayfayı yenilemek yeni bir görüntülemedir.
Mevcut `landing_view` ve içerik/CTA olayları korunur; yeni DB alanı veya provider
eklenmez.

Site & İçerik özetindeki “Sayfa görüntüleme” (`summary.pageViews`), seçili dönemin
`page_view` olaylarının toplamıdır; aynı oturumdaki farklı sayfa görüntülemeleri
ayrı sayılır. Önceki dönem karşılaştırması da aynı olaydan hesaplanır. “Tekil
oturum” (`summary.sessions`) ve dönüşüm hunisinin ilk adımı (`funnel.sessions`)
tekil `session_id` sayısını kullanır; huni oranları toplam sayfa görüntülemesine
bölünmez. Huninin ilk adımı, seçili dönemde herhangi bir analytics olayı bulunan
tüm oturumları kapsar; `landing_view` veya ana sayfaya giriş şartı aranmaz. Diğer
adımlardaki `contentViews`, `oneToOneViews` ve `conversionClicks` alanları ilgili
olayı üreten tekil oturumları, `conversionEvents` ise ham aksiyon sayısını gösterir.

`staging` ve `production` ortamlarında eksik zorunlu secret'lar uygulamanın
başlamasını engeller. Güncel sözleşmenin kaynakları [`.env.example`](.env.example)
ve [`packages/core/src/config.ts`](packages/core/src/config.ts) dosyalarıdır;
secret değerlerini repoya commit etmeyin.

## Yararlı komutlar

| Komut                                                        | Açıklama                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm check`                                                 | Format, lint, typecheck ve unit test zinciri                    |
| `pnpm build`                                                 | Tüm uygulama ve paketleri derler                                |
| `pnpm test:db`                                               | Yerel PostgreSQL üzerinde database integration testleri         |
| `pnpm e2e:registration`                                      | İzole geçici DB ile Telegram kayıt/ödeme E2E akışı              |
| `pnpm e2e:knowledge`                                         | İzole geçici DB ile bilgi bankası E2E akışı                     |
| `pnpm e2e:admin`                                             | Desktop ve mobil Playwright UI testleri                         |
| `pnpm seed:demo`                                             | Geliştirme veritabanına tekrar çalıştırılabilir demo veri ekler |
| `pnpm import:reading -- --markdown=./icerik.md --sections=5` | Markdown okumayı bölümlere ayırarak içe aktarır                 |

Registration ve knowledge E2E komutları PostgreSQL'i başlatır, her çalıştırma için
geçici bir veritabanı oluşturur, migration'ları uygular ve test sonunda veritabanını
siler. Admin E2E testleri Next.js sunucusunu otomatik başlatır ve API çağrılarını
test içinde izole eder.

## Dağıtım

[`Dockerfile`](Dockerfile) dört ayrı target üretir: `api`, `admin`,
`sakinzihin-web` ve `worker`. Production API container'ı açılışta
`prisma migrate deploy` ve prompt senkronizasyonunu çalıştırır; worker imajı
meditasyon sesleri için ffmpeg içerir. Admin ve public imajları oluşturulurken
public API adresi `NEXT_PUBLIC_API_URL` build argümanı olarak verilmelidir.

Rutin production deployları GitHub push webhook'undan otomatik başlamaz. Aynı
commit'in bir kez webhook, bir kez API ile build edilmesini önlemek için deploy
hedefi açıkça seçilir ve cache korunarak sıralı çalıştırılır. Her Coolify uygulaması
kendi target cache'ini sonraki deploymentında yeniden kullanır:

```bash
pnpm deploy:coolify api
pnpm deploy:coolify api worker
pnpm deploy:coolify sakinzihin-web
pnpm deploy:coolify all
```

Hedef seçimi:

- Yalnızca admin/UI değişikliği: `admin`
- Yalnızca public site değişikliği: `sakinzihin-web`
- Yalnızca API değişikliği: `api`
- Yalnızca queue/worker değişikliği: `worker`
- `packages/core` veya `packages/database`: `api worker`
- Lockfile, root manifest veya `Dockerfile`: `all`

Komut varsayılan olarak Coolify `force` parametresini hiç göndermez. `--force`
yalnızca bilinçli bir cold build gerektiğinde kullanılmalıdır.

`v*` etiketi [release workflow'unu](.github/workflows/release.yml) başlatır. Akış
kalite ve build kontrollerinden sonra önce `staging`, onay sonrasında `production`
Coolify webhook'unu çağırır. Her GitHub Environment aşağıdaki secret'lara sahip
olmalıdır:

- `COOLIFY_WEBHOOK`: İlgili uygulamanın HTTPS deploy webhook'u
- `COOLIFY_TOKEN`: Yalnızca deploy yetkili API token'ı

Production environment için required reviewer tanımlanmalıdır. Secret eksik,
webhook HTTPS değil veya Coolify çağrısı başarısızsa workflow fail-closed durur.

## Belgeler

- [Proje taslağı](docs/PROJECT_DRAFT.md)
- [Teknik uygulama planı](docs/TECHNICAL_PLAN.md)
- [Açık kararlar](docs/OPEN_DECISIONS.md)
- [UI tasarım sistemi](docs/UI_DESIGN_SYSTEM.md)
- [Meditasyon bilgi içeriği](docs/Knowledge.md)
