import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_TOKEN, type Clock } from '@meditation/core';
import { Prisma } from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';
import {
  calculateChangePercent,
  calculateConversionRate,
  normalizeTrafficSource,
  siteOverviewPeriod,
  type SiteOverviewRange,
} from './site-overview.helpers.js';

type Numeric = bigint | number;

type EventSummaryRow = {
  sessions: Numeric;
  site_entries: Numeric;
  content_views: Numeric;
  content_sessions: Numeric;
  one_to_one_views: Numeric;
  one_to_one_sessions: Numeric;
  cta_clicks: Numeric;
  conversion_clicks: Numeric;
  conversion_sessions: Numeric;
};

type DailyEventRow = {
  date: string;
  sessions: Numeric;
  content_views: Numeric;
  cta_clicks: Numeric;
};

type TrafficSourceRow = {
  source: string | null;
  referrer: string | null;
  sessions: Numeric;
};

type ContentEventRow = {
  event_name: string;
  slug: string | null;
  sessions: Numeric;
};

type ReadingPerformanceRow = {
  id: string;
  slug: string;
  title: string;
  published_at: Date;
  cover_image_storage_key: string | null;
  cover_image_hash: string | null;
  average_progress: number | null;
  cta_clicks: Numeric;
};

type MeditationPerformanceRow = {
  id: string;
  slug: string;
  title: string;
  published_at: Date;
  cover_image_storage_key: string | null;
  cover_image_hash: string | null;
  starts: Numeric;
  completions: Numeric;
  cta_clicks: Numeric;
};

type RecentReading = { id: string; title: string; updatedAt: Date };
type RecentMeditation = { id: string; title: string; updatedAt: Date };

export type SiteMetric = {
  value: number;
  previous: number;
  changePercent: number | null;
};

export type SiteContentPerformanceItem = {
  type: 'READING' | 'MEDITATION';
  id: string;
  slug: string | null;
  title: string;
  publishedAt: string | null;
  coverImageUrl: string | null;
  sessions: number;
  engagement: {
    value: number | null;
    kind: 'AVERAGE_PROGRESS' | 'COMPLETION_RATE';
  };
  ctaClicks: number;
  conversionRate: number | null;
  adminHref: string;
};

export type SiteRecentContentItem = {
  type: 'READING' | 'MEDITATION';
  id: string;
  title: string;
  publishedAt: string;
  adminHref: string;
};

export type SiteAttentionItem = {
  kind: 'DRAFT_CONTENT' | 'MISSING_COVER' | 'STALE_PUBLISHING';
  title: string;
  detail: string;
  href: string;
};

export type SiteOverviewResponse = {
  range: SiteOverviewRange;
  summary: {
    sessions: SiteMetric;
    siteEntries: SiteMetric;
    contentViews: SiteMetric;
    ctaClicks: SiteMetric;
  };
  daily: Array<{
    date: string;
    sessions: number;
    contentViews: number;
    ctaClicks: number;
  }>;
  funnel: {
    siteEntries: number;
    contentViews: number;
    oneToOneViews: number;
    conversionClicks: number;
    conversionEvents: number;
    rates: {
      siteEntries: number | null;
      contentViews: number | null;
      oneToOneViews: number | null;
      conversionClicks: number | null;
    };
  };
  content: SiteContentPerformanceItem[];
  trafficSources: Array<{ source: string; sessions: number }>;
  attention: SiteAttentionItem[];
  recentContent: SiteRecentContentItem[];
  generatedAt: string;
};

function asNumber(value: Numeric | null | undefined) {
  return typeof value === 'bigint' ? Number(value) : (value ?? 0);
}

function asNullableNumber(value: number | null | undefined) {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

function percentage(value: number, denominator: number) {
  return calculateConversionRate(value, denominator);
}

function imagePath(type: 'READING' | 'MEDITATION', slug: string, hash: string | null) {
  const path =
    type === 'READING'
      ? `/v1/readings/public/${encodeURIComponent(slug)}/image`
      : `/v1/public/meditations/${encodeURIComponent(slug)}/image`;
  return hash ? `${path}?v=${encodeURIComponent(hash.slice(0, 16))}` : path;
}

function eventMetricKey(eventName: string, slug: string | null) {
  return `${eventName}:${slug ?? ''}`;
}

@Injectable()
export class SiteOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async overview(range: SiteOverviewRange): Promise<SiteOverviewResponse> {
    const now = this.clock.now();
    const period = siteOverviewPeriod(range, now);
    const [
      current,
      previous,
      daily,
      trafficSources,
      contentRows,
      contentEvents,
      attention,
      recent,
    ] = await Promise.all([
      this.eventSummary(period.start, period.end),
      this.eventSummary(period.previousStart, period.previousEnd),
      this.dailyEvents(period.start, period.end),
      this.trafficSources(period.start, period.end),
      this.contentPerformance(period.start, period.end),
      this.contentEventMetrics(period.start, period.end),
      this.editorialAttention(now),
      this.recentContent(),
    ]);

    const contentEventsByKey = new Map(
      contentEvents.map((item) => [
        eventMetricKey(item.event_name, item.slug),
        asNumber(item.sessions),
      ]),
    );
    const content = contentRows.map((item) => this.mapContentItem(item, contentEventsByKey));
    const contentViews = current.contentViews;
    const contentSessions = current.contentSessions;

    return {
      range,
      summary: {
        sessions: this.metric(current.sessions, previous.sessions),
        siteEntries: this.metric(current.siteEntries, previous.siteEntries),
        contentViews: this.metric(contentViews, previous.contentViews),
        ctaClicks: this.metric(current.ctaClicks, previous.ctaClicks),
      },
      daily,
      funnel: {
        siteEntries: current.siteEntries,
        contentViews: contentSessions,
        oneToOneViews: current.oneToOneSessions,
        conversionClicks: current.conversionSessions,
        conversionEvents: current.conversionClicks,
        rates: {
          siteEntries: current.siteEntries ? 100 : null,
          contentViews: percentage(contentSessions, current.siteEntries),
          oneToOneViews: percentage(current.oneToOneSessions, contentSessions),
          conversionClicks: percentage(current.conversionSessions, current.oneToOneSessions),
        },
      },
      content,
      trafficSources,
      attention,
      recentContent: recent,
      generatedAt: now.toISOString(),
    };
  }

  private metric(value: number, previous: number): SiteMetric {
    return { value, previous, changePercent: calculateChangePercent(value, previous) };
  }

  private async eventSummary(start: Date, end: Date) {
    const [row] = await this.prisma.$queryRaw<EventSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT session_id)::bigint AS sessions,
        COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'landing_view')::bigint AS site_entries,
        COUNT(*) FILTER (WHERE event_name IN ('reading_view', 'meditation_view'))::bigint AS content_views,
        COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('reading_view', 'meditation_view'))::bigint AS content_sessions,
        COUNT(*) FILTER (WHERE event_name = 'one_to_one_page_view')::bigint AS one_to_one_views,
        COUNT(DISTINCT session_id) FILTER (WHERE event_name = 'one_to_one_page_view')::bigint AS one_to_one_sessions,
        COUNT(*) FILTER (WHERE event_name IN ('one_to_one_cta_click', 'whatsapp_click', 'intro_call_click'))::bigint AS cta_clicks,
        COUNT(*) FILTER (WHERE event_name IN ('whatsapp_click', 'intro_call_click'))::bigint AS conversion_clicks,
        COUNT(DISTINCT session_id) FILTER (WHERE event_name IN ('whatsapp_click', 'intro_call_click'))::bigint AS conversion_sessions
      FROM public_analytics_events
      WHERE created_at >= ${start} AND created_at < ${end}
    `);
    return {
      sessions: asNumber(row?.sessions),
      siteEntries: asNumber(row?.site_entries),
      contentViews: asNumber(row?.content_views),
      contentSessions: asNumber(row?.content_sessions),
      oneToOneViews: asNumber(row?.one_to_one_views),
      oneToOneSessions: asNumber(row?.one_to_one_sessions),
      ctaClicks: asNumber(row?.cta_clicks),
      conversionClicks: asNumber(row?.conversion_clicks),
      conversionSessions: asNumber(row?.conversion_sessions),
    };
  }

  private async dailyEvents(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<DailyEventRow[]>(Prisma.sql`
      SELECT
        TO_CHAR((created_at AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS date,
        COUNT(DISTINCT session_id)::bigint AS sessions,
        COUNT(*) FILTER (WHERE event_name IN ('reading_view', 'meditation_view'))::bigint AS content_views,
        COUNT(*) FILTER (WHERE event_name IN ('one_to_one_cta_click', 'whatsapp_click', 'intro_call_click'))::bigint AS cta_clicks
      FROM public_analytics_events
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY 1
      ORDER BY 1
    `);
    return rows.map((row) => ({
      date: row.date,
      sessions: asNumber(row.sessions),
      contentViews: asNumber(row.content_views),
      ctaClicks: asNumber(row.cta_clicks),
    }));
  }

  private async trafficSources(start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<TrafficSourceRow[]>(Prisma.sql`
      WITH first_touch AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          source,
          referrer
        FROM public_analytics_events
        WHERE created_at >= ${start} AND created_at < ${end}
        ORDER BY session_id, created_at, id
      )
      SELECT source, referrer, COUNT(*)::bigint AS sessions
      FROM first_touch
      GROUP BY source, referrer
    `);
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const source = normalizeTrafficSource(row.source, row.referrer);
      grouped.set(source, (grouped.get(source) ?? 0) + asNumber(row.sessions));
    }
    return [...grouped.entries()]
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((left, right) => right.sessions - left.sessions);
  }

  private async contentEventMetrics(start: Date, end: Date) {
    return this.prisma.$queryRaw<ContentEventRow[]>(Prisma.sql`
      SELECT
        event_name,
        slug,
        COUNT(DISTINCT session_id)::bigint AS sessions
      FROM public_analytics_events
      WHERE created_at >= ${start}
        AND created_at < ${end}
        AND slug IS NOT NULL
        AND event_name IN ('reading_view', 'meditation_view')
      GROUP BY event_name, slug
    `);
  }

  private async contentPerformance(start: Date, end: Date) {
    const [readings, meditations] = await Promise.all([
      this.prisma.$queryRaw<ReadingPerformanceRow[]>(Prisma.sql`
        SELECT
          r.id,
          rps.slug,
          r.title,
          r.updated_at AS published_at,
          r.cover_image_storage_key,
          r.cover_image_hash,
          AVG(rpv.progress_percent)::float AS average_progress,
          COALESCE(SUM(rpv.whatsapp_click_count), 0)::bigint AS cta_clicks
        FROM reading_public_shares rps
        INNER JOIN readings r ON r.id = rps.reading_id
        LEFT JOIN reading_public_visits rpv
          ON rpv.share_id = rps.id
         AND rpv.first_opened_at >= ${start}
         AND rpv.first_opened_at < ${end}
        WHERE rps.status = 'ACTIVE' AND r.status = 'PUBLISHED'
        GROUP BY r.id, rps.slug, r.title, r.updated_at, r.cover_image_storage_key, r.cover_image_hash
      `),
      this.prisma.$queryRaw<MeditationPerformanceRow[]>(Prisma.sql`
        SELECT
          mt.id,
          mps.slug,
          mt.title,
          mt.updated_at AS published_at,
          mt.cover_image_storage_key,
          mt.cover_image_hash,
          COALESCE(SUM(mpv.start_count), 0)::bigint AS starts,
          COALESCE(SUM(mpv.completion_count), 0)::bigint AS completions,
          COALESCE(SUM(mpv.cta_click_count), 0)::bigint AS cta_clicks
        FROM meditation_public_shares mps
        INNER JOIN meditation_types mt ON mt.id = mps.meditation_type_id
        LEFT JOIN meditation_public_visits mpv
          ON mpv.share_id = mps.id
         AND mpv.first_opened_at >= ${start}
         AND mpv.first_opened_at < ${end}
        WHERE mps.status = 'ACTIVE' AND mt.status = 'PUBLISHED'
        GROUP BY mt.id, mps.slug, mt.title, mt.updated_at, mt.cover_image_storage_key, mt.cover_image_hash
      `),
    ]);
    return [
      ...readings.map((item) => ({ type: 'READING' as const, ...item })),
      ...meditations.map((item) => ({ type: 'MEDITATION' as const, ...item })),
    ];
  }

  private mapContentItem(
    item:
      | (ReadingPerformanceRow & { type: 'READING' })
      | (MeditationPerformanceRow & { type: 'MEDITATION' }),
    eventMetrics: Map<string, number>,
  ): SiteContentPerformanceItem {
    const eventName = item.type === 'READING' ? 'reading_view' : 'meditation_view';
    const sessions = eventMetrics.get(eventMetricKey(eventName, item.slug)) ?? 0;
    const ctaClicks = asNumber(item.cta_clicks);
    const engagement =
      item.type === 'READING'
        ? {
            value: asNullableNumber(item.average_progress),
            kind: 'AVERAGE_PROGRESS' as const,
          }
        : {
            value: percentage(asNumber(item.completions), asNumber(item.starts)),
            kind: 'COMPLETION_RATE' as const,
          };
    return {
      type: item.type,
      id: item.id,
      slug: item.slug,
      title: item.title,
      // The schema has no immutable published_at field; publishing updates updated_at.
      publishedAt: item.published_at.toISOString(),
      coverImageUrl: item.cover_image_storage_key
        ? imagePath(item.type, item.slug, item.cover_image_hash)
        : null,
      sessions,
      engagement,
      ctaClicks,
      conversionRate: percentage(ctaClicks, sessions),
      adminHref: `/${item.type === 'READING' ? 'readings' : 'meditations'}?${item.type === 'READING' ? 'readingId' : 'meditationId'}=${encodeURIComponent(item.id)}`,
    };
  }

  private async editorialAttention(now: Date): Promise<SiteAttentionItem[]> {
    const staleThreshold = new Date(now.getTime() - 14 * 86_400_000);
    const [
      draftReadings,
      draftMeditations,
      missingReadingCovers,
      missingMeditationCovers,
      publishedReadings,
      publishedMeditations,
      recentReadings,
      recentMeditations,
    ] = await Promise.all([
      this.prisma.reading.count({ where: { status: 'DRAFT' } }),
      this.prisma.meditationType.count({ where: { status: 'DRAFT' } }),
      this.prisma.reading.count({ where: { status: 'PUBLISHED', coverImageStorageKey: null } }),
      this.prisma.meditationType.count({
        where: { status: 'PUBLISHED', coverImageStorageKey: null },
      }),
      this.prisma.reading.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.meditationType.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.reading.count({
        where: { status: 'PUBLISHED', updatedAt: { gte: staleThreshold } },
      }),
      this.prisma.meditationType.count({
        where: { status: 'PUBLISHED', updatedAt: { gte: staleThreshold } },
      }),
    ]);
    const attention: SiteAttentionItem[] = [];
    const draftCount = draftReadings + draftMeditations;
    const missingCoverCount = missingReadingCovers + missingMeditationCovers;
    if (draftCount) {
      attention.push({
        kind: 'DRAFT_CONTENT',
        title: `${draftCount} taslak içerik yayınlanmayı bekliyor`,
        detail: 'Okumalar ve meditasyonlar ekranında gözden geçirin.',
        href: draftReadings ? '/readings' : '/meditations',
      });
    }
    if (missingCoverCount) {
      attention.push({
        kind: 'MISSING_COVER',
        title: `${missingCoverCount} yayınlanmış içerikte kapak görseli yok`,
        detail: 'İçeriğin görünürlüğünü güçlendirmek için kapak ekleyin.',
        href: missingReadingCovers ? '/readings' : '/meditations',
      });
    }
    if (publishedMeditations > 0 && recentMeditations === 0) {
      attention.push({
        kind: 'STALE_PUBLISHING',
        title: 'Son 14 gündür yeni meditasyon yayınlanmadı',
        detail: 'Yayınlanan içeriğin son güncelleme tarihi baz alınır.',
        href: '/meditations',
      });
    }
    if (publishedReadings > 0 && recentReadings === 0) {
      attention.push({
        kind: 'STALE_PUBLISHING',
        title: 'Son 14 gündür yeni okuma yayınlanmadı',
        detail: 'Yayınlanan içeriğin son güncelleme tarihi baz alınır.',
        href: '/readings',
      });
    }
    return attention;
  }

  private async recentContent(): Promise<SiteRecentContentItem[]> {
    const [readings, meditations] = await Promise.all([
      this.prisma.reading.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true },
      }),
      this.prisma.meditationType.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true },
      }),
    ]);
    return [
      ...readings.map((item: RecentReading) => ({
        type: 'READING' as const,
        id: item.id,
        title: item.title,
        publishedAt: item.updatedAt.toISOString(),
        adminHref: `/readings?readingId=${encodeURIComponent(item.id)}`,
      })),
      ...meditations.map((item: RecentMeditation) => ({
        type: 'MEDITATION' as const,
        id: item.id,
        title: item.title,
        publishedAt: item.updatedAt.toISOString(),
        adminHref: `/meditations?meditationId=${encodeURIComponent(item.id)}`,
      })),
    ]
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, 5);
  }
}
