# Meditasyon Öğrenci Portalı

Öğrencilerin WhatsApp veya Telegram üzerinden kaydolduğu, ödeme onayından sonra
kişiselleştirilmiş meditasyon programına alındığı ve pratiklerinin takip edildiği portal.

## Yerel Başlangıç

```bash
pnpm install
pnpm setup:local
docker compose up -d postgres
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
