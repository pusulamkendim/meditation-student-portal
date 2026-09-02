import { describe, expect, it, vi } from 'vitest';

import { FakeClock } from '@meditation/core';

import { SiteOverviewService } from './site-overview.service.js';

const emptyEventSummary = {
  sessions: 0n,
  page_views: 0n,
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
        pageViews: { value: 0, previous: 0, changePercent: null },
        contentViews: { value: 0, previous: 0, changePercent: null },
        ctaClicks: { value: 0, previous: 0, changePercent: null },
      },
      daily: [],
      funnel: {
        sessions: 0,
        contentViews: 0,
        oneToOneViews: 0,
        conversionClicks: 0,
        conversionEvents: 0,
        rates: {
          sessions: null,
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
          readers: 4n,
          completions: 1n,
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
        engagement: { value: 25, kind: 'COMPLETION_RATE' },
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

  it.each(['7d', '30d', '90d'] as const)(
    'compares total page views while keeping the %s funnel session-based',
    async (range) => {
      const prisma = emptyPrisma();
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            ...emptyEventSummary,
            sessions: 10n,
            page_views: 30n,
            content_views: 12n,
            content_sessions: 4n,
            one_to_one_views: 9n,
            one_to_one_sessions: 3n,
            cta_clicks: 7n,
            conversion_clicks: 5n,
            conversion_sessions: 2n,
          },
        ])
        .mockResolvedValueOnce([{ ...emptyEventSummary, sessions: 4n, page_views: 20n }]);
      const now = new Date('2026-09-02T12:00:00.000Z');
      const service = new SiteOverviewService(prisma as never, new FakeClock(now));

      const result = await service.overview(range);

      expect(result.summary).toEqual({
        sessions: { value: 10, previous: 4, changePercent: 150 },
        pageViews: { value: 30, previous: 20, changePercent: 50 },
        contentViews: { value: 12, previous: 0, changePercent: null },
        ctaClicks: { value: 7, previous: 0, changePercent: null },
      });
      expect(result.funnel).toEqual({
        sessions: 10,
        contentViews: 4,
        oneToOneViews: 3,
        conversionClicks: 2,
        conversionEvents: 5,
        rates: { sessions: 100, contentViews: 40, oneToOneViews: 75, conversionClicks: 66.7 },
      });

      const currentQuery = prisma.$queryRaw.mock.calls[0][0];
      const previousQuery = prisma.$queryRaw.mock.calls[1][0];
      for (const query of [currentQuery, previousQuery]) {
        expect(query.text).toContain(
          "COUNT(*) FILTER (WHERE event_name = 'page_view')::bigint AS page_views",
        );
        expect(query.text).toContain('COUNT(DISTINCT session_id)::bigint AS sessions');
        expect(query.text).not.toContain('landing_view');
        expect(query.text).toContain('WHERE created_at >= $1 AND created_at < $2');
      }
      const duration = Number(range.slice(0, -1)) * 86_400_000;
      const start = new Date(now.getTime() - duration);
      expect(currentQuery.values).toEqual([start, now]);
      expect(previousQuery.values).toEqual([new Date(start.getTime() - duration), start]);
    },
  );

  it.each([0n, 1n, 3n])(
    'keeps a direct content session in the funnel independently of its %s page views',
    async (pageViews) => {
      const prisma = emptyPrisma();
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ...emptyEventSummary,
          sessions: 1n,
          page_views: pageViews,
          content_views: 2n,
          content_sessions: 1n,
        },
      ]);
      const service = new SiteOverviewService(
        prisma as never,
        new FakeClock('2026-09-02T12:00:00.000Z'),
      );

      const result = await service.overview('30d');

      expect(result.summary.pageViews.value).toBe(Number(pageViews));
      expect(result.funnel.sessions).toBe(1);
      expect(result.funnel.contentViews).toBe(1);
      expect(result.funnel.rates.contentViews).toBe(100);
    },
  );

  it.each([
    { readers: 0n, completions: 0n, expected: null },
    { readers: 4n, completions: 0n, expected: 0 },
    { readers: 3n, completions: 1n, expected: 33.3 },
    { readers: 3n, completions: 3n, expected: 100 },
  ])(
    'reports reading completion rate $expected for $completions of $readers readers',
    async ({ readers, completions, expected }) => {
      const prisma = emptyPrisma();
      prisma.$queryRaw.mockImplementation(async (query: { text: string }) => {
        if (!query.text.includes('FROM reading_public_shares')) return [];
        return [
          {
            id: 'reading-id',
            slug: 'fark-etmek',
            title: 'Fark Etmek',
            published_at: new Date('2026-08-20T10:00:00.000Z'),
            cover_image_storage_key: null,
            cover_image_hash: null,
            readers,
            completions,
            cta_clicks: 0n,
          },
        ];
      });
      const service = new SiteOverviewService(
        prisma as never,
        new FakeClock('2026-09-02T12:00:00.000Z'),
      );

      const result = await service.overview('30d');

      expect(result.content[0]?.engagement).toEqual({
        value: expected,
        kind: 'COMPLETION_RATE',
      });
    },
  );
});
