import { describe, expect, it } from 'vitest';

import {
  calculateChangePercent,
  calculateConversionRate,
  normalizeTrafficSource,
  siteOverviewPeriod,
} from './site-overview.helpers.js';

describe('site overview helpers', () => {
  it('creates equal current and previous periods for each supported range', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const period = siteOverviewPeriod('7d', now);

    expect(period.start.toISOString()).toBe('2026-08-26T12:00:00.000Z');
    expect(period.previousStart.toISOString()).toBe('2026-08-19T12:00:00.000Z');
    expect(period.previousEnd.toISOString()).toBe(period.start.toISOString());
  });

  it('does not manufacture a percentage when the previous period is empty', () => {
    expect(calculateChangePercent(12, 0)).toBeNull();
    expect(calculateChangePercent(0, 0)).toBeNull();
    expect(calculateChangePercent(12, 10)).toBe(20);
    expect(calculateChangePercent(4, 10)).toBe(-60);
  });

  it('returns null for a zero denominator and a rounded rate otherwise', () => {
    expect(calculateConversionRate(0, 0)).toBeNull();
    expect(calculateConversionRate(12, 486)).toBe(2.5);
  });

  it('prioritizes UTM source and falls back to the referrer hostname', () => {
    expect(normalizeTrafficSource('instagram', 'https://google.com/search')).toBe('Instagram');
    expect(normalizeTrafficSource('ig', null)).toBe('Instagram');
    expect(normalizeTrafficSource(null, 'https://l.instagram.com/somewhere')).toBe('Instagram');
    expect(normalizeTrafficSource(null, 'https://www.google.com.tr/search')).toBe('Google');
    expect(normalizeTrafficSource(null, 'https://wa.me/905551112233')).toBe('WhatsApp');
    expect(normalizeTrafficSource(null, 'https://www.reddit.com/r/Meditation')).toBe('Reddit');
    expect(normalizeTrafficSource('direct', 'https://www.reddit.com/r/Meditation')).toBe('Reddit');
    expect(normalizeTrafficSource(null, 'https://www.linkedin.com/feed')).toBe('LinkedIn');
    expect(normalizeTrafficSource(null, 'http://m.facebook.com/story.php')).toBe('Facebook');
    expect(normalizeTrafficSource(null, null)).toBe('Direkt');
    expect(normalizeTrafficSource(null, 'https://example.com/article')).toBe('Diğer');
    expect(normalizeTrafficSource('newsletter', null)).toBe('newsletter');
  });
});
