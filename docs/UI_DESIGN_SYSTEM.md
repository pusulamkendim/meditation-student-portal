# UI Tasarım Sistemi

## Amaç

Admin portalı ve gelecekteki öğrenci portalı aynı görsel dil ile ortak, erişilebilir bileşenleri kullanır. Admin ekranları tarama ve tekrarlı işlem için yoğun; öğrenci ekranları mobil öncelikli ve daha sakin kurgulanır.

## Paketler

- `@meditation/design-tokens`: renk, tipografi, aralık, radius, gölge, odak ve hareket tokenları.
- `@meditation/ui`: Button, TextField, SegmentedControl, Badge, Alert, PageHeader, Metric, EmptyState, Skeleton ve MessageBubble.
- `apps/admin/app/(portal)/ui-preview`: bileşen ve sistem durumlarının canlı referans ekranı.

Uygulamalar önce `tokens.css`, sonra `styles.css`, en son uygulamaya özel CSS dosyasını yükler. Uygulama CSS'i ortak bileşenlerin iç yapısına müdahale etmez.

## Görsel Dil

- Ana yüzeyler nötr gri-yeşil; marka rengi koyu yeşil; sıcak vurgu yalnızca dikkat gereken içerikte kullanılır.
- Başarı, uyarı, hata ve bilgi renkleri semantik anlam taşır; tek başına renk ile bilgi verilmez.
- Kart radius değeri en fazla 8px'tir. İç içe kart kullanılmaz.
- Başlıklar ekran bağlamına göre ölçülür; panel içinde hero ölçeği kullanılmaz.
- Metinlerde harf aralığı `0` kalır. Font boyutu viewport genişliğine göre ölçeklenmez.

## Durum Sözleşmesi

Her veri ekranı şu durumları açıkça ele alır:

1. İlk yükleme: yerleşimi koruyan `Skeleton`.
2. Boş sonuç: neden ve mümkünse tek bir sonraki komut içeren `EmptyState`.
3. İşlem sürüyor: ilgili `Button` üzerinde `loading`; tüm sayfa bloke edilmez.
4. Başarı/uyarı/hata: semantik `Alert`; kısa durumlar için `Badge`.
5. Mesajlaşma: inbound/outbound yönü, kanal ve zaman `MessageBubble` ile görünür.

## Erişilebilirlik ve Responsive

- Kontroller en az 40px; mobil alt navigasyon hedefleri 52px'tir.
- Klavye odağı görünür ve token ile standarttır.
- Form hataları alanla `aria-describedby` üzerinden ilişkilidir.
- Hareket azaltma tercihi loading animasyonlarını kapatır.
- 760px altında admin navigasyonu sabit alt bara dönüşür. İkincil ekranlar mobil menüye taşınacaktır.

## Kullanım İlkesi

Yeni ortak görsel karar önce token veya `@meditation/ui` bileşeni olarak eklenir. Yalnızca tek uygulamaya ait sayfa yerleşimleri uygulamanın CSS dosyasında tutulur. Ham hex renk ve tekrar eden kontrol stilleri sayfa bileşenlerine yazılmaz.
