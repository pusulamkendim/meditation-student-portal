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

## Belgeler

- [Proje taslağı](docs/PROJECT_DRAFT.md)
- [Açık kararlar](docs/OPEN_DECISIONS.md)
- [Teknik uygulama planı](docs/TECHNICAL_PLAN.md)
