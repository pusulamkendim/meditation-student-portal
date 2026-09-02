export const SITE_OVERVIEW_RANGES = ['7d', '30d', '90d'] as const;
export type SiteOverviewRange = (typeof SITE_OVERVIEW_RANGES)[number];

const dayMilliseconds = 86_400_000;

export function isSiteOverviewRange(value: string): value is SiteOverviewRange {
  return (SITE_OVERVIEW_RANGES as readonly string[]).includes(value);
}

export function siteOverviewPeriod(range: SiteOverviewRange, now: Date) {
  const days = Number(range.slice(0, -1));
  const end = new Date(now);
  const start = new Date(end.getTime() - days * dayMilliseconds);
  const previousStart = new Date(start.getTime() - days * dayMilliseconds);
  return { days, start, end, previousStart, previousEnd: start };
}

export function calculateChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function calculateConversionRate(value: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((value / denominator) * 1000) / 10;
}

function normalized(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/^www\./u, '');
}

function referrerHostname(referrer: string | null | undefined) {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    return normalized(url.hostname);
  } catch {
    return undefined;
  }
}

function isInstagram(value: string) {
  return value === 'instagram' || value === 'instagram.com' || value.endsWith('.instagram.com');
}

function isGoogle(value: string) {
  return value === 'google' || value === 'google.com' || /^google\.[a-z.]+$/u.test(value);
}

function isWhatsApp(value: string) {
  return (
    value === 'whatsapp' ||
    value === 'wa.me' ||
    value === 'whatsapp.com' ||
    value.endsWith('.whatsapp.com')
  );
}

export function normalizeTrafficSource(
  source: string | null | undefined,
  referrer: string | null | undefined,
): string {
  const sourceValue = source ? normalized(source) : '';
  const referrerValue = referrerHostname(referrer) ?? '';
  const candidate = sourceValue || referrerValue;

  if (!candidate || candidate === 'direct' || candidate === 'none') return 'Direkt';
  if (isInstagram(candidate)) return 'Instagram';
  if (isGoogle(candidate)) return 'Google';
  if (isWhatsApp(candidate)) return 'WhatsApp';
  return source?.trim() || 'Diğer';
}
