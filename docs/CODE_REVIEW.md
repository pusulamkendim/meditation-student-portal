# Genel Kod İncelemesi (Code Review)

| Alan | Değer |
| --- | --- |
| Belge durumu | Aktif |
| Oluşturulma tarihi | 2 Ağustos 2026 |
| Kapsam | `apps/api`, `apps/worker`, `apps/admin`, `packages/core`, `packages/database/prisma/schema.prisma` |
| Yöntem | 4 bağımsız inceleme ajanı + CRITICAL bulguların doğrudan doğrulaması |

Bu belge, sistemin genel kod kalitesini, güvenliğini ve güvenilirliğini değerlendirir.
Bulgular önem sırasına göre gruplandırılmıştır; her bulgu `dosya:satır` referansı,
tek cümlelik açıklama ve somut düzeltme önerisi taşır. Doğrulanmış bulgular
`:verified` etiketiyle işaretlenmiştir.

## Genel Değerlendirme

Mimari sağlam: transactional outbox, alan şifreleme (AES-256-GCM + keyId
rotation), timing-safe HMAC, idempotency key'ler, pg-boss, version tabanlı
optimistic concurrency ve strict TypeScript tutarlı kullanılıyor. Sorunlar üç
noktada yoğunlaşıyor:

1. **Güvenlik sınırları** — RBAC hiç uygulanmıyor, rate limiting yok, oturum
   yenileme idlity kuralını atlıyor.
2. **Mesaj teslimatının güvenilirliği** — birkaç durumda mesajlar kalıcı olarak
   kaybolabiliyor veya terminal durumda kalıyor.
3. **İş mantığının dağınıklığı** — paket fiyatı/kuralları magic number olarak
   koda dağılmış ve bir alanda yanlış değer UI'a gönderiliyor.

---

## CRITICAL

### CR-001 — CLAIMED durumunda kalan mesaj intents kalıcı olarak kayboluyor :verified

- Kaynak: `apps/worker/src/message-dispatcher.ts:144,151`
- Gözlem: Dispatch, `PENDING→CLAIMED` geçişini claim transaction'ı içinde yapıyor
  (satır 144); provider gönderimi ve `SENT` güncellemesi ikinci ayrı
  transaction'da (satır 197-221). `:150-172` arasındaki decrypt/recipient/adapter
  çözümleme kodu try bloğunun **dışında**. İki commit arasında bir crash veya bu
  aralıkta bir hata intent'i kalıcı olarak `CLAIMED` bırakıyor. pg-boss retry'ı
  satır 151'deki `latest?.status !== CLAIMED` kontrolüyle sessizce no-op oluyor.
  Stale-`CLAIMED` temizleyen bir cron ve dead-letter yok — mesaj sonsuza dek kayıp.
- Etki: Öğrenciye/administe gönderilecek mesaj sessizce düşer; kayıt
  gözlemlenebilirliği yok.
- Düzeltme: (a) recipient/content çözümlemeyi claim transaction'ına taşı, (b)
  `CLAIMED` olup N dakikadan eski intents'i yeniden kuyruğa alan bir cron sweep ekle
  (idempotencyKey ile `SENT` olmuşlara karşı dedupe), (c) `:150-172`'yi try/catch
  içine al ki hatalar en azından `FAILED`/`DELIVERY_UNKNOWN`'a geçsin.

### CR-002 — Mesaj teslimatında retry/backoff yok; FAILED ve DELIVERY_UNKNOWN terminal :verified

- Kaynak: `apps/worker/src/message-dispatcher.ts:222-233`,
  `apps/worker/src/channels/whatsapp-intent-retry.ts:11-22`
- Gözlem: Geçici provider 5xx/timeout → `FAILED` (terminal); yalnızca `TypeError`
  → `DELIVERY_UNKNOWN`. Hiçbir kod yolu bu durumları yeniden kuyruğa almıyor;
  tek requeue yolu (`whatsapp-intent-retry.ts`) yalnızca `SUPPRESSED` +
  `WHATSAPP_TEMPLATE_REQUIRED` eşleşiyor. Dispatch, `CLAIMED` olmayan intent'ler
  için erken dönüyor (satır 151), bu yüzden pg-boss'un 2 otomatik retry'ı da etkisiz.
- Etki: En kritik yolda geçici hatalar kalıcı mesaj kaybına dönüşüyor.
- Düzeltme: `FAILED`/`DELIVERY_UNKNOWN` intents üzerinde sınırlı denemeli,
  exponential backoff'lu bir retry kuyruğu/cron ekle; `DELIVERY_UNKNOWN`'ı provider
  durumu veya inbound webhook'larla mutabakatla; terminal durum eşlemesini daralt.

### CR-003 — `student.events` outbox event'leri sonsuza dek PENDING kalıyor

- Kaynak: `apps/worker/src/main.ts:72-85` (relay allow-list) karşısında
  `apps/api/src/registration/payment.service.ts:163-171`,
  `apps/api/src/registration/registration.service.ts:194-202`,
  `apps/api/src/practice/practice.service.ts:298-303`
- Gözlem: Relay'in konu allow-list'i `student.events` içermiyor; producer'lar
  `SUBSCRIPTION_SCHEDULED`, `STUDENT_ACTIVATED`, `CONSENT_GRANTED/WITHDRAWN`,
  `PRACTICE_PLAN_UPDATED` olaylarını yazıyor ama hiçbir consumer yok. Event'ler
  `PENDING` kalıyor ve asla `PUBLISHED` olmuyor. `docs/TECHNICAL_PLAN.md:1547`
  olaydan standart mesaj + intent akışını dokümante ediyor; worker'da bu akışın
  hiçbir karşılığı yok.
- Etki: Event'ler ölü mü yoksa eksik akış mı olduğu belirsiz; gerçek bir özellik
  kaybı varsa kullanıcıya yansımıyor, yoksa boş yere veri birikiyor.
- Düzeltme: `student.events` akışını kuyruğa bağla (standart mesaj render edip
  `message.send`'e yönlendir) ya da producer'ları kaldır ve niyeti netleştir.

---

## HIGH — Güvenlik

### SEC-001 — Rol tabanlı yetkilendirme (RBAC) hiç uygulanmıyor :verified

- Kaynak: `apps/api/src/auth/admin-session.guard.ts:21` (guard yalnızca
  authenticate ediyor), `apps/api/src/auth/admin-auth.service.ts:208` (role
  session'a yazılıyor), `packages/database/prisma/schema.prisma:173`
  (`ADMIN/ASSISTANT/FINANCE` rolleri)
- Gözlem: `AdminRole` her session'da dönüyor ama hiçbir rotada denetlenmiyor.
  `FINANCE` veya `ASSISTANT` hesabı ödeme onaylayabilir, mesaj şablonu
  yayınlayabilir, içerik silebilir ve tüm öğrenci PII'sini okuyabilir.
- Düzeltme: `RolesGuard` + `@Roles(...)` decorator'ı ekle; ödeme onayı
  (`registration.controller.ts:215,224`) → `FINANCE`, mesaj yayını/rollback
  (`message-catalog.controller.ts:134,146`) → `ADMIN` vb.

### SEC-002 — Hiçbir yerde rate limiting yok; login brute-force ve kilit-DoS açığı

- Kaynak: `apps/api/src/auth/admin-auth.controller.ts:54`,
  `apps/api/src/auth/admin-auth.service.ts:135-144`
- Gözlem: Tek koruma hesap başına 5 başarısız denemede 15 dk kilit; IP tabanlı
  throttle yok. Saldırgan ya brute-force eder ya da 5 yanlış parolayla admin'i
  kolayca kilitler. Kod tabanında `@nestjs/throttler` benzeri hiçbir şey yok.
- Düzeltme: `/auth/login` ve `/auth/step-up` üzerinde IP+hesap anahtarlı, backoff'lu
  rate limit; "hesap bulunamadı" denemelerini kurbanın kilidine sayma.

### SEC-003 — İdle oturum timeout'u refresh ile bypass edilebiliyor

- Kaynak: `apps/api/src/auth/admin-auth.service.ts:242-255` (`renew` yalnızca
  `revokedAt`/`absoluteExpiresAt` kontrol ediyor), `apps/api/src/auth/admin-auth.controller.ts:90-116`
- Gözlem: `renew()`, 7 günlük mutlak süreyi geçmediği sürece idle timeout'u geçmiş
  oturumu yeniden aktif ediyor. Cookie'ye sahip biri oturumu 7 güne kadar
  süresiz uzatabilir; CSRF token da token'dan türediği için refresh'te sabit kalıyor.
- Düzeltme: `session.expiresAt <= now` (veya `lastSeenAt` idle penceresinden eski)
  ise yenilemeyi reddet; her yenilemede session token'ı ve CSRF token'ı rotasyona uğrat.

### SEC-004 — Webhook body limit'i istemci header'ına güveniyor

- Kaynak: `apps/api/src/main.ts:34-40`, `apps/api/src/main.ts:16`
- Gözlem: `Number(headers['content-length'] ?? 0)` kontrolü chunked transfer-encoding
  ile atlanabilir; bu durumda yalnızca global 100 MB `bodyLimit` geçerli → `/webhooks/*`
  üzerinde bellek tüketimi DoS'u.
- Düzeltme: Webhook rotalarında parse edilmiş body üzerinde rota bazlı limit uygula
  (header'a değil).

### SEC-005 — TOTP step-up yalnızca tek yerde zorlanıyor; step-up uç noktasında throttle yok

- Kaynak: `apps/api/src/auth/admin-auth.service.ts:319-338`,
  `apps/api/src/message-catalog/message-catalog.service.ts:201,285-291`
- Gözlem: `stepUpVerifiedAt` yalnızca korumalı mesaj şablonu yayınında denetleniyor;
  ödeme onayı, admin yanıtı, içerik silme vb. hiçbirinde yeniden doğrulama yok.
  `/auth/step-up` TOTP denemelerini sınırlamıyor (compromise session'da 1e6 uzay).
- Düzeltme: Hassas işlemlerde ortak bir step-up guard'ı; deneme sayacı + N
  başarısızda session invalidation.

### SEC-006 — Public okuma uçları sınırsız satır oluşturmaya açık

- Kaynak: `apps/api/src/readings/reading.controller.ts:261-303`,
  `apps/api/src/readings/reading.service.ts:701-736,749-784,786-813`
- Gözlem: `v1/readings/public/:slug/*` herhangi bir istemci `visitorId` UUID'siyle
  `readingPublicVisit` satırı oluşturabiliyor; rate limit yok → bilinen slug'a
  sınırsız satır ekleme (storage/DB DoS).
- Düzeltme: Public uçları rate-limit'e al ve/veya visitor kimliğini sunucu tarafında
  imzala (ilk erişimde kısa ömürlü HMAC token dön), istemci tarafı ID'ye güvenme.

### SEC-007 — Login timing'iyle hesap numaralandırma (enumeration)

- Kaynak: `apps/api/src/auth/admin-auth.service.ts:114-145`
- Gözlem: Bilinmeyen/pasif e-posta, argon2 `verify` çalıştırmadan hemen dönüyor;
  yanıt süresi hesabın var olup olmadığını (ve kilit durumunu) ele veriyor.
- Düzeltme: Bulunamayan yolda da dummy argon2 verify çalıştır; sabit gecikme + tek
  tip log ekle.

### SEC-008 — Gemini API key'i URL query string'inde gönderiliyor

- Kaynak: `packages/core/src/llm-provider.ts:87,150`
- Gözlem: Key `?key=...` olarak URL'ye ekleniyor; access log, TLS-terminating proxy
  ve referrer analitiğinde görünebilir.
- Düzeltme: `x-goog-api-key` header'ına taşı.

### SEC-009 — Env config şeması non-strict; bilinmeyen anahtarlar sessizce yutuluyor

- Kaynak: `packages/core/src/config.ts:46-89`
- Gözlem: `z.object` unknown key'leri strip ediyor; `WHATSAPP_APP_SECRETX` gibi bir
  typo uygulamanın güvenlik yapılandırması eksik boot olmasına yol açabilir.
- Düzeltme: `.strict()` (veya `z.strictObject`) kullan; bilinmeyen env anahtarı
  başlangıçta yüksek sesle hata versin.

### SEC-010 — Düşük öncelikli güvenlik maddeleri

- `sanitizeAuditDiff` hiçbir yerde kullanılmıyor; audit diff'leri elle kuruluyor
  (`packages/core/src/security.ts:74-83`).
- Dosya depolama `localPath` join'i key'i temizlemiyor (`knowledge/storage.ts:107-109`);
  bugün UUID'lerle güvenli, allowlist regex ile sıkılaştır.
- WhatsApp verify handshake constant-time değil (`whatsapp-webhook.controller.ts:35`).
- Session cookie `__Host-` prefix'siz; HSTS header yok (`admin-auth.controller.ts:149-157`).
- Session/CSRF token yenilenmede rotasyon yok; `ipHmac`/`userAgentHash` hiç denetlenmiyor.
- 96-bit rastgele GCM nonce; yüksek hacimde çarpışma riski (deterministik nonce tercih).

---

## HIGH — İş Mantığı

### BIZ-001 — `creditBalance` sabit 4 dönüyor; gerçek bakiye UI'a yansımıyor :verified

- Kaynak: `apps/api/src/meetings/meeting.service.ts:948`
- Gözlem: `presentSeries()` her zaman `creditBalance: 4` döndürüyor; gerçek bakiyeyi
  hesaplayan `creditBalance()` (satır 863) mevcut. NO_SHOW/COMPLETED kredi harcadıktan
  sonra admin UI hâlâ 4 görüyor.
- Düzeltme: `createSeries` içinde (transaction'da) `this.creditBalance(tx, subscriptionPeriodId)`
  çağır ve gerçek değeri `presentSeries`'e geçir.

### BIZ-002 — Paket fiyatı ve paket kuralları dağınık magic number

- Kaynak: `registration.service.ts:115` (`amountMinor: 400000`),
  `payment.service.ts:99` (`amountText: '4.000 TL'`), `payment.service.ts:70`
  (`delta: 4`), `meeting.service.ts:330-331,341,392,440,518` (`60, 4`,
  `FREQ=WEEKLY;COUNT=4`), `student-admin.service.ts:490` (`<= 4`)
- Gözlem: Fiyat, kredi sayısı, görüşme sayısı/süresi ve yolculuk adlandırması tek
  bir config'den beslenmiyor; biri değiştiğinde hepsinin el ile senkron tutulması
  gerekiyor ve `'4.000 TL'` metni fiyat değişirse sessizce yalan söyler.
- Düzeltme: `applicationConfigSchema`'ya tek bir `PACKAGE` bloğu (fiyat minor,
  görüşme sayısı, süre, kredi sayısı) ekle ve tüm bu noktalardan oku; `recurrenceRule`
  ve `amountText`'i config'den türet.

### BIZ-003 — Beklenen iş hataları bare `Error` → HTTP 500

- Kaynak: `practice.service.ts:95,131,321,329,508,514,519,530,545,666,673,681,692,825,833,842,849`,
  `registration.service.ts:99`, `payment.service.ts:50,55`,
  `message-catalog.service.ts:75,141,150,186,200,259,289`
- Gözlem: State machine çakışmaları ve doğrulama hataları bare `Error` ile fırlatılıyor;
  global exception filter yok (`main.ts` hiçbirini kaydetmiyor) → admin'e 500 ve iç
  mesaj dönüyor, beklenmedik hatalardan ayırt edilemiyor.
- Düzeltme: State machine/doğrulama hataları için `ConflictException`/
  `BadRequestException` kullan (meeting.service.ts ve student-note.service.ts
  desenine uy); bare `Error` yalnızca gerçek beklenmedik hatalarda kalsın.

### BIZ-004 — Admin dashboard'u sahte veri gösteriyor :verified

- Kaynak: `apps/admin/app/(portal)/page.tsx:13-26`
- Gözlem: Metrikler `value={0}`, "Kuyruk temiz" ve "Bekleyen işlem yok" hardcoded.
  Gerçek bekleyen ödeme/handoff olsa bile admin "her şey yolunda" görüyor.
- Düzeltme: Gerçek veri dönen bir `/v1/admin/operations` summary ucu ekle (diğer
  sayfalar gibi) ya da nav'dan kaldır.

---

## HIGH — Güvenilirlik

### REL-001 — Hiçbir kuyrukta dead-letter / poison-message işleme yok

- Kaynak: `apps/worker/src/main.ts:58,62,181,196,201,206,211,229,234,239,244,249,260,265,270,275`
- Gözlem: Her `createQueue()` pg-boss varsayılanlarını kullanıyor (retry 2, gecikmesiz,
  backoff yok, 15 dk expire) ve `deadLetter` politikası yok. Poison job iki kez
  anında denenip `failed`'da sessizce duruyor.
- Düzeltme: En az `message.send`, `meditation.audio-render`, `llm.*` için dead-letter
  kuyruğu; retryDelay/retryBackoff; failed job'ları ops'a yüzey.

### REL-002 — Audio-render FAILED terminal; kurtarma sadece boot'ta ve sadece PROCESSING

- Kaynak: `apps/worker/src/meditation-audio-render.ts:203-216`,
  `apps/worker/src/main.ts:43-45`
- Gözlem: Geçici ffmpeg hatası render'ı kalıcı `FAILED` yapıyor; `recoverInterrupted`
  yalnızca `PROCESSING` render'ları ve yalnızca başlangıçta yeniden kuyruğa alıyor.
- Düzeltme: Geçici hataları sınırlı retry'lanabilir yap, periyodik stale-render sweep
  ekle, failed render'ları DLQ'ya yönlendir.

### REL-003 — Plan değişikliği onayı transaction dışında

- Kaynak: `apps/api/src/practice/practice.service.ts:112-115` (`notifyPlanChange`
  transaction commit'inden sonra çalışıyor)
- Gözlem: Commit ile `notifyPlanChange` arasında süreç ölürse plan güncellenir ama
  onay mesajı intent'i oluşmaz; art arda plan güncellemeleri post-commit kodunu
  yeniden girebilir.
- Düzeltme: Onay intent/outbox'ını plan mutasyonuyla aynı transaction'a al
  (`payment.service.ts:128-161`'deki `PAYMENT_APPROVED` deseni).

---

## MEDIUM

### Veri tutarlılığı ve sorgu performansı

- **MED-001 — `ReadingService.assign` ve `DrawingService.assign` N+1 + kısmi hata:**
  `reading.service.ts:850-945`, `drawing.service.ts:323-398` öğrenci başına ~7N
  sorgu; mesaj oluşturma başarısız olsa bile assignment live'a geçiyor ve
  `messageIntentId` ayrı transaction'da yazılıyor. Mesaj başarılı olduktan sonra
  assignment oluştur (veya `DRAFT`/`FAILED` yap); `messageIntentId`'yi aynı
  transaction'a al.
- **MED-002 — Advisory lock protokolü tutarsız:** `pause`/`cancel`/`reschedule`/
  `restore` (`practice.service.ts:310-394,496-730`) per-student lock almıyor;
  `createPlanInTransaction` (`.138`) ve `cancelRange` (`.602`) alıyor. Her per-student
  mutasyonun başına `pg_advisory_xact_lock(hashtext(studentId))` ekle.
- **MED-003 — LLM agent'ta atomik claim yok:** `apps/worker/src/llm-agent.ts:60,602-605`
  `processedAt` read-only kontrol + plain update; at-least-once redelivery'de iki
  çalışma da LLM çağrısına ulaşabilir (çift ücret, mükerrer yanıt). `updateMany({ where: { id, processedAt: null }, data: { processedAt } })` ile claim et.
- **MED-004 — Haftalık özet draft versiyonu atomic olmayan read-then-increment:**
  `apps/worker/src/weekly-summary-ai.ts:131-135`; iki eşzamanlı üretim aynı versiyonu
  okur, unique constraint kaybeden tarafta LLM çağrısı boşa ödenir. Advisory lock
  veya transaction içinde `SELECT ... FOR UPDATE`.
- **MED-005 — `reportPayment` idempotent değil:** `registration.service.ts:103-141`
  replay'de duplicate payment oluşabilir; `externalMessageId` üzerinde dedup veya
  öğrenci için mevcut `REPORTED`/`UNDER_REVIEW` kontrolü ekle.
- **MED-006 — Public share analytics sınırsız distinct sorgusu:**
  `meditation.service.ts:450-454` (`distinct: ['visitorHmac']`), take/cursor yok.
- **MED-007 — Knowledge full-text araması GIN index'siz:** `knowledge.service.ts:250-261`
  tüm yayınlanmış chunk'ları query time'da tarıyor; generated tsvector kolonu + GIN
  index ekle.
- **MED-008 — Öğrenci listesi görüntüleme başına 200 audit satırı:** `student-admin.service.ts:167-173`
  `Promise.allSettled(students.map(auditRead))`; tek aggregate audit satırı veya
  `createMany` kullan.
- **MED-009 — `KnowledgeService.upload` transaction dışı ve quarantine sızıntısı:**
  `knowledge.service.ts:83-134`; tüm dosya döngüsünü tek transaction'a al, başarısız
  dosyaların quarantine key'ini temizle.
- **MED-010 — `MessageCatalogService.publish` çakışma kontrolünü transaction dışında**
  yapıyor (`:203-229`); iki eşzamanlı yayın birbirinin versiyonunu arşivleyebilir.
  Kontrolü transaction içine al.

### Hata yutma ve gözlemlenebilirlik

- **MED-011 — Sessiz `catch` mesaj gönderim hatalarını yutuyor:** `practice.service.ts:462,491,779`,
  `meeting.service.ts:760`, `reading.service.ts:1032`, `student-note.service.ts:53` —
  "admin değişikliğini geri alma" niyeti doğru ama DB hataları/varyant eksikliği de
  sessizce yutuluyor, mesaj kayboluyor. Yutulan hata kümesini daralt (yalnızca
  "published variant yok"), diğerlerinde WARN logla.
- **MED-012 — Decrypt hataları sessizce `undefined` dönüyor:** `student-admin.service.ts:405-451`,
  `reading.service.ts:1191,1210`, `drawing.service.ts:542` — ciphertext/key bozulması
  görünmez. Yanıta `undefined` dönmeye devam et ama WARN logla.
- **MED-013 — `SystemSetting`/idempotency yokluğu nedeniyle sessiz no-op outbox:**
  `main.ts:157` (`if (!Object.values(data)[0]) continue`); `PUBLISHED` güncellemesi
  başarısız olursa event sonsuza dek PENDING kalır. FAILED/SUPPRESSED + neden + log.

### Zaman/tarih

- **MED-014 — UTC-gün aritmetiği saat dilimi sınırlarında:** `practice-schedule.ts:38-43`,
  `meeting-schedule.ts` `index * 86_400_000` ile gün atlıyor; bugün Europe/Istanbul'da
  DST olmadığı için zararsız, DST bölgesinde kırılgan. Takvim günlerini hedef
  timezone'da yürü.
- **MED-015 — `reschedule` tarih karşılaştırması UTC:** `practice.service.ts:522-530`
  `serviceDate.toISOString().slice(0,10)` UTC iken `targetDate` yerel; gece yarısı
  yakınındaki oturumlarda "aynı yerel gün" kontrolü yanlış sonuç verebilir. İki
  tarafı da öğrenci timezone'unda biçimle.

### Admin uygulaması

- **MED-016 — Route koruması yalnızca client-side:** `(portal)/layout.tsx:8`,
  `portal-session-boundary.tsx:14-39`; `middleware.ts` yok — girişsiz kullanıcılar
  tüm bundle'ı alıyor, CSP/X-Frame yok, CSRF token `sessionStorage`'da. Middleware +
  `next.config.ts` güvenlik başlıkları ekle.
- **MED-017 — Hiçbir `error.tsx`/`loading.tsx` yok:** `Intl.DateTimeFormat().format(new Date(value))`
  kötü bir tarih değerinde `RangeError` fırlatıyor ve tek kayıt tüm sayfayı
  crash ettiriyor (`students/page.tsx:69`, `meetings/page.tsx:114`, vb.). Route
  grubu başına `error.tsx` + guard'lı tarih formatlayıcı.
- **MED-018 — Doğrulanmamış non-null assertion:** `payments/page.tsx:107,112`
  (`selected!.id`), `read/page.tsx:145` ve `oku/[slug]/public-reading-client.tsx:199`
  (`sections[sectionIndex]!`). Erken dönüş guard'ları kullan.
- **MED-019 — ~%90 tekrarlanan okuma arayüzü:** `read/page.tsx` (289 satır) vs
  `oku/[slug]/public-reading-client.tsx` (369 satır) neredeyse aynı; ortak
  `ReadingReader` bileşenine çıkar.
- **MED-020 — Fetch/format helper'ları ~12 dosyada kopyalanmış:** `csrfHeaders`/
  `request`/`formatDate`/`slugify` vb. `lib/api.ts` ve `lib/format.ts`'e topla.
- **MED-021 — Arka plan session-refresh hataları sessizce yutuluyor:**
  `portal-session-boundary.tsx:34-35`; 10 dk'lık refresh hataları görünmez,
  stale CSRF ile oturum 401'e kadar sürüklenir.
- **MED-022 — Excalidraw scene JSON doğrulanmadan öğrenciye sunuluyor:**
  `(portal)/drawings/page.tsx:263-286`, `drawing/drawing-viewer.tsx:42-49`;
  `unknown[]` doğrudan `<Excalidraw initialData>`'ya gidiyor. Sunucu tarafında
  doğrula/normalize et.
- **MED-023 — Devasa sayfa dosyaları:** `students/[studentId]/page.tsx` (2411),
  `readings/page.tsx` (1263), `meditations/page.tsx` (1229) — özellik modüllerine böl.

---

## LOW (kısa liste)

- `LlmService.testModel` adapter'ı inline kuruyor ve token cap'i hardcode (`llm.service.ts:122,135`); provider registry'den çöz.
- `LlmService.setPromptVersion` `.parse()` kullanıyor, kardeşleri `.safeParse()` (`llm.service.ts:269`); tutarsız → 500.
- `MessageCatalogService.deleteMessage` varsayılanı `message.name === 'Sistem varsayilani'` string'iyle tanıyor (`:140`, ayrıca typo) — `protected` flag kullan.
- `reportPayment` referans kod çakışmasında (P2002, 8 hex ~4.3B) retry yok (`registration.service.ts:105`).
- `payment.service.ts:122`, `system-message-orchestrator.ts:159`, `practice.service.ts:141`,
  `meeting.service.ts:370,534` non-null assertion'ları — açık guard ile değiştir.
- Çok sayıda zaman/ölçü sabiti config'e taşınmalı: `practice.service.ts:215` (30 dk),
  `reading.service.ts:356` (220 kelime/dk), `message-catalog.service.ts:287` (10 dk TOTP),
  `registration.service.ts:119` (30 gün), `knowledge.service.ts:150` (20k karakter).
- Üç neredeyse aynı storage-provider pattern: `meditation.service.ts:33,53-55`,
  `reading.service.ts:73-77`, `drawing.service.ts:34-38`.
- Admin: dev rozeti production shell'de (`(portal)/layout.tsx:14`); toast tonu string
  eşleşmesiyle (`meetings/page.tsx:358-366`); native `confirm`/`prompt`
  (`standard-messages/page.tsx:478-489`); modal `id="ui-modal-title"` sabit (stack
  modallarda duplicate ID); blob URL 60s sonra revoke ediliyor (uzun açık PDF'lerde
  sorun); `Number()` sonuçları `NaN` render edebiliyor (`llm/page.tsx:103-105`).

---

## İyi Olanlar (dokunmayın)

- **Transactional outbox + idempotency key + unique constraint dedup** doğru kurulmuş;
  duplicate job'lar pg-boss `id: event.id` ile elimine ediliyor.
- **CSRF kapsamı eksiksiz doğrulandı:** tüm admin mutasyonları `x-csrf-token`
  gönderiyor, guard timing-safe HMAC, cookie `SameSite=Strict` + `HttpOnly`.
  (login/refresh doğru şekilde dışarıda.)
- **Argon2id** parola hash'leme; session token'lar yalnızca HMAC digest olarak
  saklanıyor; tek kullanımlık recovery code; login her zaman taze token üretiyor
  (session fixation yok).
- **Optimistic concurrency** (`updateMany` + count) tutarlı; storage temizliği
  transaction rollback'inde düzgün (`meditation.service.ts:580-583`,
  `drawing.service.ts:261-267`).
- **SQL injection yok** (parametrik `Prisma.sql`); webhook imza doğrulama constant-time;
  `delivery-status` rank semantiği FAILED'in SENT/DELIVERED'i geriletmesini engelliyor.
- Zod + strict TS; admin'de sıfır `any`; stil tutarlı.
- Index'lerin çoğu hot query pattern'leriyle uyumlu (`[studentId, startAt]`,
  `[status, dueAt]`, vb.); `student-admin.service.ts:88-102` N+1'den kaçınıyor.

---

## Önerilen Düzeltme Sırası

1. **CR-001 + CR-002 (mesaj kaybı)** — en yüksek iş etkisi: CLAIMED sweep + retry kuyruğu.
2. **SEC-001 + SEC-002 (RBAC + rate limiting)** — güvenlik açıkları, hızlı kazanç.
3. **BIZ-001 + BIZ-002 (`creditBalance:4` + PACKAGE config)** — yanlış veri + dağınık kurallar.
4. **BIZ-003 + MED-011 + MED-012 (exception filter + sessiz catch'ler)** — gözlemlenebilirlik.
5. **CR-003 (`student.events`)** — ölü mü eksik mi kararı.
6. **SEC-003 (idle refresh bypass)** + **MED-016/017 (admin middleware + error.tsx)**.
7. **Admin dashboard'u gerçek veriye bağla (BIZ-004).**

Her düzeltme tamamlandığında bu belgedeki ilgili maddeye `(düzeltildi - TARİH)`
notu eklenmeli ve ilgili E2E birim testleri güncellenmelidir.
