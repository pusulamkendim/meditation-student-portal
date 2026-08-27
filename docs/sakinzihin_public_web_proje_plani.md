# Sakin Zihin Public Web — Güncellenmiş Proje Planı

## 1. Projenin amacı

Sakin Zihin'in public web deneyimi, iki işi birlikte yapmalıdır:

1. Meditasyon ve okumalar üzerinden ücretsiz ve yüksek kaliteli bir içerik deneyimi sunmak.
2. Bu deneyim üzerinden doğru ziyaretçileri birebir meditasyon programına yönlendirmek.

Ana funnel:

```text
SEO / Sosyal Medya
        ↓
   sakinzihin.com
        ↓
Okuma / Meditasyon
        ↓
      Güven
        ↓
Birebir Meditasyon
        ↓
Tanışma Görüşmesi / WhatsApp
```

Mevcut meditation portal operasyon tarafında yeterli olduğu için bu projenin odağı yeni portal özellikleri değil, public deneyim, içerik sunumu ve öğrenci kazanımıdır.

---

# 2. Repo ve uygulama mimarisi

Sakin Zihin ayrı bir repo yerine mevcut `meditation-student-portal` monorepo'su içinde bağımsız bir public Next.js uygulaması olarak tutulmalıdır.

Önerilen yapı:

```text
meditation-student-portal/
├── apps/
│   ├── admin
│   ├── api
│   ├── worker
│   └── sakinzihin-web
├── packages/
│   ├── core
│   ├── database
│   ├── ui
│   └── ...
```

Alan adları:

```text
portal.pusulamkendim.com → admin / operasyon
sakinzihin.com           → public site / SEO / acquisition
```

Aynı repo kullanılacak ancak `sakinzihin-web` ayrı build ve deployment birimi olacaktır.

Mevcut backend'deki okumalar ve meditasyonlar canonical içerik kaynağı olarak korunmalıdır. Yeni bir CMS veya ikinci bir içerik veritabanı oluşturulmamalıdır.

---

# 3. Tasarım yönü

Hazırlanan prototip görseller public sitenin ana görsel referansıdır.

Genel tasarım dili:

- sıcak krem / kırık beyaz zemin
- koyu orman yeşili
- koyu altın / hardal vurgu
- editorial serif başlıklar
- temiz sans-serif body
- bol whitespace
- sakin, doğal ve premium görünüm
- minimal border ve kart kullanımı
- görsel ağırlıklı ancak kalabalık olmayan sayfalar
- SaaS landing page hissinden uzak
- wellness klişelerinden uzak
- mobile-first

## Renk yönü

Önerilen başlangıç tokenları:

```text
Light Background       #F6F1E8
Light Surface          #FBF8F3
Light Surface Muted    #EFE7DB

Forest Green           #18352D
Forest Green 2         #1F4037
Text Dark              #1B2B26

Gold Accent            #B38A3E
Gold Dark              #8C6A2C

Border Warm            #D8CDBE
Border Strong          #CBBEA9
```

Kesin renkler uygulama sırasında prototip görsellere göre refine edilebilir.

---

# 4. Tema sistemi

## Light theme

Public sitenin varsayılan teması olmalıdır.

En uygun kullanım:

- homepage
- okumalar
- birebir çalışma
- hakkımda
- SEO landing page'leri

Amaç: uzun okumada rahatlık ve editorial his.

## Dark theme

Mevcut koyu Sakin Zihin dili korunmalıdır.

Kullanım:

- meditasyon / pratik deneyimi
- bazı hero veya CTA bölümleri
- opsiyonel global tema
- atmosferik marka bölümleri

İdeal çözüm:

- `light` default
- kullanıcı isteğiyle `dark`
- tercihi local storage/cookie ile koru
- ilk render'da tema flash'ı oluşturma
- semantic design token kullan

Public sitede light ve dark tema aynı marka dili olmalı; iki ayrı site gibi görünmemelidir.

---

# 5. Mevcut meditasyon sayfaları

Mevcut global meditasyon sayfaları başarılı olduğu için yeniden tasarlanmayacaktır.

Yapılacaklar:

- mevcut UX korunur
- yeni light/dark design token sistemine uyarlanır
- typography, header/footer ve ortak public navigation ile harmonize edilir
- gerekli değilse player veya meditation interaction akışı değiştirilmez
- performans ve SEO tarafında iyileştirme yapılabilir

Ana kural:

> Çalışan meditasyon deneyimini bozma; yalnızca public site ile görsel olarak bütünleştir.

---

# 6. Okuma deneyiminin tamamen sadeleştirilmesi

Mevcut okuma sayfalarında bölüm seçme, hazırlama/render bekleme ve uygulama hissi public kullanım için fazla karmaşıktır.

Yeni hedef:

> Okuma sayfası bir uygulama ekranı değil, iyi tasarlanmış dijital bir makale gibi hissettirmeli.

## 6.1 Yeni okuma sayfası yapısı

```text
Kategori / Tema
Başlık
Kısa açıklama
Okuma süresi · tarih
Kapak görseli
--------------------------
İçindekiler (yalnızca uzunsa)
--------------------------
Tam makale akışı
--------------------------
Editorial callout / alıntı / pratik notları
--------------------------
İlgili meditasyon
İlgili okumalar
Birebir CTA
```

## 6.2 Bölüm seçimi

Public tarafta section picker/tab kullanılmamalıdır.

Yerine:

- yazı tek akış halinde render edilir
- uzun içerikte anchor tabanlı "Bu yazıda" / içindekiler kullanılabilir
- desktop'ta küçük sticky TOC düşünülebilir
- mobilde TOC sade ve collapsible olabilir
- section değiştirirken yeni render/loading olmamalıdır

## 6.3 Public kullanıcı "okuma hazırlanıyor" görmemeli

Public içerik yalnızca gerçekten yayınlanmaya hazır olduğunda görünmelidir.

Public görünürlük koşulu:

```text
PUBLISHED + READY
```

Mevcut modele göre isimler farklıysa gerçek schema incelenip aynı prensip uygulanmalıdır.

Aşağıdaki durumlar public'e çıkmamalıdır:

```text
DRAFT
PROCESSING
PARSING
RENDERING
PENDING
FAILED
```

## 6.4 Okumaların önceden render edilmesi

Public okuma sayfası client-side fetch ile oluşmamalıdır.

Tercih sırası:

1. Next.js server component
2. ISR / cached server rendering
3. gerekiyorsa `generateStaticParams`
4. yeni içerik yayınlandığında on-demand revalidation veya makul cache revalidation

Hedef:

- ilk HTML içinde gerçek makale içeriği gelsin
- loading ekranı göstermesin
- SEO crawler tam içeriği görsün
- JS kapalı olsa bile okuma ana içeriği erişilebilir olsun

Yeni bir içerik kopyası oluşturmak gerekmez. Backend canonical kaynak olmaya devam edebilir.

## 6.5 Editorial reading template

Okuma sayfası için kendine ait component seti oluştur:

```text
ReadingHero
ReadingMeta
ReadingCover
ReadingToc
ReadingBody
ReadingQuote
ReadingInsight
ReadingPracticeNote
ReadingSuttaNote
RelatedMeditation
RelatedReadings
ReadingConversionCta
```

Tüm bloklar her yazıda kullanılmak zorunda değildir.

---

# 7. Görsel sistemi

Görseller public sitenin temel parçası olmalıdır ancak rastgele kullanılmamalıdır.

## 7.1 Görsel kategorileri

### A. Editorial cover

Okuma kapakları.

Karakter:

- sakin
- doğal
- düşük doygunluk
- yumuşak ışık
- geniş negatif alan
- editorial fotoğraf / illüstrasyon

### B. Meditation imagery

Meditasyon kartları ve player kapakları.

Örnekler:

- sisli orman
- göl
- dağ
- gün doğumu
- deniz
- sakin iç mekan
- soyut doğal kompozisyonlar

### C. Conceptual imagery

Önemli yazılar ve landing bölümleri.

Örnek temalar:

- odak
- düşünce akışı
- nefes
- duygu ve tepki
- bırakma
- farkındalık

Literal infografik yerine editorial ve metaforik yaklaşım tercih edilir.

### D. Product/system visuals

Birebir programın takip yapısını anlatır.

Gerçek öğrenci verisi kullanılmaz.

Örnek:

```text
Bu hafta
5 / 7 pratik
85 dk meditasyon
4 refleksiyon
```

### E. Social / OG images

Her önemli okuma ve landing page için otomatik veya yarı otomatik paylaşım görseli.

---

# 8. Görsel stil rehberi

Görsel yönü:

- contemplative
- quiet
- natural
- cinematic but restrained
- soft light
- low saturation
- warm-neutral palette
- subtle texture / grain
- güçlü kompozisyon
- metin için negatif alan

Kaçınılacaklar:

- sürekli Buddha heykeli
- stok meditasyon pozu
- yapay wellness influencer estetiği
- aşırı mistik efektler
- neon
- gradient-heavy visuals
- çok literal beyin / enerji / aura görselleri

---

# 9. Görsel veri modeli

Önce mevcut reading ve meditation schema incelenmelidir.

Eğer uygun alanlar zaten varsa kullanılmalı.

Yoksa minimal ve güvenli şekilde şu ihtiyaçlar karşılanmalıdır:

```text
coverImage
coverImageAlt
socialImage
imageFocalPoint (opsiyonel)
imageCredit (gerekiyorsa)
```

Schema değiştirmeden önce mevcut storage ve public media sistemleri mutlaka incelenmelidir.

V1'de ayrı bir DAM veya media CMS kurulmayacaktır.

---

# 10. Homepage

Hazırlanan prototipteki görsel yön korunarak şu yapıda uygulanmalıdır.

## Hero

Başlık:

> Zihni susturmaya değil, onu anlamaya başla.

Alt metin:

> Meditasyonu yalnızca rahatlamak için değil, bedenini ve zihnini daha yakından tanımak için kullan. Rehberli pratikleri ve okumaları ücretsiz keşfet veya sana özel bir meditasyon pratiği oluşturmak için birebir çalışmaya başla.

CTA:

- Ücretsiz pratiklere başla
- Birebir çalışmayı incele

Hero görseli doğal ve sakin olmalıdır.

---

## Bugün neye ihtiyacın var?

Problem bazlı kartlar:

- Zihnim çok hareketli
- Meditasyona yeni başlıyorum
- Odaklanmakta zorlanıyorum
- Düzenli pratik oluşturamıyorum
- Duygularımla çalışmak istiyorum
- Meditasyonu derinleştirmek istiyorum

---

## Ücretsiz meditasyonlar

3 öne çıkan meditasyon.

- görsel
- süre
- başlık
- kısa açıklama

CTA:

> Tümünü gör

---

## Öne çıkan okumalar

3 öne çıkan okuma.

- güçlü editorial görsel
- başlık
- okuma süresi

CTA:

> Tümünü gör

---

## Yaklaşım

Dark editorial section.

Başlık:

> Meditasyon bir performans değil.

İlkeler:

- Gözlemle
- Anla
- Uyumla

---

## Birebir meditasyon çalışması

6 aşamalı süreç:

```text
Görüşme
→ Plan
→ Pratik
→ Check-in
→ Değerlendirme
→ Yeniden düzenleme
```

CTA:

> Süreç hakkında daha fazla bilgi al

---

## Kimler için / kimler için değil

İki dengeli blok.

---

## Öğrenci deneyimleri

Yalnızca gerçek ve izinli testimonial kullanılır.

Yoksa bölüm production'da gizlenir.

---

## Final CTA

> Kendi meditasyon pratiğini oluşturmaya başlamak ister misin?

Primary:

> Tanışma görüşmesi yap

Secondary:

> Önce ücretsiz pratikleri dene

---

# 11. Okumalar liste sayfası

Route:

```text
/oku
```

Prototip yönü:

- editorial grid
- büyük kapak görselleri
- filtreler sade
- kategori/chip sistemi
- arama
- okuma süresi
- pagination veya load-more
- mobile'da tek kolon

Filtreler yalnızca gerçek taxonomy varsa gösterilir.

Örnek:

```text
Tümü
İçgörü
Pratik
Zihin
Duygular
Öğreti
```

---

# 12. Okuma detay sayfası

Route:

```text
/oku/[slug]
```

Ana özellikler:

- prerendered / server-rendered content
- loading state olmadan içerik
- büyük editorial hero
- cover image
- optional TOC
- temiz reading width
- güçlü başlık hiyerarşisi
- alıntı / callout blokları
- related meditation
- related articles
- CTA
- share actions
- Article JSON-LD
- canonical
- OG image

---

# 13. Meditasyonlar sayfası

Route:

```text
/pratik
```

Mevcut global meditation deneyimi korunarak:

- kategori filtreleri
- image-first cards
- süre
- level
- guidance mode
- player/detail link
- light tema ile liste görünümü
- meditation experience içinde dark tema opsiyonu

---

# 14. Hakkımda

Route:

```text
/hakkimda
```

Prototip görsel yönü:

- güçlü portre
- kısa hikâye
- yaklaşım
- pratik ve öğretim geçmişi
- nasıl çalışıyorum
- CTA

Kişisel bilgiler yalnızca canonical içerikten gelmelidir; model tarafından uydurulmamalıdır.

---

# 15. Birebir çalışma

Route:

```text
/birebir-meditasyon
```

Ana dönüşüm sayfası.

Bölümler:

1. Hero
2. Programın temel farkı
3. 6 aşamalı çalışma süreci
4. Görüşmeler arasında takip
5. Örnek hafta
6. Kimler için?
7. Kimler için değil?
8. Öğrenci deneyimleri
9. Eğitmen hakkında
10. Ücret
11. FAQ
12. Tanışma görüşmesi CTA

Takip sistemi anonim demo görselle anlatılmalıdır.

---

# 16. Public navigation

Desktop:

```text
Sakin Zihin

Meditasyonlar
Okumalar
Hakkımda
Birebir Çalışma
[Tanışma Görüşmesi]
[Theme toggle]
```

Mobile:

- sade header
- hamburger menu
- CTA menü içinde görünür
- app tarzı bottom navigation yok

---

# 17. SEO

V1'de:

- sitemap.xml
- robots.txt
- canonical
- metadata
- OpenGraph
- Twitter cards
- Article JSON-LD
- BreadcrumbList
- WebSite
- Person (yalnızca doğrulanmış veri)
- FAQPage (görünür FAQ ile)
- semantic HTML
- internal linking
- server-rendered article content

Okuma sayfaları SEO için ana trafik yüzeyi olacaktır.

---

# 18. Analytics

Typed provider-neutral event layer:

```text
landing_view
reading_view
reading_cta_click
meditation_view
meditation_start
meditation_complete
one_to_one_page_view
one_to_one_cta_click
whatsapp_click
intro_call_click
```

Ana conversion:

```text
Organic Visit
→ Content Consumption
→ Birebir Page
→ CTA
→ Intro Call
→ Student
```

---

# 19. Performans

Özellikle public ve SEO sayfalarında:

- server components
- minimum client JS
- next/image
- responsive images
- optimized fonts
- ISR/cache
- no layout shift
- lazy load below fold
- stable LCP
- no unnecessary animation library

---

# 20. Accessibility

- keyboard navigation
- visible focus states
- sufficient contrast
- semantic landmarks
- correct heading hierarchy
- accessible menus
- alt text
- reduced motion
- button/link semantics

---

# 21. Güvenlik ve gizlilik

Public bundle ve HTML içine asla:

- öğrenci isimleri
- refleksiyonlar
- telefonlar
- ödeme verileri
- admin endpoint verileri
- private IDs
- secret/token

girmemelidir.

Gerçek portal screenshot kullanılacaksa tamamen anonimleştirilmiş olmalıdır. Tercihen marketing için özel demo component oluşturulmalıdır.

---

# 22. V1 kapsamı

## Yapılacak

- `apps/sakinzihin-web`
- light/dark theme
- homepage
- `/oku`
- `/oku/[slug]`
- prerendered/server-rendered reading experience
- `/pratik`
- mevcut meditation detail/player entegrasyonu
- `/hakkimda`
- `/birebir-meditasyon`
- public navigation
- footer
- visual system
- image support
- SEO
- analytics
- responsive design

## Yapılmayacak

- yeni CMS
- yeni database
- community
- student login
- public student dashboard
- Student Pulse
- yeni AI agent
- yeni CRM
- yeni ödeme platformu
- gereksiz personalization

---

# 23. Uygulama sırası

## Phase 1 — Repository audit

- public APIs
- reading pipeline
- meditation pipeline
- media/storage
- shared packages
- existing Sakin Zihin code
- deployment conventions

## Phase 2 — Design foundation

- semantic tokens
- light/dark themes
- typography
- spacing
- header/footer
- responsive layout
- reusable image treatment

## Phase 3 — Reading refactor

- list
- detail
- remove section picker
- server render
- public-ready filtering
- image support
- related content
- SEO

## Phase 4 — Meditation integration

- existing working experience preserved
- public design harmonization

## Phase 5 — Homepage

- prototype-based implementation
- content sections
- images
- CTA

## Phase 6 — About + One-to-One

- conversion pages
- demo tracking system
- FAQ
- CTA

## Phase 7 — SEO / analytics / QA

- structured data
- sitemap
- robots
- analytics
- mobile QA
- performance
- accessibility
- regression checks

---

# 24. Definition of Done

V1 tamamlanmış sayılır, eğer:

- `sakinzihin.com` bağımsız deploy edilebilir
- light tema prototip görsellere yakın görünür
- dark tema marka dilini korur
- mevcut meditation experience bozulmaz
- okumalar public'te loading/"hazırlanıyor" göstermez
- okuma içeriği ilk HTML'de bulunur
- section picker yerine editorial akış vardır
- image system çalışır
- tüm gerçek public content mevcut backend'den gelir
- homepage prototip yönünde tamamlanır
- `/oku`, `/oku/[slug]`, `/pratik`, `/hakkimda`, `/birebir-meditasyon` çalışır
- SEO metadata ve structured data geçerlidir
- mobile polished görünür
- gerçek öğrenci verisi sızmaz
- lint/typecheck/build/test ilgili scope'ta geçer

---

# 25. Ana ürün kriteri

Kullanıcı siteye geldiğinde 30 saniye içinde:

- buranın ne olduğunu
- kendisine ne sunduğunu
- nereden başlayabileceğini
- birebir programın neden farklı olduğunu

anlayabilmelidir.

Ve okuma sayfasına gelen kullanıcı:

> “Bir uygulamada içerik görüntülüyorum” değil, “iyi hazırlanmış bir yayın okuyorum”

hissini almalıdır.
