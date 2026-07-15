# Meditasyon Öğrenci Portalı

Öğrencilerin WhatsApp veya Telegram üzerinden kaydolduğu, ödeme onayından sonra
kişiselleştirilmiş meditasyon programına alındığı ve pratiklerinin takip edildiği portal.

## Yerel Başlangıç

```bash
pnpm install
pnpm setup:local
docker compose up -d postgres redis
pnpm db:migrate
pnpm test:db
pnpm dev:api
```

`pnpm setup:local`, `.env` yoksa örnek dosyadan oluşturur ve yerel şifreleme/HMAC
anahtarlarını otomatik üretir. Var olan `.env` dosyasının üzerine yazmaz.
`pnpm secrets:generate` yalnızca yeni anahtarları stdout'a almak gerektiğinde
kullanılır. İlk admin migration sonrasında tek kullanımlık komutla oluşturulur:

```bash
ADMIN_BOOTSTRAP_ENABLED=true \
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-strong-password' \
pnpm --filter @meditation/api bootstrap-admin
```

Komut TOTP secret ve tek kullanımlık recovery code'ları yalnızca bir kez stdout'a
yazar; ikinci admin bootstrap denemesi veritabanı tarafından reddedilir.

API sağlık uçları `http://localhost:3000/health/live` ve
`http://localhost:3000/health/ready` adreslerinde çalışır.

Kayıt akışının Telegram webhook'tan ödeme bildirimine kadar olan yerel E2E testi,
gerçek provider'a çıkmadan tek komutla çalışır:

```bash
pnpm e2e:registration
```

Komut PostgreSQL'i başlatır, run'a özel geçici bir veritabanı oluşturur, migration'ları
uygular, fake Telegram provider ile akışı doğrular ve veritabanını sonunda siler.

M6 görüşme yönetimi admin portalındaki `http://localhost:3001/meetings` ekranındadır.
Google Calendar bağlantısı kullanılacaksa `.env` içinde mevcut Google OAuth client'ı
deployment secret olarak `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` ve
`GOOGLE_OAUTH_REDIRECT_URI` ile tanımlayın; `CHEATSHEET.md` içindeki değerleri koda
veya commit'e taşımayın. Redirect URI yerelde
`http://localhost:3000/v1/admin/google-calendar/oauth/callback` olmalıdır.

M7 LLM platformu için `.env` içinde Paid Services Gemini API anahtarını
`GEMINI_API_KEY` olarak tanımlayın. Migration provider/model/fiyat snapshot ve
varsayılan bütçeyi oluşturur. Git kaynaklı prompt sürümlerini veritabanına almak
için migration sonrasında `pnpm --filter @meditation/api sync-prompts` çalıştırın;
provider'ı admin portalındaki LLM Platformu ekranından bağlantı testi sonrası
etkinleştirin. Öğrencilerde agent yanıtı için ayrıca `AGENT_REPLY_AI` rızası gerekir.

M0; monorepo iskeletini, API/worker/admin uygulamalarını, PostgreSQL + pgvector
yerel ortamını, fake clock/test altyapısını ve fake kanal adapter'larını kapsar.

M1; admin parola/TOTP/session/recovery akışını, alan şifreleme ve HMAC
primitive'lerini, audit + transactional outbox çekirdeğini, temel öğrenci/ödeme/
paket/pratik/görüşme/mesaj şemasını, pg-boss worker'ını, SES admin bildirim
adapter'ını ve admin portal shell'ini içerir.

## Coolify Deploy Secret Sözleşmesi

GitHub'da `staging` ve `production` isimli iki Environment oluşturulur. Her
Environment aşağıdaki kendi değerlerini taşır:

- `COOLIFY_WEBHOOK`: İlgili Coolify uygulamasının HTTPS deploy webhook URL'si
- `COOLIFY_TOKEN`: Yalnızca `deploy` yetkili Coolify API token'ı

`production` Environment için required reviewer kuralı zorunludur. `v*` tag'i
release workflow'unu başlatır; kalite/build adımlarından sonra staging deploy edilir,
production deploy ise environment onayından sonra çalışır. Secret eksikse, webhook
HTTPS değilse veya Coolify çağrısı başarısızsa workflow fail-closed durur.

## Belgeler

- [Proje taslağı](docs/PROJECT_DRAFT.md)
- [Açık kararlar](docs/OPEN_DECISIONS.md)
- [Teknik uygulama planı](docs/TECHNICAL_PLAN.md)
