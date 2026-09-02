import { describe, expect, it, vi } from 'vitest';

import { FakeClock } from '@meditation/core';

import { SiteOverviewService } from './site-overview.service.js';

const emptyEventSummary = {
  sessions: 0n,
  site_entries: 0n,
  content_views: 0n,
  content_sessions: 0n,
  one_to_one_views: 0n,
  one_to_one_sessions: 0n,
  cta_clicks: 0n,
  conversion_clicks: 0n,
  conversion_sessions: 0n,
};

function emptyPrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    reading: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    meditationType: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('SiteOverviewService', () => {
  it('returns a complete zero-state response without NaN values', async () => {
    const prisma = emptyPrisma();
    const service = new SiteOverviewService(
      prisma as never,
      new FakeClock('2026-09-02T12:00:00.000Z'),
    );

    const result = await service.overview('30d');

    expect(result).toMatchObject({
      range: '30d',
      summary: {
        sessions: { value: 0, previous: 0, changePercent: null },
        siteEntries: { value: 0, previous: 0, changePercent: null },
        contentViews: { value: 0, previous: 0, changePercent: null },
        ctaClicks: { value: 0, previous: 0, changePercent: null },
      },
      daily: [],
      funnel: {
        siteEntries: 0,
        contentViews: 0,
        oneToOneViews: 0,
        conversionClicks: 0,
        conversionEvents: 0,
        rates: {
          siteEntries: null,
          contentViews: null,
          oneToOneViews: null,
          conversionClicks: null,
        },
      },
      content: [],
      trafficSources: [],
      attention: [],
      recentContent: [],
    });
    expect(JSON.stringify(result)).not.toContain('NaN');
  });

  it('maps reading and meditation metrics into one content DTO', async () => {
    const prisma = emptyPrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { ...emptyEventSummary, sessions: 10n, cta_clicks: 7n, conversion_clicks: 3n },
      ])
      .mockResolvedValueOnce([{ ...emptyEventSummary, sessions: 5n }])
      .mockResolvedValueOnce([
        { date: '2026-09-01', sessions: 4n, content_views: 3n, cta_clicks: 1n },
      ])
      .mockResolvedValueOnce([{ source: 'instagram', referrer: null, sessions: 4n }])
      .mockResolvedValueOnce([
        {
          id: 'reading-id',
          slug: 'fark-etmek',
          title: 'Fark Etmek',
          published_at: new Date('2026-08-20T10:00:00.000Z'),
          cover_image_storage_key: 'reading-cover',
          cover_image_hash: 'reading-hash',
          average_progress: 72.25,
          cta_clicks: 2n,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'meditation-id',
          slug: 'nefes',
          title: 'Nefes',
          published_at: new Date('2026-08-21T10:00:00.000Z'),
          cover_image_storage_key: null,
          cover_image_hash: null,
          starts: 4n,
          completions: 3n,
          cta_clicks: 1n,
        },
      ])
      .mockResolvedValueOnce([
        { event_name: 'reading_view', slug: 'fark-etmek', sessions: 3n },
        { event_name: 'meditation_view', slug: 'nefes', sessions: 2n },
      ]);

    const service = new SiteOverviewService(
      prisma as never,
      new FakeClock('2026-09-02T12:00:00.000Z'),
    );
    const result = await service.overview('30d');

    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'READING',
        sessions: 3,
        engagement: { value: 72.3, kind: 'AVERAGE_PROGRESS' },
        ctaClicks: 2,
        conversionRate: 66.7,
      }),
      expect.objectContaining({
        type: 'MEDITATION',
        sessions: 2,
        engagement: { value: 75, kind: 'COMPLETION_RATE' },
        ctaClicks: 1,
        conversionRate: 50,
      }),
    ]);
    expect(result.summary.ctaClicks.value).toBe(7);
    expect(result.funnel.conversionEvents).toBe(3);
    expect(result.trafficSources).toEqual([{ source: 'Instagram', sessions: 4 }]);
  });
});
