# Meditasyon Öğrenci Portalı - Teknik Uygulama Planı

| Alan | Değer |
| --- | --- |
| Belge durumu | Taslak |
| Sürüm | 0.9 |
| Oluşturulma tarihi | 10 Temmuz 2026 |
| Son güncelleme | 10 Temmuz 2026 |
| Hedef | MVP backend, worker ve admin portalı |
| Kapasite | İlk aşamada 100 aktif öğrenci |

## 1. Teknik Hedef

WhatsApp veya Telegram üzerinden çalışan öğrenci kayıt, ödeme, pratik takibi ve görüşme
akışlarını deterministik bir backend ile yürütmek; AI'yı yalnızca izinli metin
analizi, taslak özet ve kontrollü agent yanıtlarında yardımcı olarak kullanmak.

Sistem aşağıdaki özellikleri birlikte sağlamalıdır:

- WhatsApp/Telegram webhook'larını güvenli ve idempotent işleme
- Kayıt ve ödeme durum makineleri
- Kalıcı ve tekrar çalıştırılabilir zamanlanmış işler
- Aylık paket, pratik programı ve dört görüşme hakkı
- Google Calendar/Meet entegrasyonu
- Tüm konuşmaların admin panelinde görüntülenmesi
- Görev bazlı LLM modeli, fallback ve kullanım takibi
- KVKK, rıza, silme, saklama ve audit kayıtları
- Agentın doğrudan kritik sistem durumlarını değiştirememesi
- Admin yönetimli, aşama bazlı çoklu dosya bilgi bankası ve kaynak kontrollü RAG
- Kayıt kanalını varsayılan yapan, doğrulanabilir WhatsApp/Telegram kanal kimlikleri

## 2. Mimari Karar

İlk sürüm ayrı mikroservisler yerine modüler monolit olarak geliştirilecektir.
API ve worker aynı domain kodunu kullanır ancak ayrı süreçler olarak çalışır.

```text
                    +---------------------+
WhatsApp Cloud API -> NestJS API          |
Telegram Bot API  ->|  Channel Webhooks   |
                    |  Webhook + REST     |<---- Next.js Admin
Google Calendar  <--|                     |
Gemini API       <--|  Domain Services    |
                    +----------+----------+
                               |
                         PostgreSQL
                    Domain data + pg-boss
                               |
                    +----------+----------+
                    | NestJS Worker       |
                    | Jobs + integrations |
                    +----------+----------+
                               |
                    Private S3-compatible
                       object storage
```

### 2.1 Neden Modüler Monolit

- 100 aktif öğrenci için mikroservis operasyon maliyeti gereksizdir.
- Kayıt, ödeme, paket ve job oluşturma tek transaction içinde yapılabilir.
- API ve worker ayrı ölçeklenebilir.
- Domain modülleri daha sonra gerekirse servis olarak ayrılabilir.
- PostgreSQL, queue ve domain verisi için tek yedekleme sınırı sağlar.

## 3. Teknoloji Yığını

| Katman | Seçim |
| --- | --- |
| Monorepo | pnpm workspace |
| Runtime | pg-boss gereksinimini karşılayan sabitlenmiş Node.js sürümü |
| API | TypeScript + NestJS |
| Admin | Next.js + TypeScript |
| Veritabanı | PostgreSQL |
| ORM/migration | Prisma ve versioned SQL migrations |
| Job queue | pg-boss |
| API sözleşmesi | REST, OpenAPI ve Zod doğrulama |
| WhatsApp | Meta WhatsApp Cloud API |
| Telegram | Telegram Bot API |
| Vektör arama | PostgreSQL `pgvector`, hybrid keyword/vector retrieval |
| Takvim | Google Calendar API + Google Meet conference data |
| İlk LLM provider | Gemini API Paid Services |
| Dosya deposu | Private S3-compatible object storage |
| Admin e-posta | AWS SES, `eu-central-1` |
| Yerelleştirme | BCP 47 locale, başlangıç `tr-TR` |
| Feature flag | Uygulama DB'si + typed flag registry |
| Test | Vitest/Jest uyumlu unit-integration ve Playwright E2E |
| CI/release orkestrasyonu | GitHub Actions |
| Dağıtım | Docker + Coolify |

Kesin paket sürümleri proje iskeleti oluşturulurken uyumluluk kontrolünden sonra
lockfile ile sabitlenecektir. pg-boss'un güncel sürümü Node.js 22.12+ ve
PostgreSQL 13+ istemekte, Prisma 7+ transaction adapter'ı sunmaktadır.

## 4. Monorepo Yapısı

```text
meditation-student-portal/
  apps/
    api/                 # NestJS HTTP API ve webhook
    worker/              # NestJS application context, pg-boss consumers
    admin/               # Next.js admin portalı
  packages/
    domain/              # Entity kuralları ve durum makineleri
    database/            # Prisma schema, migrations ve repositories
    contracts/           # Zod DTO, OpenAPI tipleri ve enumlar
    integrations/        # WhatsApp, Telegram, Google, Gemini, S3 adapter arayüzleri
    observability/       # Log, metric, trace ve correlation helpers
    config/              # Tip güvenli env doğrulama
    testing/             # Fixture, fake clock ve provider test doubles
  infra/
    docker/              # Dockerfiles ve local compose
    coolify/             # Deploy/runbook notları
  docs/
```

### 4.1 Bağımlılık Kuralları

- `domain`, NestJS, Prisma veya harici provider SDK'sına bağımlı olmaz.
- `api` ve `worker`, domain use-case'lerini çağırır.
- Harici servisler adapter arayüzleri arkasında tutulur.
- Admin yalnızca versioned REST/OpenAPI sözleşmesini kullanır.
- LLM hiçbir zaman repository veya doğrudan DB yazma aracına sahip olmaz.

## 5. Runtime Süreçleri

### 5.1 API Süreci

- WhatsApp webhook doğrulama ve event kabulü
- Telegram webhook secret doğrulama ve update kabulü
- Admin auth ve REST endpoint'leri
- Request validation, authorization ve audit
- Health/readiness endpoint'leri
- OpenAPI üretimi

API, uzun süren LLM, mesaj gönderimi ve Calendar işlemlerini request içinde
yapmaz. Domain kaydını ve gerçek transactional outbox kaydını aynı database
transaction'ında oluşturup hızlı yanıt döner. Ayrı relay, outbox kaydını
idempotent pg-boss job'una dönüştürür; pg-boss transaction'a doğrudan dahil
edilmiş varsayılmaz.

### 5.2 Worker Süreci

- WhatsApp mesaj gönderimi ve status reconciliation
- Telegram mesaj gönderimi ve kalıcı hata reconciliation
- Pratik reminder/check-in/day-close işleri
- Paket yenileme ve sona erme işleri
- Google Calendar/Meet create/update işleri
- Reflection tagging ve weekly summary işleri
- Knowledge document parse/chunk/embed/publish ve RAG retrieval işleri
- Dekont ve retention silme işleri
- Retry, fallback ve dead-letter yönetimi
- Transactional outbox relay ve kalıcı inbox işleme

Aynı öğrenciye ait inbox olayları PostgreSQL advisory lock veya kilitli aggregate
satırı altında sıralı işlenir. Her olay aggregate `version` ve provider zamanıyla
doğrulanır; farklı öğrenciler paralel işlenebilir.

### 5.3 Admin Süreci

- Server-rendered güvenli admin ekranları
- Konuşma zaman çizelgesi
- Öğrenci, ödeme, paket, pratik ve görüşme yönetimi
- LLM registry/usage/budget ekranları
- Safety alert, handoff ve veri silme iş listeleri

## 6. Domain Modülleri

| Modül | Sorumluluk |
| --- | --- |
| `students` | Profil, öğrenci yaşam döngüsü, saat dilimi |
| `privacy` | Aydınlatma, kapsam bazlı rıza, silme ve retention |
| `payments` | Ödeme bildirimi, admin onayı, dekont ve adjustment |
| `subscriptions` | Aylık paket dönemleri ve dört görüşme hakkı |
| `practice-plans` | Sürümlü günlük plan ve admin override |
| `practice-sessions` | Reminder, check-in ve pratik sonucu |
| `reflections` | İsteğe bağlı metin ve AI etiketleri |
| `meetings` | Dört görüşme, Calendar serisi ve Meet bağlantısı |
| `summaries` | Deterministik metrik, AI taslak ve coach note |
| `channels` | WhatsApp/Telegram hesapları, kimlik bağlama ve varsayılan kanal |
| `conversations` | Kanal-bağımsız normalize gelen/giden mesajlar |
| `handoffs` | `DESTEK` ve admin takeover |
| `safety` | Safety alert, sabit yönlendirme ve pause |
| `llm` | Provider/model/task config, budget ve usage |
| `knowledge` | Bilgi bankası, doküman sürümü, chunk, embedding ve retrieval |
| `jobs` | Domain job üretimi, idempotency ve retry |
| `messaging` | Transactional inbox/outbox, send policy ve delivery reconciliation |
| `system-events` | Kod-sürümlü event registry, occurrence ve response ownership |
| `message-catalog` | Standart mesaj tanımı, varyant, immutable sürüm ve render policy |
| `student-context` | LLM'e açılan typed, student-bound read-model query facade |
| `notifications` | Admin e-posta/WhatsApp bildirim routing, delivery ve escalation |
| `localization` | Locale çözümleme, çeviri anahtarları ve fallback policy |
| `feature-flags` | Typed flag, hedefleme, deterministik rollout ve kill switch |
| `admin` | Kullanıcı, session, TOTP ve yetkilendirme |
| `audit` | Kritik işlem ve önceki/yeni değer kaydı |

## 7. Veritabanı Taslağı

Tüm domain tabloları UUID/UUIDv7 benzeri dağıtık güvenli kimlik, `created_at`,
`updated_at` ve gerekli yerlerde optimistic concurrency `version` alanı taşır.
Tüm anlık timestamp'ler UTC saklanır; öğrenci saat dilimi IANA kimliği olarak
ayrı tutulur ve kayıt sırasında zorunlu olarak belirlenir. MVP varsayılanı
`Europe/Istanbul` olup öğrenciye onaylatılır. Paket başlangıç/bitişi yerel
`DATE` ve `[start_date, end_exclusive)` olarak saklanır. Finansal tutarlar float
değil `amount_minor BIGINT` ve ISO `currency` (`TRY`) ile tutulur.

### 7.1 Kimlik ve Öğrenci

- `students`
- `student_status_history`
- `privacy_notice_receipts`
- `consents`
- `messaging_preferences`
- `channel_accounts`
- `student_channel_identities`
- `channel_opt_ins`
- `channel_link_tokens`
- `schedule_change_requests`
- `data_deletion_requests`

`students.phone` Telegram kaydı için nullable'dır. WhatsApp kimliği E.164,
Telegram private `chat_id/user_id` ise 64-bit uyumlu string olarak normalize
edilir. Her harici kimlik `(channel_account_id, external_user_hmac)` ile unique,
gösterim değeri application-level şifrelidir. `students.default_channel_identity_id`
yalnızca `VERIFIED/ACTIVE` kimliğe referans verebilir. Link token'ının yalnızca
hash'i, hedef kanalı, TTL'i ve tek kullanım durumu tutulur. Token en az 128-bit
rastgele, 10 dakika geçerli ve mevcut doğrulanmış kimlikte başlatılan talebe
bağlıdır; Telegram `/start link_<token>` kullanımı atomik consume edilir. Hassas serbest metin
alanları application-level envelope encryption ile korunur.

`students.curriculum_stage` `WEEK_1`, `WEEK_2`, `WEEK_3`, `WEEK_4`,
`INTERMEDIATE`, `ADVANCED` değerlerinden biridir. İlk paket gününe göre ilk dört
aşama otomatik hesaplanır, ilk paket tamamlanınca `INTERMEDIATE` olur;
`ADVANCED` ve manuel override admin/audit gerektirir. `curriculum_stage_source`
`AUTO/ADMIN` olarak tutulur; `ADMIN` override yeni paket veya zamanlama job'uyla
kendiliğinden ezilmez.

### 7.2 Finans ve Paket

- `payments`
- `payment_adjustments`
- `subscription_periods`
- `meeting_credit_events`

`subscription_periods` için aynı öğrenci üzerinde tarih çakışmasını önleyen DB
constraint/range kontrolü bulunur. Görüşme hakkı yalnızca mutable sayaç olarak
değil, credit event kayıtlarından hesaplanır.
Bir ay eklenirken hedef ayda gün yoksa ayın son gününe sınırlanır. Ödeme
onayı; payment approval, subscription oluşturma/bağlama, dört credit grant,
audit ve outbox intent'lerini tek transaction'da gerçekleştirir. İade yalnızca
finansal durumu değiştirir; paket iptali ayrı ve gerekçeli admin command'idir.

### 7.3 Pratik

- `practice_plans`
- `practice_slots`
- `practice_duration_rules`
- `practice_sessions`
- `reflections`
- `reflection_tags`

Plan değişikliği eski planı güncellemez; yeni sürüm oluşturur. Practice session
oluşturulduğunda geçerli plan sürümü ve süre snapshot olarak saklanır.
Session ayrıca reply-context nonce, local service date, reminder/check-in intent
kimlikleri ve `due_at/expires_at` alanlarını taşır.

### 7.4 Görüşme ve Özet

- `meeting_series`
- `weekly_meetings`
- `meeting_schedule_events`
- `weekly_summaries`
- `coach_notes`

Calendar event/series kimliği ve Meet URL ayrı tutulur. AI taslağı immutable,
coach note versioned mutable kayıttır.
Her `weekly_meetings` kaydı `google_instance_id`, `original_start_time`, `etag`,
`calendar_sync_status`, `conference_status`, `last_synced_at` ve opsiyonel manuel
Meet URL override alanlarını taşır.

### 7.5 Mesajlaşma

- `webhook_events`
- `messages`
- `message_delivery_events`
- `message_intents`
- `inbox_events`
- `handoffs`
- `safety_alerts`

Ham webhook payload kalıcı olarak saklanmaz. Event türü, kanal, harici event/
message ID, payload hash, işlenme sonucu ve gerekli normalize alanlar tutulur.
WhatsApp gelen mesajı `(channel_account_id, phone_number_id, wamid)` ile tekilleştirilir. Teslim olayı
`(phone_number_id, wamid, status, provider_timestamp, payload_hash)` ile ayrı
tekilleştirilir; monotonic reconciliation `READ` durumunu daha sonra gelen
`DELIVERED` olayıyla geriletmez. Webhook batch içindeki tüm `entry/changes`
elemanları tek tek normalize edilir.

Telegram update'i `(channel_account_id, update_id)` ile tekilleştirilir; yalnızca
private chat `message` ve izinli callback query türleri kabul edilir. `update_id`
sırası sınırlı ordering sinyali olarak kullanılır ancak domain işleme yine
öğrenci aggregate lock'u altında yapılır.

`message_intents`; kategori, hedef channel identity, WhatsApp için template/dil/
sürüm, plan/aggregate sürümü,
`due_at`, `expires_at`, idempotency key, durum, suppression nedeni ve provider
request/message ID alanlarını taşır. Durumlar en az `PENDING`, `CLAIMED`, `SENT`,
`DELIVERY_UNKNOWN`, `DELIVERED`, `READ`, `FAILED`, `SUPPRESSED` olur.

Standart mesaj ve event kataloğu için aşağıdaki ayrı sorumluluklar kullanılır:

- `system_event_definitions`
- `system_event_occurrences`
- `standard_message_definitions`
- `standard_message_variants`
- `standard_message_versions`
- `provider_template_bindings`

`system_event_definitions` code seed/migration ile gelir ve admin için read-only'dir.
Event key, audience, allowed channel, variable JSON schema, compliance class,
default expiry ve `protected` taşır. `system_event_occurrences` aggregate type/id,
schema-doğrulanmış allowlist payload, source message, causation/correlation ID ve
processing durumunu tutar; payload'a serbest metin veya tüm entity snapshot'ı konmaz.

Standart mesaj tanımı desteklenen event key'e bağlanır. Varyant kanal, dil,
curriculum stage, slot, öncelik ve effective range taşır. Her içerik değişikliği
immutable version oluşturur; state `DRAFT/PUBLISHED/ARCHIVED` olur. Intent render
edildiğinde event occurrence, definition/variant/version ve render variable hash'i
snapshot olarak saklanır.

### 7.6 Bilgi Bankası

- `knowledge_bases`
- `knowledge_documents`
- `knowledge_document_versions`
- `knowledge_document_stage_assignments`
- `knowledge_chunks`
- `knowledge_embeddings`
- `rag_query_logs`
- `agent_context_reads`

Doküman sürümü dosya hash'i, content type, storage key, parser sürümü,
embedding modeli, durum ve publish/archived zamanını taşır. Aşama atamaları
`GENERAL`, `WEEK_1`-`WEEK_4`, `INTERMEDIATE`, `ADVANCED` many-to-many kayıtlardır.
Chunk, doküman sürümü ve aşama metadata'sını snapshot olarak taşır. Embedding
`pgvector` kolonunda model/sürüm ve content hash ile tutulur; eski sürüm publish
transaction'ı tamamlanmadan aramadan çıkarılmaz.

`rag_query_logs` soru metnini kopyalamaz; source message ID, stage, retrieval
config sürümü, aday/seçilen chunk kimlikleri, skorlar, eşik sonucu, latency,
answer message ve handoff referansı tutar.

`agent_context_reads` source message/answer, istenen section/range, `as_of`,
projection schema version, dönen record ID/hash'leri, row count, pagination,
latency ve policy sonucunu tutar; projection payload'ını veya reflection metnini
ikinci kez kopyalamaz.

### 7.7 LLM

- `llm_providers`
- `llm_models`
- `llm_task_configs`
- `llm_prompt_versions`
- `llm_usage_logs`
- `llm_budgets`
- `llm_budget_reservations`

Usage kaydı prompt/response metnini kopyalamaz. İlgili reflection, conversation
veya summary kaydına nullable foreign key/referans taşır.

### 7.8 Admin ve Operasyon

- `admin_users`
- `admin_sessions`
- `totp_recovery_codes`
- `audit_logs`
- `outbox_events`
- `notification_deliveries`
- `feature_flag_configs`
- `feature_flag_evaluations`
- pg-boss'un kendi schema/tabloları

Tamamlanmış silmelerin irreversibly hash'lenmiş subject kimliği, kapsamı ve
tamamlanma zamanı PostgreSQL yedeğinden ayrı, append-only `deletion_journal`
deposunda tutulur. Restore bu günlüğü uygulamadan trafiğe açılmaz.

## 8. Temel Durum Makineleri

### 8.1 Öğrenci ve Üyelik

```text
Onboarding: NEW -> NOTICE_SENT -> CONSENT_PENDING -> NAME_PENDING
            -> PAYMENT_PENDING -> PAYMENT_REVIEW -> COMPLETE
Membership: NO_PACKAGE | SCHEDULED | ACTIVE | INACTIVE | CANCELLED
Messaging:  ACTIVE | PRACTICE_PAUSED | ALL_PAUSED
Safety:     CLEAR | HOLD
```

Onboarding, paket, mesaj tercihi ve safety birbirinden bağımsız alanlardır.
Membership aktif/sıradaki paketlerden türetilir; paket sona erdiğinde profil veya
onboarding durumu değişmez.

### 8.2 Ödeme

```text
PENDING -> REVIEW -> APPROVED
                 -> ACTION_REQUIRED -> REVIEW
APPROVED -> REFUNDED
```

`APPROVED` yalnızca admin use-case'iyle oluşabilir.
`approvePaymentAndCreateSubscription` command'i payment, subscription, dört credit,
audit ve outbox kayıtlarını atomik oluşturur. Ödeme bağımsız admin paket tanımı
ayrı command'dir. `REFUNDED` paket iptal etmez.

### 8.3 Paket

```text
SCHEDULED -> ACTIVE -> EXPIRED
                  \-> CANCELLED
```

Yeni paket aktif dönem varsa onun bitiminden sonraki gün başlar.

### 8.4 Pratik

```text
SCHEDULED -> REMINDED -> AWAITING_RESPONSE
                            |-> COMPLETED
                            |-> SKIPPED
                            \-> MISSED (yerel gün sonunda)
SCHEDULED | REMINDED -> CANCELLED | SUPPRESSED
```

`CANCELLED` plan/paket değişikliğini, `SUPPRESSED` gönderim politikası veya
pause/safety nedeniyle bilinçli göndermemeyi gösterir; ikisi de `MISSED` sayılmaz.

Admin cancel command'i yalnızca `start_at > now` olan `SCHEDULED/REMINDED`
seansları `CANCELLED` yapar; seans ve bağlı message intent satırlarını kilitleyip
intent'leri aynı transaction'da `SUPPRESSED` yapar ve iptal bildirimi outbox kaydı
üretir. Range cancel, öğrenci yerel `DATE`
aralığı ve opsiyonel slot kimliğiyle satırları kilitleyerek çalışır.

Restore yalnızca `CANCELLED`, başlangıcı geçmemiş, aktif pakete bağlı ve
snapshot `plan_version_id` güncel olan seansı `SCHEDULED` durumuna getirir. Eski
intent yeniden kullanılmaz; yeni idempotency sürümlü reminder/check-in intent'leri
ve restore bildirimi outbox kaydı oluşturulur. Başlamış/tamamlanmış, eski plan sürümündeki veya paket dışı seans
restore edilemez. Cancel/restore command'leri zorunlu reason, request idempotency
key, optimistic version ve audit diff taşır.

### 8.5 Görüşme

```text
SCHEDULED -> COMPLETED | NO_SHOW | CANCELLED
SCHEDULED -- RESCHEDULED event --> SCHEDULED
```

Her `weekly_meeting` dört logical entitlement slotundan biridir. `COMPLETED` ve
`NO_SHOW` append-only credit consume; durum düzeltmesi reversal event'i üretir.
Yeniden planlama current status'u terminal yapmaz ve hakkı tüketmez.

### 8.6 Handoff ve Safety

```text
Handoff: OPEN -> RESOLVED
Safety:  OPEN -> ACKNOWLEDGED -> CLOSED
```

Safety state normal handoff'tan daha yüksek önceliklidir ve tüm proaktif işleri
pause eder.

### 8.7 Veri Silme

```text
REQUESTED -> APPROVED -> RUNNING -> COMPLETED
          \-> REJECTED
APPROVED | RUNNING -> FAILED -> RUNNING
```

Her çalışma kapsam, silinen/ayrıştırılan veri setleri, obje anahtarları,
external processor sonucu ve hata kodlarını içeren deletion manifest üretir.
Aktif veri için 7 gün SLA, yedek yaşam döngüsü için 30 gün izlenir ve
tamamlanınca öğrenci politika kapısından bilgilendirilir.

### 8.8 Kanal Kimliği

```text
DISCOVERED -> VERIFIED -> ACTIVE -> BLOCKED
                     \-> REVOKED
BLOCKED -> ACTIVE (provider tarafında yeniden başlatma ve doğrulama)
```

İlk kayıt akışını tamamlayan kimlik default olur. İkinci kanal yalnızca
single-use link token ile aynı `student_id` altında `VERIFIED` olabilir. Default
değişikliği optimistic version ve audit ile yapılır; `BLOCKED/REVOKED` kimlik
default olamaz.

## 9. Kanal Webhook Akışları

### 9.1 Endpoint'ler

- `GET /webhooks/whatsapp`: Meta challenge doğrulaması
- `POST /webhooks/whatsapp`: mesaj ve status webhook'u
- `POST /webhooks/telegram`: Telegram update webhook'u

### 9.2 WhatsApp Kabul Pipeline'ı

1. Request boyutu ve content type kontrol edilir.
2. NestJS JSON parse öncesinde saklanan ham request byte'larının HMAC-SHA256
   değeri `WHATSAPP_APP_SECRET` ile hesaplanır ve `X-Hub-Signature-256` sabit
   zamanda karşılaştırılır. GET challenge için ayrı verify token kullanılır.
3. Batch içindeki tüm message/status kayıtları normalize edilir.
4. Gelen mesaj ve delivery event kendi bileşik anahtarlarıyla duplicate kontrolünden geçer.
5. Minimal `webhook_events`, `inbox_events` ve `messages` kaydı transaction içinde yazılır.
6. Outbox relay ilgili domain processing job'unu ekler.
7. Meta timeout'una girmeden `200` döndürülür.

Telefon, mesaj metni ve tokenlar application log'una yazılmaz. Her request için
correlation ID üretilir.

HTTP cevap matrisi:

| Durum | HTTP | Sonuç |
| --- | ---: | --- |
| Geçerli imza ve inbox'a kalıcı yazım | `200` | Domain işlemi worker'da |
| Duplicate veya desteklenmeyen geçerli event | `200` | Tekrar işlenmez/ignored kaydı |
| Geçersiz imza | `401` | Payload saklanmaz, sampled security metric/log |
| Body limiti aşıldı | `413` | İşlenmez |
| Geçerli imza fakat bozuk JSON | `400` | İşlenmez |
| Inbox/DB geçici kullanılamıyor | `503` | Provider retry'ine bırakılır |

Kalıcı inbox yazımından sonra oluşan domain/worker hatasında webhook'a `5xx`
dönülmez; iç retry/dead-letter kullanılır. Provider'ın backoff aralığına
uygulama mantığı bağlanmaz. Geçersiz imza logunda payload, signature veya
harici kullanıcı kimliği bulunmaz; başarısız doğrulamalar için ayrı edge rate
limit uygulanır, doğrulanmış provider trafiğine genel API limiti uygulanmaz.

### 9.3 Telegram Kabul Pipeline'ı

1. Request boyutu/content type kontrol edilir.
2. `X-Telegram-Bot-Api-Secret-Token`, `TELEGRAM_WEBHOOK_SECRET` ile sabit zamanda karşılaştırılır.
3. `update_id`, private `chat.id`, `from.id`, message/callback kimliği ve metin normalize edilir.
4. Grup, supergroup, channel ve desteklenmeyen update türleri `200 ignored` olur.
5. `(channel_account_id, update_id)` duplicate kontrolü ve kalıcı inbox yazımı yapılır.
6. Outbox relay domain processing job'unu ekler ve Telegram'a hızlı `200` dönülür.

Telegram webhook `setWebhook` çağrısı `secret_token`, izinli update türleri ve
kontrollü `max_connections` ile deployment job'unda kurulur. Bot token kaynak
kod/DB'de tutulmaz. Telegram'ın başarısız non-2xx webhook'u tekrar gönderebilmesi
nedeniyle aynı inbox/outbox ilkeleri uygulanır.

### 9.4 Mesaj Routing Önceliği

Safety detector her gelen metin için routing'den bağımsız fan-out olarak çalışır;
bir mesaj hem kritik komutu uygular hem safety alert açabilir. Domain routing:

1. `VERİLERİMİ SİL`, `RIZA İPTAL`, `MESAJ İZNİ İPTAL`, `TÜMÜNÜ DURDUR`, `PRATİĞİ DURDUR`, `DEVAM`
2. Kayıt/ödeme/program deterministic state machine
3. Reply-context ile beklenen practice check-in/reflection cevabı
4. `DESTEK` ve `PROGRAM DEĞİŞTİR`
5. Açık handoff yoksa ve `AGENT_REPLY_AI` izni varsa stage-filtered knowledge retrieval
6. Kaynak eşiğini geçerse güvenli `AGENT_REPLY`, geçmezse `KNOWLEDGE_NOT_FOUND` handoff
7. Güvenli deterministic fallback/handoff

Kritik komutlar LLM intent sonucuna bırakılmaz. Normalize edilmiş açık komut ve
button payload'ları kullanılır. Açık handoff yalnızca serbest agent yanıtını
engeller; kritik komutlar ve deterministik pratik takibi devam eder.

### 9.5 Medya

- MVP yalnızca ödeme dekontu için izinli image/PDF türlerini indirir.
- Ödeme dekontu için maksimum dosya boyutu **10 MiB**, bilgi bankası dokümanı için
  dosya başına **25 MiB**, çoklu bilgi bankası isteği için toplam **100 MiB** olur.
- Provider metadata'sındaki boyut indirme öncesi kontrol edilir; eksik veya güvenilmezse
  stream hard-limit aşımında bağlantı kesilir ve kısmi obje silinir.
- API gateway/body parser, multipart parser, provider fetch adapter ve S3 upload katmanı
  aynı veya daha dar limitleri uygular; yalnızca `Content-Length` değerine güvenilmez.
- MIME, boyut ve dosya imzası doğrulanır; SVG, executable, arşiv ve aktif PDF içeriği reddedilir.
- Dosya karantina alanında malware/decompression-bomb taramasından sonra private S3 deposuna alınır.
- Admin indirmesi `Content-Disposition: attachment` ve `nosniff` ile sunulur.
- Sesli mesaj indirilmez veya saklanmaz.
- Dekont ödeme onayından 30 gün sonra silme job'u alır.

## 10. Giden Mesaj, Send Policy ve Outbox

Domain use-case'i doğrudan kanal API'si çağırmaz. Önce benzersiz `message_intent`
ve transactional `outbox_event` oluşturur. Outbox relay pg-boss job'unu ekler ve
relay durumunu aynı idempotency key ile izler.

Örnek idempotency anahtarları:

```text
practice:{sessionId}:reminder
practice:{sessionId}:checkin
meeting:{meetingId}:reminder:24h
meeting:{meetingId}:reminder:1h
subscription:{periodId}:renewal:3d
payment:{paymentId}:approved
```

Merkezi send-policy gate, kanal API çağrısından hemen önce intent satırını kilitler ve
şunları yeniden kontrol eder:

- Öğrenci silinmemiş, ilgili paket aktif ve messaging preference uygun
- Safety hold yok ve intent'in plan/aggregate sürümü halen güncel
- `due_at <= now < expires_at`; geç kalmış reminder topluca gönderilmez
- `students.default_channel_identity_id` doğrulanmış/aktif ve ilgili kanal opt-in'i aktif
- Intent oluştuktan sonra varsayılan kanal değiştiyse henüz claim edilmemiş intent
  yeni kimliğe version kontrolüyle resolve edilir; gönderilmiş intent kopyalanmaz
- WhatsApp için `last_inbound_at` son 24 saat içindeyse serbest yanıt, dışındaysa
  yalnızca onaylı template adı/dili/sürümü ve doğrulanmış parametreler kullanılır
- Telegram için private chat bot tarafından başlatılabilir olmalı ve identity `BLOCKED` olmamalı

Koşulu geçmeyen intent neden koduyla `SUPPRESSED` olur. Admin reply aynı kapıdan
ve varsayılan kanaldan geçer; WhatsApp outbound template serbest mesaj penceresini
açmaz. pg-boss harici HTTP side effect için exactly-once garanti etmez. Provider
isteği kabul etmiş olabileceği halde response alınamazsa intent `DELIVERY_UNKNOWN`
olur; provider sorgusu/webhook ile reconcile edilmeden kör retry yapılmaz.

Bir kanalın policy/auth/delivery hatası diğer kanala otomatik fallback yapmaz.
Kanal değişikliği doğrulanmış link ve açık default-channel değişikliği gerektirir.

Telegram `sendMessage` başarısı `SENT` anlamına gelir; Bot API genel kullanıcı
mesajları için WhatsApp benzeri `DELIVERED/READ` durumu sağlamadığından bu
durumlar uydurulmaz. Uzun metinler Unicode/code-block sınırını bozmadan kanal
limitine bölünür, parse mode hatasında yalnızca güvenli plain-text fallback
uygulanır. Provider `retry_after` bildirirse queue schedule buna uyar; bot blocked
gibi kalıcı hatada identity `BLOCKED` olur.

### 10.1 Çoklu Dil ve Locale Stratejisi

- MVP içerik dili `tr-TR` olur; öğrenci ve admin profilinde `preferred_locale`
  BCP 47 etiketi olarak tutulur. Saat dilimi locale'den ayrı kalır.
- Locale çözümleme sırası öğrenci tercihi, kanal kimliği tercihi, sistem varsayılanı
  `tr-TR` şeklindedir. Bölgesel varyant bulunamazsa önce ana dile, sonra `tr-TR`
  fallback yapılır.
- System event anahtarları dilden bağımsızdır. Standart mesaj sürümü, WhatsApp
  template binding'i, bilgi dokümanı ve prompt gerektiğinde locale taşır.
- WhatsApp template language code ile seçilen mesaj locale'i tam eşleşir; sessiz
  otomatik çeviri yapılmaz. Eksik protected/safety locale'i publish edilemez ve
  onaylı `tr-TR` fallback kullanılır.
- Admin arayüz metinleri anahtar tabanlı katalogdan gelir; kullanıcı tarafından
  yönetilen standart mesajlar DB'de locale bazlı sürümlenir. Backend hata kodları
  kararlı ve dilden bağımsız olur.
- LLM compliance ve safety metinlerini kendiliğinden çeviremez. Yeni dil açılması
  çeviri incelemesi, Meta template onayı, RAG eval set'i ve E2E locale testleri gerektirir.

## 11. Job ve Zamanlama Planı

### 11.1 Queue'lar

- `message.send`
- `message-catalog.provider-sync`
- `message-catalog.publish-check`
- `whatsapp.media.fetch`
- `telegram.webhook-reconcile`
- `channel.link-expire`
- `practice.reminder`
- `practice.checkin`
- `practice.close-day`
- `subscription.renewal-reminder`
- `subscription.activate`
- `subscription.expire`
- `meeting.calendar-create`
- `meeting.calendar-update`
- `meeting.reminder-24h`
- `meeting.summary-3h`
- `meeting.reminder-1h`
- `llm.reflection-tagging`
- `llm.weekly-summary`
- `knowledge.document-parse`
- `knowledge.document-index`
- `knowledge.publish`
- `payment.proof-delete`
- `privacy.retention-delete`
- `privacy.deletion-request`
- `calendar.incremental-sync`
- `calendar.reconcile`
- `outbox.relay`

### 11.2 Retry Politikası

- 4xx validation/auth hataları otomatik sonsuz tekrar edilmez.
- 429/5xx/network hataları exponential backoff ile sınırlı denenir.
- Son hata dead-letter/admin operasyon listesine gider.
- LLM bir kez primary retry, ardından fallback uygular.
- Her retry aynı domain idempotency anahtarını taşır.

Her queue için versioned payload `schemaVersion`, retry/timeout/expiration,
dead-letter ve retention ayarı migration ile tanımlanır. Worker deploy'u en az
N/N-1 payload'ı okuyabilir; uyumsuz değişiklikte queue drain/pause uygulanır.
SIGTERM'de yeni iş alımı durur, aktif işler sınırlı sürede tamamlanır ve lock
süreleri deployment timeout'uyla uyumlu olur. pg-boss schema upgrade'i ayrı
migration adımı ve connection budget ile izlenir.

### 11.3 Pratik Üretimi

Paket aktivasyonunda o döneme ait tüm sabah/akşam practice session kayıtları ve
job'ları oluşturulur. İlk pakette süre gün 1-7 için 15, 8-14 için 20, 15-21 için
25, kalan günler için 30 dakikadır. Sonraki paketler 30 dakika başlar.

Her session için öğrencinin IANA saat diliminde `start_at` hesaplanır:

```text
end_at          = start_at + duration_minutes
reminder_due_at = start_at - 10 minutes
checkin_due_at  = end_at + 10 minutes
response_expiry = local service date end
```

Reminder ve check-in intent'leri kendi `expires_at` değerinden sonra gönderilmez.
Button/reply-context nonce doğrudan session'a bağlanır. Bağlamsız `Yaptım`
yalnızca tek uygun session varsa uygulanır; birden fazla adayda seçim istenir.

Plan değişikliğinde yalnızca başlamamış session'lar `CANCELLED` yapılıp yeni
plan sürümüne göre tekrar oluşturulur. Eski job iptaline ek olarak send-time
plan-version kontrolü uygulanır. Pause/safety nedeniyle gönderilmeyen session
`SUPPRESSED` olur ve kaçırılmış pratik sayılmaz.

## 12. Google Calendar ve Meet

### 12.1 OAuth

- Admin Google hesabı OAuth ile bağlanır.
- Calendar için gerekli en dar scope, `access_type=offline`, state ve PKCE kullanılır.
- Refresh token application-level şifreli saklanır.
- Bağlantı durumu ve son başarılı sync admin panelinde görünür.
- OAuth projesi canlıda `Production` publishing durumunda ve gerekiyorsa
  doğrulanmış olmalıdır; `Testing` refresh token'ıyla canlıya çıkılmaz.
- Token revoke/refresh hatası entegrasyonu `RECONNECT_REQUIRED` yapar, admini
  uyarır ve Calendar işlerini dead-letter'a atmadan kontrollü bekletir.

### 12.2 Seri Oluşturma

1. Paket ve ilk görüşme admin tarafından oluşturulur.
2. Worker Google'ın base32hex karakter kısıtına uyan deterministik event ID üretir.
3. Haftalık, toplam dört occurrence recurrence kuralı kullanılır.
4. Recurrence IANA `timeZone` taşır; dört occurrence paket tarih aralığında olmalıdır.
5. `conferenceDataVersion=1` ve benzersiz create request ile Meet oluşturulur.
6. Conference durumu `PENDING/READY/FAILED` olarak saklanır; worker son tarihe
   kadar bounded poll/retry yapar, sonra admin uyarısı ve manuel URL override sunar.
7. Parent event ID, Meet URL ve sync sürümü `meeting_series` kaydına yazılır.
8. Instances listelenir; her logical `weekly_meeting` kaydına Google instance ID,
   `originalStartTime` ve `etag` bağlanır.

Tek recurring event serisi aynı Meet bağlantısını dört occurrence için kullanır.
Yeni paket yeni event ve yeni conference üretir. Ayrı event'ler arasında Meet
conference data kopyalanmaz.
Tek görüşme değişikliği parent recurrence'ı değil ilgili instance'ı `etag`
kontrolüyle günceller ve conference data'yı korur. Meet URL `READY` değilse link
içeren reminder gönderilmez; admin en geç reminder deadline'ından önce uyarılır.

### 12.3 Kaynak Gerçeklik

Portal veritabanı görüşme tarihleri için source of truth'tur. Admin portalındaki
değişiklik DB transaction'ından sonra Calendar sync job'u üretir. Calendar'da
dışarıdan yapılan değişiklikler otomatik kabul edilmez; discrepancy admin
uyarısı oluşturur.

İlk bağlantıda full sync ve sayfalama yapılır, `nextSyncToken` şifreli entegrasyon
state'inde tutulur. Incremental sync düzenli çalışır; `410 Gone` durumunda token
silinip full resync yapılır. `events.watch` kullanılırsa channel expiry yenilenir
ancak bildirim kaybı ihtimaline karşı periyodik reconciliation devam eder. Farklar
otomatik DB'ye alınmaz; occurrence ID, original start ve etag ile admin uyarısına
dönüşür.

## 13. LLM Teknik Tasarımı

### 13.1 Adapter

```text
LlmProviderAdapter.generateStructured(task, input, modelConfig)
```

İlk adapter Gemini Paid Services'tir. Registry modeli provider-specific ID ile
tutar. API key yalnızca env/secret referansından okunur.
Admin serbest base URL veya secret alias tanımlayamaz. Kodla gelen provider adapter,
base URL ve izinli secret alias allowlist'i kullanılır; private/link-local IP,
DNS rebinding ve cross-host redirect engellenir. Bağlantı testi sentetik, kişisel
veri içermeyen payload kullanır.

### 13.2 Model Çözümleme

```text
task primary -> global default -> task fallback
```

Görevler:

- `REFLECTION_TAGGING`
- `WEEKLY_SUMMARY`
- `AGENT_REPLY`
- `KNOWLEDGE_EMBEDDING`
- `RAG_QUERY_REWRITE` (varsayılan kapalı)
- `RAG_RERANK` (varsayılan kapalı)

### 13.3 Güvenli Payload

- Göreve uygun `REFLECTION_AI` veya `AGENT_REPLY_AI` rızası her çağrıdan önce server-side kontrol edilir.
- Ad, telefon, ödeme, Meet URL ve DB ID payload'a eklenmez.
- Telefon/e-posta gibi belirgin PII maskelenir.
- Rastgele operation ID kullanılır.
- Maskeleme sürümü usage metadata'sına yazılır.
- JSON schema/Zod dışında kalan model çıktısı reddedilir.
- LLM çıktısı doğrudan kritik domain command'e dönüşmez.
- Agent yanıtı intent allowlist, sağlık/tıbbi iddia filtresi, uzunluk sınırı ve
  versioned fallback politikasından geçer; geçersiz çıktı gönderilmez ve handoff açar.
- Rıza geri çekildiğinde yeni intent oluşturma durur; kuyruktaki AI işi de
  çağrı anında rızayı yeniden kontrol ederek `SUPPRESSED` olur.

### 13.4 Usage

Her çağrı için requested/actual model, provider, task, input/output/total ile
varsa cached/thinking/tool-use/modality tokenları, service tier, provider request
ID, immutable fiyat sürümü snapshot'ı, estimated USD cost, latency, fallback,
success/error ve correlation ID kaydedilir. Provider istek bazında gerçek maliyet
döndürmediği için alan `estimated_cost` olarak adlandırılır; gerekirse Cloud
Billing toplamlarıyla dönemsel reconciliation yapılır.

### 13.5 Budget

- Günlük ve aylık configurable USD bütçesi
- Yüzde 80 warning, yüzde 100 critical
- Opsiyonel hard limit
- Hard limit'te yalnızca AI job'ları pause
- Bekleyen işler admin onayıyla resume

Hard limit kontrolü transaction içinde günlük/aylık bucket satırını kilitler ve
`max_output_tokens` dahil azami tahmini maliyeti rezerve eder. Çağrı sonunda
rezervasyon usage metadata ile settle edilir; hata/timeout için expiration/reconcile
işi bulunur. Bütçe dönemlerinin saat dilimi konfigüre edilir ve varsayılan
`Europe/Istanbul` olur.

### 13.6 Prompt Yönetimi

Prompt kaynak gerçekliği Git içindeki
`packages/prompts/{task}/{semanticVersion}.md` dosyalarıdır. Her sürüm input
contract, output schema sürümü, model parametre sınırları ve test fixture'larıyla
review/deploy edilir. Deployment job'u prompt'u `llm_prompt_versions` tablosuna
`task`, semantic version, SHA-256, içerik ve schema version ile immutable kaydeder.

`llm_task_configs` prompt metni değil yalnızca onaylı `prompt_version_id` tutar.
Admin MVP'de ham prompt düzenleyemez; yayınlanmış sürümler arasında seçim ve
rollback yapabilir. Değişiklik yeni dosya/sürüm, pull request ve eval testi
gerektirir. Her AI sonucu prompt version/hash taşır; dinamik öğrenci/konuşma
verisi prompt sürümüne yazılmaz.

### 13.7 Bilgi Bankası ve RAG

Admin bir bilgi bankasına aynı anda birden fazla PDF, DOCX, Markdown veya TXT
dosyası yükleyebilir. Upload genel medya güvenlik/karantina hattından geçer;
parser ayrı kaynak limitli worker'da çalışır. OCR MVP dışıdır; metin
çıkarılamayan taranmış PDF `FAILED_TEXT_EXTRACTION` olur.

Ingestion pipeline:

```text
UPLOAD -> QUARANTINED -> PARSING -> CHUNKING -> EMBEDDING -> READY
READY -> PUBLISHED -> ARCHIVED
any processing state -> FAILED
```

- Başlık yapısını koruyan deterministic chunking ve overlap config sürümü kullanılır.
- Her chunk content hash, document version, title path, token count ve stage snapshot taşır.
- Embedding modeli LLM registry'den `KNOWLEDGE_EMBEDDING` göreviyle çözümlenir ve usage/budget'a yazılır.
- Varsayılan retrieval `pgvector cosine + PostgreSQL full-text/keyword` hybrid skorudur.
- `top_k`, `final_chunks`, `min_score`, max context ve retrieval config versioned config'dir.
- Rerank/query rewrite kapalı başlar; eval setiyle fayda kanıtlanırsa task bazında açılır.

Sorgu önce `GENERAL` ve öğrencinin güncel `curriculum_stage` atamasıyla SQL
seviyesinde filtrelenir; `PUBLISHED` olmayan doküman/chunk aday olamaz. Admin bir
dosyayı birden fazla stage'e atayabilir. En yüksek skor `min_score` altındaysa,
seçilen chunk yoksa, indeks/embedding kullanılamıyorsa veya kaynaklar çelişiyorsa
LLM cevabı üretilmez; `KNOWLEDGE_NOT_FOUND` handoff command'i çalışır.

Kaynak varsa prompt'a yalnızca final chunk'lar, güvenli operasyon snapshot'ı,
mevcut soru ve en fazla son 6 izinli normalize kanal mesajı eklenir. Context
builder payment/media, reflection, safety ve coach-note kategorilerini RAG agent
geçmişinden her durumda dışlar. RAG context
talimat değil alıntılan güvenilmeyen veri olarak delimiter içinde sunulur. Model
çıktısı `answer`, `supported`, `sourceChunkIds`, `handoffRequired`, `reasonCode`
şemasındadır. `supported=true` için tüm source kimlikleri retrieval sonucunda
bulunmalıdır; aksi halde yanıt gönderilmez ve handoff açılır.

`projects/whatsapp-agent` içindeki document/chunk/embedding, hybrid retrieval,
skor eşiği, diversify ve test-query yaklaşımı referans alınır. Portal;
`vector_json` fallback, raw query kopyası, raw payload logu ve serbest provider
URL/secret davranışlarını devralmaz.

### 13.8 Agent Reply Yetki Sınırı

`AGENT_REPLY` yalnızca `AGENT_REPLY_AI` izni aktif, safety hold/handoff kapalı ve
kanal send policy uygun olduğunda çalışır. İzinli alan bilgi bankasındaki genel
meditasyon/pratik açıklamaları, kayıt/paket süreci, mevcut programın okunması ve
uygulama kullanımıdır. Agent ödeme onaylayamaz, paket/program/görüşme
değiştiremez, kişiselleştirilmiş sağlık/tedavi yorumu veya bilgi bankasında
olmayan meditasyon tavsiyesi veremez.

Agent kişisel operasyon verisini yalnızca `student-context` read tool'u üzerinden
alır. Dekont, banka detayı, coach note, safety içeriği veya serbest DB sorgusu
modele verilmez.
Düşük güven, izin dışı intent, kaynak yetersizliği ve output validation
hatası sabit kısa mesajla `OPEN` handoff oluşturur.

### 13.9 Student Context Read Tool

LLM'e repository, Prisma client, SQL veya serbest tablo aracı verilmez. Tek tool
sözleşmesi typed backend facade'dır:

```text
get_student_context({
  sections: PRACTICE[] | MEETINGS[] | MEMBERSHIP[] | PAYMENT[] | ACCOUNT[],
  range: CURRENT_PACKAGE | LAST_30_DAYS | ALL_PAGED,
  cursor?: opaque,
  pageSize?: 1..100
})
```

`student_id`, tenant/account ve authorization scope tool argümanı değildir;
backend bunları doğrulanmış inbound channel identity ve aktif conversation'dan
enjekte eder. LLM başka student ID seçemez. Tool yalnızca allowlist section,
range ve pagination kabul eder; her section versioned Zod/JSON response schema'sı
taşır.

`PRACTICE` projection en az şunları döndürür:

- `asOf`, IANA timezone ve aktif paket tarihleri
- Aktif plan sürümü, sabah/akşam slotları, saat, süre ve pause durumu
- Seçilen range'deki session local date/time, slot, duration ve durum kayıtları
- Backend'in hesapladığı planned/completed/skipped/missed oran ve toplamları
- Sonraki uygun pratik ve pagination cursor

Varsayılan range `CURRENT_PACKAGE` olup o paketteki tüm session kayıtları
context'e alınabilir. `ALL_PAGED` tek prompt'a tüm geçmişi doldurmaz; sayfalı
okur ve toplam context token/row limitine uyar. LLM daha fazla sayfa isteyebilir,
ancak tool-call ve toplam context budget server tarafında sınırlıdır.

`MEETINGS`, `MEMBERSHIP`, `PAYMENT` ve `ACCOUNT` benzer typed projection'lardır.
Payment projection dekont/banka hareketi içermez; yalnızca öğrenciye gösterilebilir
status, tutar, currency, reference ve zamanları döndürür. Reflection varsayılan
section değildir; ileride ayrı scope olarak eklenirse her çağrıda `REFLECTION_AI`
rızası aranır.

Tool sonucu ham ORM row değil read model'dir. Internal ID, encryption metadata,
audit, silinmiş kayıt ve başka öğrenci verisi dönmez. Oran/tarih/süre gibi
deterministik hesaplar backend'de yapılır; LLM gerçekleri birleştirir ve doğal
dille açıklar. Cevap structured olarak kullanılan section, `asOf`, evidence record
referansları ve `answer` taşır; tool sonucu dışında sayı/tarih iddia edemez.

Genel meditasyon sorusu `search_knowledge_base`, kişisel operasyon sorusu
`get_student_context`, birleşik soru ise ikisini aynı `AGENT_CONTEXTUAL` çağrısında
kullanabilir. Her context read `agent_context_reads` kaydı oluşturur; payload
loglanmaz, section/range/asOf/record hash'leri/row count/latency ve answer referansı
tutulur.

`AGENT_REPLY_AI` izni yoksa tool LLM tarafından çağrılamaz. `PROGRAMIM`,
`GÖRÜŞMEM`, `PAKETİM`, `ÖDEMEM` exact command/button handler'ları aynı read-model
facade'ı backend içinden doğrudan çağırır; `STUDENT_CONTEXT_RESPONSE` event'i
ve section'a uygun standart mesaj intent'i üretir. Böylece AI rızası vermeyen
öğrenci temel hesap/program bilgisine erişmeye devam eder.

### 13.10 System Event ve Standart Mesaj Orkestrasyonu

Normatif MVP event key kataloğu:

```text
Registration/consent:
REGISTRATION_STARTED, PRIVACY_NOTICE_SENT, CHANNEL_OPT_IN_REQUEST,
REFLECTION_STORAGE_CONSENT_REQUEST, REFLECTION_AI_CONSENT_REQUEST,
AGENT_REPLY_AI_CONSENT_REQUEST, NAME_REQUEST, REGISTRATION_ALREADY_EXISTS,
CONSENT_WITHDRAWN

Payment/subscription:
PAYMENT_INSTRUCTIONS, PAYMENT_REPORTED, PAYMENT_ACTION_REQUIRED,
PAYMENT_APPROVED, PAYMENT_REFUNDED, STUDENT_ACTIVATED,
SUBSCRIPTION_SCHEDULED, SUBSCRIPTION_STARTED,
SUBSCRIPTION_RENEWAL_REMINDER, SUBSCRIPTION_EXPIRED, SUBSCRIPTION_CANCELLED

Practice:
PRACTICE_PLAN_CONFIRMATION_REQUEST, PRACTICE_PLAN_CONFIRMED,
PRACTICE_PLAN_UPDATED, PRACTICE_REMINDER, PRACTICE_CHECKIN,
PRACTICE_REFLECTION_REQUEST, PRACTICE_COMPLETED_ACK, PRACTICE_SKIPPED_ACK,
PRACTICE_RESPONSE_AMBIGUOUS, PRACTICE_CANCELLED, PRACTICE_RESTORED,
PRACTICE_PAUSED, PRACTICE_RESUMED

Meeting:
MEETING_SCHEDULED, MEETING_REMINDER_24H, MEETING_REMINDER_1H,
MEETING_RESCHEDULED, MEETING_CANCELLED, MEETING_COMPLETED,
MEETING_NO_SHOW, MEET_LINK_UNAVAILABLE

Knowledge/support:
STUDENT_CONTEXT_RESPONSE, KNOWLEDGE_NOT_FOUND, HANDOFF_OPENED, HANDOFF_RESOLVED, AGENT_UNAVAILABLE,
UNKNOWN_MESSAGE_FALLBACK, UNSUPPORTED_MEDIA

Channel:
CHANNEL_LINK_REQUESTED, CHANNEL_LINK_CONFIRMED, DEFAULT_CHANNEL_CHANGED,
CHANNEL_OPT_IN_WITHDRAWN, MESSAGING_PAUSED, MESSAGING_RESUMED,
CHANNEL_DELIVERY_FAILED

Privacy/safety:
DELETION_REQUEST_RECEIVED, DELETION_REQUEST_APPROVED,
DELETION_REQUEST_REJECTED, DELETION_COMPLETED,
SAFETY_STUDENT_GUIDANCE, SAFETY_ALERT_CLOSED

Admin:
ADMIN_PAYMENT_REVIEW_REQUIRED, ADMIN_SUBSCRIPTION_EXPIRING,
ADMIN_WEEKLY_SUMMARY_READY, ADMIN_HANDOFF_REQUIRED, ADMIN_SAFETY_ALERT,
ADMIN_DELETION_REQUEST, ADMIN_MESSAGE_DELIVERY_FAILED,
ADMIN_CALENDAR_DISCREPANCY, ADMIN_KNOWLEDGE_INDEX_FAILED
```

Event eklemek code change, schema migration/seed ve contract testi gerektirir.
Admin yalnızca desteklenen event'e mesaj definition/variant bağlar. `CUSTOM_MANUAL`
tek alıcılı admin command'idir; domain event değildir ve otomatik trigger olamaz.
Privacy/consent, safety, deletion ve finansal yönerge event'leri `protected` olur;
admin event/variable schema'yı veya uzman-onay durumunu değiştiremez, yalnızca
onaylı message version seçebilir.

Variant resolver sırası:

```text
event + audience + channel + language + stage + slot
event + audience + channel + language + GENERAL
event + audience + channel default published variant
code-seeded protected fallback
```

Aynı specificity içinde yüksek `priority`, sonra en yeni effective published
version seçilir. Aynı öncelikte birden fazla aktif sonuç publish constraint'iyle
reddedilir. Render motoru yalnızca event JSON schema'sındaki değişkenleri ve
logic-less placeholder'ları kabul eder; HTML/script, serbest expression, SQL veya
template içinden provider/API çağrısı yoktur. Eksik zorunlu variable render'ı
fail eder, mesaj gönderilmez ve admin alarmı oluşur.

WhatsApp provider binding `template_name`, language, category, Meta status,
provider version ve last synced time taşır. Pencere dışı intent yalnızca
`APPROVED` binding kullanır. Telegram/local reactive varyant provider approval
gerektirmez ancak aynı publish/audit sürecinden geçer.

Inbound routing transaction'ı her mesaj için tek `response_owner` belirler:

```text
SYSTEM_STANDARD_MESSAGE | AGENT_CONTEXTUAL | ADMIN_HANDOFF | NO_REPLY
```

- Button/exact command/expected state cevabı domain command'i çalıştırır,
  system event occurrence ve standart message intent'ini aynı transaction'da
  oluşturur; LLM çağrılmaz.
- Belirsiz doğal dil için opsiyonel intent classifier yalnızca
  `{proposedIntent, confidence, requiredConfirmation}` döndürür.
- Payment approval/refund, consent withdrawal, deletion, channel switch,
  practice cancel/restore, pause/resume, schedule/meeting change ve safety gibi
  state-changing command'ler LLM önerisiyle doğrudan uygulanmaz.
- Yüksek güvenli allowlist intent bile standart confirmation event/button üretir;
  öğrenci onayından sonra command ve standart sonuç mesajı çalışır.
- System event inbound mesajı tüketirse aynı mesaj için `AGENT_REPLY` job'u
  oluşturulmaz. Event yoksa `AGENT_CONTEXTUAL` kişisel read-model ve/veya RAG
  kullanır; gerekli veri/kaynak yoksa handoff response owner olur.
- Safety detector bağımsız admin alert side effect'i üretebilir; bu ikinci bir
  öğrenci response owner sayılmaz. Öğrenciye gidecek cevapta safety standard
  message en yüksek önceliğe sahiptir ve diğer student-facing mesaj intent'leri
  aynı inbound için oluşturulmaz.
- Bir mesaj hem event hem serbest soru içeriyorsa MVP event'i uygular ve yalnızca
  standart event cevabını gönderir; aynı turda RAG cevabı eklenmez.

Bu kural bir öğrenci mesajına hem standart mesaj hem generatif agent cevabı
gönderilmesini ve LLM'in kritik state değişikliği yapmasını engeller.

## 14. REST API Taslağı

Tüm admin endpoint'leri `/v1/admin` altında, public entegrasyon endpoint'leri
ayrı namespace altında tutulur.

### 14.1 Auth

- `POST /v1/auth/login`
- `POST /v1/auth/totp/verify`
- `POST /v1/auth/logout`
- `GET /v1/auth/session`

### 14.2 Öğrenci ve Paket

- `GET /v1/admin/students`
- `GET /v1/admin/students/:id`
- `PATCH /v1/admin/students/:id`
- `GET /v1/admin/students/:id/subscriptions`
- `POST /v1/admin/students/:id/subscriptions`
- `GET /v1/admin/students/:id/practice-plan`
- `POST /v1/admin/students/:id/practice-plan/versions`
- `PUT /v1/admin/students/:id/messaging-preference`
- `POST /v1/admin/students/:id/consents/:scope/withdraw`
- `POST /v1/admin/students/:id/channel-opt-ins/:channelIdentityId/withdraw`
- `GET /v1/admin/students/:id/channels`
- `POST /v1/admin/students/:id/channels/link-token`
- `PUT /v1/admin/students/:id/default-channel`
- `PUT /v1/admin/students/:id/curriculum-stage`
- `GET /v1/admin/schedule-change-requests`
- `POST /v1/admin/schedule-change-requests/:id/resolve`
- `POST /v1/admin/practice-sessions/:id/correct`
- `POST /v1/admin/practice-sessions/:id/cancel`
- `POST /v1/admin/practice-sessions/:id/restore`
- `POST /v1/admin/students/:id/practice-sessions/cancel-range`

### 14.3 Ödeme

- `GET /v1/admin/payments`
- `POST /v1/admin/payments/:id/approve`
- `POST /v1/admin/payments/:id/action-required`
- `POST /v1/admin/payments/:id/adjustments`
- `POST /v1/admin/subscriptions/:id/cancel`

`payments/:id/approve`, paket başlangıç tarihi ve idempotency key alarak
onay+paket+credit+audit+outbox işlemini atomik yapar. Ödeme olmadan paket tanımlama
`students/:id/subscriptions` endpoint'inde ayrı gerekçe ister.

### 14.4 Görüşme

- `GET /v1/admin/meetings`
- `POST /v1/admin/subscriptions/:id/meeting-series`
- `PATCH /v1/admin/meetings/:id`
- `POST /v1/admin/meetings/:id/status`
- `GET /v1/admin/meetings/:id/summary`
- `PUT /v1/admin/meetings/:id/coach-note`
- `POST /v1/admin/meeting-series/:id/reschedule`
- `GET /v1/admin/integrations/google-calendar`
- `POST /v1/admin/integrations/google-calendar/connect`
- `POST /v1/admin/integrations/google-calendar/reconnect`
- `POST /v1/admin/integrations/google-calendar/reconcile`

### 14.5 Konuşma ve Operasyon

- `GET /v1/admin/conversations`
- `GET /v1/admin/conversations/:studentId/messages`
- `POST /v1/admin/conversations/:studentId/reply`
- `GET /v1/admin/handoffs`
- `POST /v1/admin/handoffs/:id/resolve`
- `GET /v1/admin/safety-alerts`
- `POST /v1/admin/safety-alerts/:id/acknowledge`
- `POST /v1/admin/safety-alerts/:id/close`
- `GET /v1/admin/deletion-requests`
- `POST /v1/admin/deletion-requests/:id/approve`
- `POST /v1/admin/deletion-requests/:id/reject`
- `GET /v1/admin/deletion-requests/:id/status`
- `GET /v1/admin/failed-jobs`
- `POST /v1/admin/failed-jobs/:id/retry`
- `POST /v1/admin/failed-jobs/:id/suppress`

### 14.6 LLM

- `GET /v1/admin/llm/providers`
- `POST /v1/admin/llm/providers/:adapterId/enable`
- `GET/POST /v1/admin/llm/models`
- `POST /v1/admin/llm/models/:id/test`
- `GET/PUT /v1/admin/llm/task-configs`
- `GET /v1/admin/llm/usage`
- `GET/PUT /v1/admin/llm/budget`
- `POST /v1/admin/llm/jobs/:id/retry`
- `GET /v1/admin/llm/context-reads`
- `GET /v1/admin/llm/prompt-versions`
- `PUT /v1/admin/llm/task-configs/:task/prompt-version`

### 14.7 Bilgi Bankası

- `GET/POST /v1/admin/knowledge-bases`
- `GET/PATCH /v1/admin/knowledge-bases/:id`
- `POST /v1/admin/knowledge-bases/:id/documents` (multipart, çoklu dosya)
- `GET /v1/admin/knowledge-bases/:id/documents`
- `GET /v1/admin/knowledge-document-versions/:id`
- `POST /v1/admin/knowledge-document-versions/:id/reindex`
- `POST /v1/admin/knowledge-document-versions/:id/publish`
- `POST /v1/admin/knowledge-document-versions/:id/archive`
- `PUT /v1/admin/knowledge-document-versions/:id/stages`
- `POST /v1/admin/knowledge-bases/:id/test-search`
- `GET /v1/admin/rag-query-logs`

### 14.8 Kanal Operasyonu

- `GET /v1/admin/channel-accounts`
- `GET /v1/admin/channel-health`
- `POST /v1/admin/channel-identities/:id/block`
- `POST /v1/admin/channel-identities/:id/unblock`
- `POST /v1/admin/channel-link-tokens/:tokenId/revoke`

### 14.9 System Events ve Standart Mesajlar

- `GET /v1/admin/system-events`
- `GET /v1/admin/system-events/:eventKey`
- `GET/POST /v1/admin/standard-messages`
- `GET/PATCH /v1/admin/standard-messages/:id`
- `POST /v1/admin/standard-messages/:id/variants`
- `POST /v1/admin/standard-message-variants/:id/versions`
- `POST /v1/admin/standard-message-versions/:id/preview`
- `POST /v1/admin/standard-message-versions/:id/test-send`
- `POST /v1/admin/standard-message-versions/:id/publish`
- `POST /v1/admin/standard-message-versions/:id/archive`
- `POST /v1/admin/standard-message-variants/:id/rollback`
- `PUT /v1/admin/standard-message-variants/:id/provider-binding`
- `POST /v1/admin/provider-template-bindings/:id/sync`
- `POST /v1/admin/standard-messages/custom-manual-send`

### 14.10 Feature Flags ve Bildirim Ayarları

- `GET /v1/admin/feature-flags`
- `PATCH /v1/admin/feature-flags/:key`
- `GET /v1/admin/feature-flags/:key/evaluations`
- `GET /v1/admin/notification-deliveries`
- `POST /v1/admin/notification-channels/email/test`

System event endpoint'leri read-only'dir. Publish/rollback/test-send/provider binding
ve protected message seçimi step-up TOTP, idempotency key ve audit metadata ister.
Test gönderimi yalnızca environment allowlist'indeki alıcıya gider ve production
event occurrence/öğrenci state'i oluşturmaz.

Mutating endpoint'ler request idempotency key ve audit metadata kabul eder.

## 15. Admin Authentication

- MVP tek admin hesabı
- Argon2id benzeri güçlü password hash
- TOTP ikinci faktör
- Tek kullanımlık hash'lenmiş recovery code'lar
- Server-side session ve HttpOnly/Secure/SameSite cookie
- CSRF koruması
- Login rate limit ve geçici lockout
- Session revoke ve son giriş görünümü
- TOTP secret application-level şifreli saklama
- 30 dakika idle ve 12 saat absolute session TTL; login/2FA sonrası session ID rotation
- Ödeme onayı/iade, paket iptali, veri silme, safety kapatma, protected mesaj
  sürümü seçimi ve provider template binding için son 10 dakika içinde TOTP step-up
- Bootstrap admin yalnızca tek kullanımlı deployment komutuyla oluşturulur; recovery kullanımı audit ve bildirim üretir
- Admin cevabında `Cache-Control: no-store`; dar CORS allowlist ve CSP/frame-ancestors koruması

Rol tabloları gelecekte `ADMIN`, `ASSISTANT`, `FINANCE` ayrımına izin verecek
şekilde hazırlanır; MVP yalnızca `ADMIN` kullanır.

## 16. Güvenlik Tasarımı

### 16.1 Secret Yönetimi

- Secret değerleri kaynak kod, DB veya admin API cevabında bulunmaz.
- Coolify deployment secret/env kullanılır.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` ve webhook HMAC için ayrı
  `WHATSAPP_APP_SECRET` zorunludur; config validation eksik secret'ta startup'ı durdurur.
- `TELEGRAM_BOT_TOKEN` ve ayrı `TELEGRAM_WEBHOOK_SECRET` zorunludur; bot token
  URL/log/error mesajında görünmez ve rotation webhook'u kontrollü yeniden kurar.
- Panel yalnızca secret referansı ve set/missing durumu gösterir.
- Rotation sonrası worker/API kontrollü restart edilir.

### 16.2 Hassas Veri

- TLS zorunlu
- Disk ve obje deposu encryption-at-rest
- Mesaj/reflection/coach note/TOTP/Google token alanlarında application encryption
- Telefon lookup için HMAC hash
- Signed URL kısa ömürlü ve admin yetkili
- Loglarda mesaj, telefon, token veya dekont URL'si yok

Ciphertext her kayıtta `key_id`/algoritma sürümü taşır. Kanal kimliği HMAC, içerik
encryption, TOTP/OAuth ve backup için ayrı key materyali kullanılır. Yeni key ile
yazma, kademeli rewrap, eski key'i devreden çıkarma ve restore escrow prosedürü
runbook'ta tanımlanır; rotasyon testi pilot öncesi yapılır.

### 16.3 Audit

Audit kaydı en az şu alanları taşır:

- Actor türü ve kimliği
- İşlem ve hedef entity
- Önceki/yeni değerlerin güvenli diff'i
- Request/correlation ID
- IP/user agent
- Zaman

Hassas metnin tamamı audit diff'e kopyalanmaz.
Hassas konuşma, dekont, weekly summary, deletion ve safety kayıtlarını görüntüleme
de audit edilir; audit kaydı içeriği değil actor, amaç, entity ve zaman taşır.

### 16.4 Saklama ve Harici İşleyenler

Retention matrisi konuşma/pratik/AI içeriğine ek olarak yarım kalmış kayıtları,
onaysız dekontları, webhook/delivery metadata'sını, handoff/safety, LLM usage,
dead-letter ve audit kayıtlarını kapsar. Her satır hukuki dayanak, başlangıç
olayı, süre, silme/anonymize işlemi ve sahibi ile migration/config olarak
sürümlenir. Silinen domain kayıtlarına usage/audit bağları nullable veya ayrıştırılmış olur.

Admin tarafından yazılan bilgi dokümanları ve sürümleri arşivlenebilir; kalıcı
silme document object, extracted text, chunk ve embedding'leri kapsar. Audit ve
geçmiş agent yanıtı ilgili silinmiş chunk içeriğini kopyalamaz, yalnızca tombstone
kimliği/hash taşır. RAG query logu source message retention'ını aşmaz.

Meta, Telegram, Google Calendar/Meet, Gemini, S3, e-posta ve hata/observability servisleri
için veri kategorisi, amaç, bölge/yurt dışı aktarım, saklama, sözleşme/DPA ve
silme kabiliyeti içeren processor matrisi canlı öncesi onaylanır.

### 16.5 Feature Flag ve Kademeli Yayın

- Flag anahtarları ve tipleri kodda kayıtlıdır; admin serbest anahtar veya executable
  kural oluşturamaz. DB yalnızca etkinlik, varyant ve hedefleme konfigürasyonunu tutar.
- Kapsam `GLOBAL`, `CHANNEL`, `COHORT` veya `STUDENT` olabilir. Yüzdesel rollout,
  flag key + kararlı öğrenci UUID'si üzerinden deterministik hash ile yapılır; aynı
  öğrenci rollout süresince aynı varyantta kalır.
- Yeni riskli özellikler varsayılan `OFF` başlar; allowlist pilot, yüzde artışı ve
  genel açılış sırasıyla ilerler. Kanal/LLM/RAG/proaktif mesajlar için bağımsız kill
  switch bulunur.
- Flag değerlendirmesi request/job başında snapshot olarak kaydedilir. Job handler
  send-time'da kill switch'i tekrar kontrol eder; kapatılan özellik yeni side effect üretmez.
- Flag değişiklikleri step-up TOTP, gerekçe, effective time ve audit gerektirir;
  otomatik expiry/rollback zamanı tanımlanabilir.
- Feature flag rıza, yetkilendirme, safety, retention veya ödeme invariant'larını
  atlayamaz. Flag servisi erişilemezse güvenli kod varsayılanı uygulanır.

## 17. Safety Tasarımı

- Safety kontrolü her gelen metinde komut routing'inden bağımsız çalışır.
- Detector versioned, uzman onaylı kural/phrase setiyle deterministik başlar;
  LLM tek karar verici olmaz ve prompt injection metni talimat olarak uygulanmaz.
- Sabit yönlendirme metni versioned configuration'dır.
- Safety alert açılınca agent ve proaktif job'lar pause edilir.
- Admin e-posta ve ayrı WhatsApp hedefinden bilgilendirilir.
- Sistem 112 veya üçüncü kişiyi otomatik aramaz.
- Alert yalnızca admin tarafından kapatılır.
- Risk kuralları ve mesaj canlı öncesi uzman onayı olmadan aktif edilmez.

Safety mekanizması gerçek zamanlı insan izleme veya kriz hizmeti olarak sunulmaz.

## 18. Gözlemlenebilirlik

### 18.1 Log

- Pino JSON structured log; Coolify loglarından merkezi Loki/Grafana'ya aktarım
- Request/job correlation ID
- Environment, service, module, operation
- Güvenli error code; payload/metin yok

### 18.2 Metrik

NestJS/worker OpenTelemetry instrumentation kullanır. Prometheus-compatible
`/internal/metrics` yalnızca private network'ten erişilir; label'larda telefon,
öğrenci/mesaj ID veya hassas ve yüksek cardinality değer bulunmaz.

- API latency ve error rate
- Webhook kabul/duplicate/invalid signature
- Queue depth, lag, retry ve dead-letter
- WhatsApp sent/delivered/read/failed
- Telegram webhook/send/blocked/failed ve default-channel dağılımı
- Practice reminder zamanında gönderim oranı
- Calendar sync başarısı/gecikmesi
- LLM call/token/cost/latency/error/fallback
- Knowledge parse/index queue, chunk/embedding sayısı, RAG hit/miss/threshold,
  stage filtresi, retrieval latency ve `KNOWLEDGE_NOT_FOUND` handoff oranı
- Student-context tool call/section/range, row count, pagination, latency,
  policy denial, evidence validation ve context-token kullanımı
- Açık payment review, handoff, safety ve deletion request sayısı
- Admin e-posta sent/delivered/bounce/complaint/retry
- Feature flag evaluation ve varyant dağılımı; yalnızca düşük cardinality flag/varyant label'ları

### 18.3 Alarm

- Webhook hata oranı
- Queue lag eşik aşımı
- WhatsApp auth/template hatası
- Telegram webhook secret, bot auth, pending update ve blocked artışı
- Knowledge indexing failure ve RAG miss oranı artışı
- Calendar OAuth/token hatası
- Backup başarısızlığı
- LLM bütçe ve hata artışı
- Açık SafetyAlert
- Admin e-posta permanent bounce/complaint veya tüm kritik bildirim kanallarının başarısızlığı
- Feature flag beklenmeyen varyant dağılımı ve kill-switch sonrası side-effect denemesi

Grafana alert kuralları e-posta ve ayrı admin WhatsApp kanalına gider. Her alarm
için eşik, değerlendirme penceresi, sahibi, runbook URL'si ve susturma kuralı
kod/deploy konfigürasyonunda sürümlenir. Uygulama hataları Sentry-compatible hata
izlemeye payload/metin göndermeden raporlanır; log/metric/error retention ve erişim
rolleri ayrıca tanımlanır.

### 18.4 Admin Bildirim Kanalları

- İlk e-posta provider'ı AWS SES `eu-central-1` olur ve `AdminEmailAdapter`
  arkasından kullanılır. Sandbox'tan production access'e geçiş, doğrulanmış gönderen
  domaini, SPF, DKIM ve DMARC pilot ön koşuludur.
- Hedef adresler ve ayrı admin WhatsApp kimliği deployment secret/ayarlarından gelir;
  öğrenciye ait hassas serbest metin veya dekont e-postaya konmaz. Bildirim yalnızca
  olay türü, öncelik, zaman, pseudonymous referans ve admin panel deep-link'i taşır.
- `notification_deliveries` kanal, provider message ID, attempt, durum ve hata kodunu
  tutar. SES transient hataları exponential backoff ile retry edilir; permanent
  bounce/complaint hedefi devre dışı bırakır ve WhatsApp/admin-panel alarmı üretir.
- Safety gibi kritik bildirimler e-posta ve ayrı WhatsApp'a bağımsız intent olarak
  fan-out edilir; bir kanalın başarısı diğerinin hatasını gizlemez.

## 19. Test Stratejisi

### 19.1 Unit

- Tüm durum makineleri
- Paket tarih ve çakışma kuralları
- 15/20/25/30 dakika hesaplama
- Yerel gün sonu ve saat dilimi hesapları
- BCP 47 locale resolution, ana dil/`tr-TR` fallback ve eksik protected çeviri
- Deterministik feature flag hashing, precedence, expiry ve güvenli default
- Görüşme credit event hesaplama
- Rıza ve messaging preference policy
- LLM model resolution ve budget policy
- Curriculum stage ve document-stage visibility policy
- RAG score threshold/source validation ve knowledge-miss handoff
- Default channel resolution ve linked identity state machine
- Tekil/range practice cancel ve restore uygunluk kuralları
- Event variable schema, standart mesaj variant resolution ve publish çakışma kuralları
- Inbound başına tek response owner ve LLM intent-confirmation policy
- Student-context section/range authorization, pagination ve evidence validation

### 19.2 Integration

- PostgreSQL + Prisma repository
- Transaction içinde domain kaydı + pg-boss job
- Duplicate incoming message ve aynı `wamid` için sırasız delivery status'leri
- Retry/dead-letter
- Plan değişiminde gelecek session regeneration
- Retention ve deletion cascade
- Aynı öğrenci için eşzamanlı izin/ödeme/pratik olaylarında sıralama
- Pause ile send claim yarışı, provider success sonrası process crash ve `DELIVERY_UNKNOWN`
- Eşzamanlı LLM budget reservation ve limit aşımı
- Restore edilmiş stale outbox/pg-boss işlerinin suppression'ı
- Dosya boyutu metadata sahteciliği, streaming hard-limit ve kısmi obje cleanup
- Feature flag eşzamanlı rollout değişimi, job snapshot ve send-time kill switch
- Telegram duplicate/out-of-order `update_id`, geçersiz secret ve private-chat filtresi
- Kanal link token expiry/replay ve eşzamanlı default-channel değişikliği
- Doküman yeni sürüm publish sırasında eski/yeni index atomic visibility
- RAG stage filtresi, threshold altı sonuç ve kaynak kimliği uydurma reddi
- Range cancel ile send claim yarışı; restore sonrası yeni intent idempotency'si
- Aynı inbound için system event oluştuğunda `AGENT_REPLY` job'u oluşmaması
- Protected message publish/rollback authorization ve audit
- Event payload schema ihlali, eksik render variable ve eş-priority variant conflict
- LLM'in tool argümanıyla başka student seçememesi ve cross-student projection reddi
- `CURRENT_PACKAGE/ALL_PAGED` row-token limitleri, cursor replay ve tool-call budget
- Reflection scope'unun rıza olmadan context'e eklenmemesi

### 19.3 Provider Contract

- Meta webhook fixture'ları ve status event'leri
- WhatsApp send/template/media adapter mock server
- Meta template approval/binding status sync ve pencere dışı rejection
- Telegram Bot API send/webhook/block adapter mock server
- Google recurrence/conference pending/success/error
- Gemini structured output/token/error/fallback
- S3 upload/signed URL/lifecycle
- AWS SES send/bounce/complaint adapter contract
- Knowledge PDF/DOCX/Markdown parser ve embedding adapter contract

Mock contract testlerine ek olarak alıcı allowlist'li staging canary'leri Meta
template/status webhook, Telegram webhook/send/block, Google OAuth/Meet/recurring instance ve Gemini structured
output/usage metadata sözleşmelerini release öncesi doğrular.

### 19.4 E2E

1. WhatsApp/Telegram `KAYIT` -> kanal opt-in/kapsam bazlı rıza -> ad -> IBAN
2. `ÖDEME YAPTIM` -> admin approve -> paket -> program
3. Reminder -> check-in -> completed/skipped/missed
4. Paket yenileme ve inactive/reactivation
5. Dört görüşme, Calendar ve reminder'lar
6. Reflection -> AI tag -> weekly summary
7. `DESTEK`, admin reply ve resolve
8. Safety alert ve message pause
9. `VERİLERİMİ SİL` -> admin approve -> deletion
10. LLM hard limit ve deterministic fallback
11. `RIZA İPTAL` -> queued AI/agent işlerinin suppression'ı
12. WhatsApp 24 saat içi serbest yanıt ve pencere dışı template enforcement
13. Google token revoke, Calendar discrepancy ve Meet `FAILED` override
14. Backup restore -> deletion journal replay -> manuel worker unfence
15. Telegram `KAYIT` -> default Telegram -> paket/pratik/görüşme mesajları
16. WhatsApp öğrencisi -> Telegram link deep-link -> default kanal değişikliği
17. Stage uyumlu RAG cevabı -> source log; kaynak yok -> `KNOWLEDGE_NOT_FOUND` handoff
18. Bilgi dokümanı çoklu upload -> parse/index/test -> publish -> archive
19. Tekil/range practice cancel -> intent suppression -> uygun restore -> yeni intent
20. Doğal dil event intent -> standart confirmation -> command -> tek standart sonuç
21. System event tüketen inbound -> sıfır generatif reply; event yok -> context/RAG/handoff
22. Mesaj varyantı create/version/preview/test/publish/rollback ve protected kontrol
23. Pratik saati/ilerleme sorusu -> student-bound context -> kanıtlı contextual cevap
24. Kişisel plan + genel "neden" sorusu -> context + RAG -> tek contextual cevap
25. AI izni yok -> `PROGRAMIM` -> deterministic read-model -> standart context cevabı

100 öğrencinin aynı dakikadaki reminder burst'ü, duplicate webhook storm,
Meta/Google timeout ve worker rolling-deploy testleri pilot kapasite testine dahildir.

### 19.5 Admin UI

Playwright ile desktop ve mobile viewport'larda kritik ekranlar, metin taşması,
modal/form durumları, filtreler ve konuşma görünümü test edilir.
Standart mesaj editöründe izinli variable picker, hatalı placeholder, kanal preview,
variant conflict, protected read-only durumu ve publish/rollback akışı ayrı test edilir.
Locale fallback, eksik çeviri, uzun çeviri metni ve `tr-TR` dışındaki pilot locale
görünümleri de aynı viewport setinde doğrulanır.

### 19.6 Zaman Bağımlı İşlerin Test Stratejisi

Domain ve application katmanları iş zamanı için doğrudan `Date.now()`, `new Date()`
veya gerçek `setTimeout()` kullanmaz. Bütün zaman kararları aşağıdaki port üzerinden
verilir:

```ts
interface Clock {
  now(): Date;
}
```

- Production'da `SystemClock`, unit/component/E2E testlerinde paylaşılan `FakeClock`
  kullanılır. `FakeClock` en az `set`, `advanceBy` ve `advanceTo` işlemlerini sağlar.
- Planlayıcılar `now`, IANA timezone ve program sürümünü girdi alıp reminder,
  check-in, day-close, paket ve görüşme işlerinin kesin `due_at`/`expires_at`
  değerlerini saf fonksiyonlarla üretir.
- Worker her işi claim ve gönderim anında enjekte edilen clock ile tekrar doğrular;
  pause, cancel, plan değişikliği, rıza iptali veya süresi geçmiş intent gönderilmez.
- pg-boss'un iç saatini değiştirmeye güvenilmez. Integration test harness'i fake clock'u
  ilerletir, zamanı gelen dispatcher/handler'ı doğrudan çalıştırır ve test queue işlerini
  beklemeden tüketir. Gerçek gecikmeli job davranışı yalnızca küçük bir adapter smoke
  testiyle doğrulanır.
- API ve worker içeren E2E test ortamı aynı test clock kaynağını kullanır. Fake clock
  kontrolü yalnızca test build/config'inde bulunur; staging veya production fake clock
  ile başlatılırsa süreç startup failure verir.
- Testler wall-clock sleep ile dakika/saat beklemez. Domain paketlerinde doğrudan sistem
  saati kullanımı lint/static check ile engellenir; process timezone'u sabitlenir ve
  iş timezone'u her testte açık IANA değeri olarak verilir.

Asgari time-travel senaryoları:

1. Reminder `due_at` öncesinde gönderilmez, eşik anında bir kez gönderilir.
2. Check-in pratik bitişinden 10 dakika sonra bir kez oluşur.
3. Day-close öğrencinin yerel gün sonunda cevapsız pratiği `MISSED` yapar; daha önce
   tamamlanmış veya atlanmış pratiği değiştirmez.
4. 1/8/15/22. gün geçişleri, ay sonu, artık yıl ve DST gap/fold sınırları doğrulanır.
5. Claim'den hemen önce pause/cancel/program değişikliği gönderimi suppress eder;
   restore eski intent'i canlandırmaz, yeni intent üretir.
6. Geç uyanan worker süresi geçmiş mesajı göndermez; retry, restart ve duplicate job
   aynı mesajı ikinci kez oluşturmaz.
7. Paket aktivasyon/yenileme/bitiş zamanları ile görüşme 24 saat, 3 saat ve 1 saat
   işleri fake clock ile doğrulanır.

## 20. CI/CD

CI ve release orkestrasyonu **GitHub Actions** ile yürütülür. Coolify uygulama
çalıştırma, health check ve deployment lifecycle'dan; GitHub Actions kalite kapıları,
image üretimi ve kontrollü deploy tetiklemesinden sorumludur.

Workflow'lar en az `pull-request.yml`, `release.yml` ve manuel çalıştırılan
`production-deploy.yml` olarak ayrılır. Tekrar eden install/cache/Node/pnpm adımları
yerel composite action ile paylaşılır; tüm third-party action'lar mutable tag yerine
commit SHA ile sabitlenir.

Pull request pipeline:

1. Install with frozen lockfile
2. Format/lint
3. Typecheck
4. Unit tests
5. PostgreSQL integration tests
6. Prisma migration validation
7. API/admin production build
8. Dependency/security scan

PostgreSQL ve pgvector GitHub Actions service container'ında çalışır. Zaman bağımlı
testler gerçek süre beklemeden `FakeClock` kullanır. PR workflow'u salt-okunur
minimum `GITHUB_TOKEN` yetkisiyle ve production secret'larına erişmeden çalışır.

Release pipeline:

1. Versioned image build
2. Image SBOM/provenance ve vulnerability scan
3. Container registry push
4. Coolify staging deploy tetikleme
5. Backward-compatible migration, readiness ve smoke test
6. Production environment manuel approval
7. Database backup
8. Aynı immutable image digest'iyle production API/worker/admin deploy
9. Queue/readiness/smoke kontrolleri
10. Gerekirse webhook cutover

Staging ve production GitHub Environments ayrı secret, reviewer ve protection rule
kullanır. Fork PR'larına secret verilmez. Production deploy yalnızca korumalı ana
branch/tag'den, başarılı CI sonrasında ve manuel onayla çalışır. Coolify token'ı
environment secret'tır; log, artifact veya image katmanına yazılmaz.

Migration başarısızsa yeni uygulama başlamaz. Destructive migration iki aşamalı
expand/migrate/contract yaklaşımıyla yapılır.
API-first deploy yeni worker'ın anlayamayacağı payload üretmez; N/N-1 envelope
uyumluluğu CI contract testiyle korunur veya etkilenen queue deploy sırasında
pause/drain edilir.

## 21. Coolify Dağıtımı

Coolify'da aynı Git revision'dan üç uygulama/süreç çalışır:

- `meditation-api`: `meditation-api.pusulamkendim.com`
- `meditation-worker`: public route yok
- `meditation-admin`: admin için ayrı alan adı, kesin isim deploy öncesi seçilecek

Ek kaynaklar:

- Projeye özel PostgreSQL ve persistent disk
- Private external S3 bucket
- Off-site encrypted backup bucket/prefix
- Production ve staging için ayrı DB, bucket ve secret
- Staging için ayrı WhatsApp phone number/WABA, Google Calendar ve Gemini projesi
- Production ve staging için ayrı Telegram bot/token/webhook secret
- Non-production `message.send` içinde WhatsApp E.164 ve Telegram chat ID allowlist;
  production sender credential'ları algılanırsa non-production process startup failure

Health endpoint'leri:

- `/health/live`: process ayakta
- `/health/ready`: DB, queue ve gerekli config hazır

Harici provider kesintisi readiness'i düşürmez; ilgili entegrasyon degraded
olarak metric/admin panelinde gösterilir.

### 21.1 Backup ve Restore Runbook

- PostgreSQL ve gerekli konfigürasyon günlük şifreli yedeklenir, 30 gün saklanır.
- Backup başarısızlığı alarm üretir; hedef RPO 24 saat, RTO 4 saattir.
- Ayda bir izole restore ortamında gerçek geri yükleme yapılır ve ölçülen RPO/RTO kaydedilir.
- Restore ortamının Meta/Telegram/Google/Gemini egress'i kapalı ve worker/API'si fenced başlar.
- Veritabanı dışı append-only deletion journal geri uygulanır.
- Süresi dolmuş pg-boss işleri ve message intent'leri `SUPPRESSED` yapılır;
  provider message ID ve Calendar state reconcile edilir.
- Kontrol raporu admin tarafından onaylanmadan webhook, API ve worker açılmaz.

## 22. Milestone Planı

### M0 - Repository ve Yerel Altyapı

- pnpm monorepo
- API/worker/admin iskeleti
- Prisma/PostgreSQL/pgvector/pg-boss yerel ortamı ve fake provider adapter'ları
- Typed config validation, structured log, temel metrics ve CI
- İlk günden `SystemClock`/`FakeClock` portu
- Typed feature flag registry ve `tr-TR` locale iskeleti

**Çıkış ölçütü:** Üç uygulama build olur; migration, örnek job ve fake clock smoke
testi geçer.

### M1 - Güvenlik ve Veri Çekirdeği

- Admin login, TOTP, session, bootstrap ve recovery
- Öğrenci, kanal kimliği, rıza, paket, ödeme, pratik, görüşme ve mesaj şemaları
- Transactional inbox/outbox, message intent, optimistic version ve DB constraint'leri
- Alan şifreleme/HMAC/key ID, audit log ve hassas veri loglama kuralları
- AWS SES admin notification adapter ve delivery kayıtları
- Admin navigation ve dashboard shell

**Çıkış ölçütü:** Yetkisiz erişim reddedilir, admin 2FA ile giriş yapar; veri
invariant'ları ve transaction içindeki outbox testleri geçer.

### M2 - System Events ve Standart Mesajlar

- Code-seeded system event registry
- Mesaj tanımı, kanal varyantı, sürüm ve provider binding modeli
- BCP 47 locale çözümleme ve fallback kontrolleri
- JSON schema tabanlı variable/render validation ve deterministik resolver
- Tek response owner kuralı
- Admin edit/preview/test-send/publish/archive/rollback ve protected mesaj kontrolleri
- Fake kanal adapter'ı

**Çıkış ölçütü:** Her event tek message intent üretir; varyant çakışmaları ve hatalı
placeholder'lar publish'i engeller, protected kontroller geçer ve event sonrası ikinci
bir LLM cevabı oluşmaz.

### M3 - Kanallar ve Konuşmalar

- Raw-body webhook signature, message/delivery dedupe ve monotonic reconciliation
- Telegram secret webhook, update dedupe, private-chat filtresi ve send adapter
- Kanal kimliği, tek kullanımlı link ve default-channel resolution
- Normalize message/status
- Transactional inbox/outbox, per-student serialization ve send-policy gate
- Conversation admin ekranı ve admin reply

**Çıkış ölçütü:** WhatsApp ve Telegram test hesaplarında duplicate
event tek domain etkisi üretir; kayıt kanalı default olur ve WhatsApp 24 saat dışı
admin/sistem mesajında zorunlu template uygulanır. Bir inbound en fazla bir
response owner ve tek kullanıcı cevabı üretir.

### M4 - Kayıt, Rıza, Ödeme ve Paket

- Deterministic kayıt state machine
- Aydınlatma ve kapsam bazlı rızalar
- Kanal opt-in'i ve ayrı `AGENT_REPLY_AI` tercihi/rızası; geri çekme
- IBAN/reference
- Dekont ve payment review/action-required/approve
- Atomik ödeme onayıyla paket ve dört görüşme credit'i oluşturma
- Yenileme, ileri tarihli aktivasyon ve paket bitişi

**Çıkış ölçütü:** Her iki kanalda uçtan uca kayıt yalnızca atomik admin ödeme
onayıyla aktive olur; AI kapalıyken de temel akış tamamlanır.

### M5 - Pratik Programı

- Sürümlü plan
- 15/20/25/30 kuralları, admin özel süresi ve tek/çift günlük pratik
- Kesin timestamp'li reminder/check-in/day-close işleri
- Completed/skipped/missed/cancelled/suppressed ve reply-context correlation
- Pause/resume/program change
- Tekil/range cancel, uygun restore ve audit
- Deterministik `PROGRAMIM` görünümü

**Çıkış ölçütü:** Paylaşılan fake clock ile bir aylık plan, hafta/ay sınırları,
pause/cancel/restore yarışları ve idempotent reminder/check-in/day-close testleri geçer.

### M6 - Görüşme ve Google

- Meeting credit ledger
- Dört occurrence planı
- Production OAuth, recurrence instance mapping, incremental sync ve Meet state
- 24h/3h/1h işleri
- Deterministik weekly metrics ve coach note

**Çıkış ölçütü:** Tek occurrence parent seriyi bozmadan güncellenir,
dış değişiklik alert olur, Meet hazır değilken link mesajı gönderilmez ve 24h/3h/1h
işleri fake clock ile deterministik geçer.

### M7 - LLM Platformu ve Öğrenci Bağlamı

- Gemini paid adapter
- Provider/model registry ve allowlist
- Git kaynaklı immutable prompt sürümleri ve admin rollback
- Pseudonymization
- Task model/fallback
- Typed `get_student_context`, evidence validation ve context-read audit
- Usage, cost, budget ve admin ekranları
- Atomik budget reservation ve pricing snapshot

**Çıkış ölçütü:** "Pratik saatlerim kaçta?" sorusu öğrenciye bağlı kanıtlı bağlamla
cevaplanır; başka öğrenci verisi erişilemez, hard limit uygulanır ve AI rızası yokken
deterministik sorgular çalışır.

### M8 - Bilgi Bankası, RAG ve Bağlamsal Agent

- Çoklu doküman upload, parse/chunk/embed, stage assignment ve publish/archive
- pgvector hybrid retrieval, threshold, rerank ve retrieval evaluation set'i
- Öğrenci bağlamı + RAG birleşimi, source validation ve knowledge-miss handoff
- Reflection tag ve AI weekly draft
- Bilgi bankası yönetim ekranı ve cevap kalite testleri

**Çıkış ölçütü:** Stage uyumlu yayınlanmış kaynak varsa kaynaklı tek cevap, yoksa
handoff üretilir; birleşik kişisel/genel sorular tek response owner ile sonuçlanır ve
prompt injection/source fabrication testleri geçer.

### M9 - Privacy, Safety ve Retention

- Retention/deletion jobs
- Payment proof 30 gün, content 12 ay
- Safety alert ve sabit yönlendirme
- Admin çift kanal uyarısı
- Veritabanı dışı deletion journal ve restore replay

**Çıkış ölçütü:** Silme ve safety E2E testleri geçer; hassas log taraması temizdir.

### M10 - Üretim Hazırlığı ve Pilot

- Coolify production/staging
- Meta template onayları ve webhook cutover
- Tüm built-in event'ler için yayınlanmış kanal fallback mesajları ve provider binding kontrolü
- Telegram bot/webhook kurulumu, secret doğrulaması ve production canary
- Backup/restore testi
- Restore worker fencing, stale outbox suppression ve aylık RPO/RTO kaydı
- Alert ve runbook
- Provider canary, duplicate webhook, 100 öğrenci reminder burst ve rolling-deploy testleri
- Pilot allowlist -> yüzdesel rollout -> genel açılış ve kill-switch provası
- KVKK/AI/safety uzman kontrolleri
- İzin listesindeki pilot öğrenciler

**Çıkış ölçütü:** Go-live checklist, restore/cutover/rollback provası ve kapasite
testleri tamamlanır; kontrollü pilot açılır.

## 23. Canlıya Geçiş Kontrolü

- Meta production token, callback ve template'ler doğrulandı
- AWS SES production access, domain/SPF/DKIM/DMARC ve bounce/complaint akışı doğrulandı
- Meta App Secret raw-body signature testi ve kanal opt-in kanıtı doğrulandı
- Telegram bot token/webhook secret rotation, pending update ve private-chat testi geçti
- Google Calendar OAuth ve recovery süreci test edildi
- Google OAuth projesi Production durumunda; token revoke/reconnect ve incremental sync test edildi
- Gemini key Paid Services projesine bağlı
- Google log/dataset paylaşımı kapalı
- DPA/yurt dışı aktarım ve KVKK metinleri doğrulandı
- Safety metni ve kuralları uzman tarafından onaylandı
- Admin TOTP ve recovery code hazır
- S3 private, signed URL ve lifecycle test edildi
- Backup restore ve deletion replay test edildi
- Queue retry/dead-letter alarmları çalışıyor
- Staging gerçek öğrenci verisi içermiyor
- Staging recipient allowlist ve ayrı provider kimlikleri startup/canary testi geçti
- Bilgi bankası stage visibility, kaynak-yok handoff ve prompt rollback eval seti geçti
- Event kataloğu/message variant schema, protected version ve tek-response-owner E2E testleri geçti
- Medya 10/25/100 MiB sınır ve stream-abort testleri geçti
- Locale fallback ve feature flag deterministik rollout/kill-switch testleri geçti
- Production webhook logları hassas veri içermiyor
- `DURDUR`, `DESTEK`, `VERİLERİMİ SİL` E2E testleri geçti
- `RIZA İPTAL`, 24 saat/template ve send-time suppression yarış testleri geçti

## 24. Uygulama Öncesi Kalan Teknik Seçimler

Bu seçimler temel iskeleti bloke etmez:

- Admin portalının üretim alan adı
- Harici S3-compatible provider
- İlk primary/fallback Gemini model referansları
- Production Telegram bot hesabı/kullanıcı adı ve görünen metinleri
- İlk embedding modeli, RAG min-score/top-k değerleri ve stage bazlı eval seti
- Safety admin e-posta ve ayrı WhatsApp hedefi
- Kesin KVKK/rıza/safety metin içerikleri

## 25. Referanslar

- [Ürün proje taslağı](PROJECT_DRAFT.md)
- [Açık kararlar](OPEN_DECISIONS.md)
- [pg-boss](https://github.com/timgit/pg-boss)
- [Google Calendar event oluşturma](https://developers.google.com/workspace/calendar/api/guides/create-events)
- [Google Calendar recurring event instances](https://developers.google.com/workspace/calendar/api/guides/recurringevents)
- [Google Calendar incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Google Calendar events referansı](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Meta WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Gemini API veri politikası](https://ai.google.dev/gemini-api/docs/logs-policy)
- [Gemini API usage metadata](https://ai.google.dev/api/generate-content)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API koşulları](https://ai.google.dev/gemini-api/terms)
- Yerel referans: `projects/whatsapp-agent`
