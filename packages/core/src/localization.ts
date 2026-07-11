export const defaultLocale = 'tr-TR';

export function resolveLocale(preferredLocale?: string, channelLocale?: string): string {
  return canonicalizeLocale(preferredLocale ?? channelLocale ?? defaultLocale);
}

export function localeFallbackChain(locale: string): string[] {
  const canonical = canonicalizeLocale(locale);
  const primaryLanguage = canonical.split('-')[0]!;
  return [...new Set([canonical, primaryLanguage, defaultLocale])];
}

export function canonicalizeLocale(locale: string): string {
  try {
    return new Intl.Locale(locale).toString();
  } catch {
    throw new Error(`Invalid BCP 47 locale: ${locale}`);
  }
}
