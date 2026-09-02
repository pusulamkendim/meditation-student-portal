import { describe, expect, it, vi } from 'vitest';

import { SiteOverviewController } from './site-overview.controller.js';

describe('SiteOverviewController', () => {
  it.each(['7d', '30d', '90d'] as const)('accepts %s', async (range) => {
    const overview = vi.fn().mockResolvedValue({ range });
    const controller = new SiteOverviewController({ overview } as never);

    await expect(controller.overview(range)).resolves.toEqual({ range });
    expect(overview).toHaveBeenCalledWith(range);
  });

  it('defaults to 30d', async () => {
    const overview = vi.fn().mockResolvedValue({ range: '30d' });
    const controller = new SiteOverviewController({ overview } as never);

    await expect(controller.overview()).resolves.toEqual({ range: '30d' });
    expect(overview).toHaveBeenCalledWith('30d');
  });

  it('rejects an unsupported range with a 400 error', () => {
    const controller = new SiteOverviewController({ overview: vi.fn() } as never);

    expect(() => controller.overview('365d')).toThrow('Geçersiz site analitiği tarih aralığı.');
  });
});
