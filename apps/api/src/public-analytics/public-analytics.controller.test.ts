import { describe, expect, it, vi } from 'vitest';

import { PublicAnalyticsController } from './public-analytics.controller.js';

describe('PublicAnalyticsController', () => {
  it.each(['/', '/oku/nefes', '/meditasyon/nefes', '/pratik', '/hakkimda', '/birebir-meditasyon'])(
    'accepts a global page_view for %s with the existing attribution fields',
    async (pathname) => {
      const record = vi.fn().mockResolvedValue(undefined);
      const controller = new PublicAnalyticsController({ record } as never);
      const payload = {
        event: 'page_view',
        sessionId: '0123456789abcdef0123456789abcdef',
        pathname,
        utm_source: 'google',
        utm_medium: 'organic',
        utm_campaign: 'nefes',
        referrer: 'https://www.google.com/',
      };

      await expect(controller.event(payload)).resolves.toBeUndefined();
      expect(record).toHaveBeenCalledExactlyOnceWith(payload);
    },
  );

  it('accepts a supported anonymous event', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const controller = new PublicAnalyticsController({ record } as never);

    await expect(
      controller.event({
        event: 'landing_view',
        sessionId: '0123456789abcdef0123456789abcdef',
        pathname: '/',
        utm_source: 'instagram',
      }),
    ).resolves.toBeUndefined();

    expect(record).toHaveBeenCalledWith({
      event: 'landing_view',
      sessionId: '0123456789abcdef0123456789abcdef',
      pathname: '/',
      utm_source: 'instagram',
    });
  });

  it('rejects unknown event fields and unsupported event names', async () => {
    const controller = new PublicAnalyticsController({ record: vi.fn() } as never);

    await expect(
      controller.event({
        event: 'unknown_event',
        sessionId: '0123456789abcdef0123456789abcdef',
        pathname: '/',
      }),
    ).rejects.toThrow('Geçersiz analytics olayı.');

    await expect(
      controller.event({
        event: 'landing_view',
        sessionId: '0123456789abcdef0123456789abcdef',
        pathname: '/',
        message: 'private data should not be accepted',
      }),
    ).rejects.toThrow('Geçersiz analytics olayı.');
  });
});
