# Meditasyon Öğrenci Portalı

Öğrencilerin WhatsApp veya Telegram üzerinden kaydolduğu, ödeme onayından sonra
kişiselleştirilmiş meditasyon programına alındığı ve pratiklerinin takip edildiği portal.

## Yerel Başlangıç

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev:api
```

API sağlık uçları `http://localhost:3000/health/live` ve
`http://localhost:3000/health/ready` adreslerinde çalışır.

M0; monorepo iskeletini, API/worker/admin uygulamalarını, PostgreSQL + pgvector
yerel ortamını, fake clock/test altyapısını ve fake kanal adapter'larını kapsar.

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
