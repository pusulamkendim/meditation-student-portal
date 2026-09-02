import { describe, expect, it, vi } from 'vitest';

import { PublicAnalyticsService } from './public-analytics.service.js';

describe('PublicAnalyticsService', () => {
  it.each(['whatsapp_click', 'page_view'])(
    'stores %s with existing anonymous context and strips referrer query data',
    async (event) => {
      const create = vi.fn().mockResolvedValue(undefined);
      const service = new PublicAnalyticsService({ publicAnalyticsEvent: { create } } as never);

      await service.record({
        event,
        sessionId: '0123456789abcdef0123456789abcdef',
        pathname: '/birebir-meditasyon',
        slug: 'nefese-donus',
        location: 'pricing',
        utm_source: 'instagram',
        utm_medium: 'social',
        utm_campaign: 'eylul',
        referrer: 'https://instagram.com/p/abc?user=email@example.com#tracking',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          eventName: event,
          sessionId: '0123456789abcdef0123456789abcdef',
          pathname: '/birebir-meditasyon',
          slug: 'nefese-donus',
          location: 'pricing',
          source: 'instagram',
          medium: 'social',
          campaign: 'eylul',
          referrer: 'https://instagram.com/p/abc',
        },
      });
    },
  );
});
