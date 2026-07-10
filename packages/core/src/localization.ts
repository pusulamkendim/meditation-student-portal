export const defaultLocale = 'tr-TR';

export function resolveLocale(preferredLocale?: string, channelLocale?: string): string {
  return preferredLocale ?? channelLocale ?? defaultLocale;
}

export function localeFallbackChain(locale: string): string[] {
  const primaryLanguage = locale.split('-')[0];
  return [...new Set([locale, primaryLanguage, defaultLocale])];
}
