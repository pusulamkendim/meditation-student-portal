const trimOrigin = (value: string) => value.replace(/\/+$/u, '');

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER ?? '905428078429';
const whatsappText =
  process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE ??
  'Merhaba, Sakin Zihin birebir meditasyon çalışması hakkında bilgi almak istiyorum.';
const introCallWhatsappText =
  process.env.NEXT_PUBLIC_INTRO_CALL_WHATSAPP_MESSAGE ??
  'Merhaba, Sakin Zihin birebir meditasyon çalışması için ücretsiz tanışma görüşmesi yapmak istiyorum.';

export const siteConfig = {
  name: 'Sakin Zihin',
  siteUrl: trimOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sakinzihin.com'),
  apiUrl: trimOrigin(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'),
  legacyOrigin: trimOrigin(
    process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN ?? 'https://portal.pusulamkendim.com',
  ),
  description:
    'Meditasyonu, okumaları ve kişiye özel pratiği gündelik hayatı daha açık görebilmenin bir yolu olarak keşfet.',
  price: '4.000 TL',
  links: {
    whatsapp: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappText)}`,
    introCallWhatsapp: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(introCallWhatsappText)}`,
    whatsappNumber,
  },
} as const;

export const publicRoutes = {
  home: '/',
  readings: '/oku',
  meditations: '/pratik',
  about: '/hakkimda',
  oneToOne: '/birebir-meditasyon',
} as const;
