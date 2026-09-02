import { randomBytes } from 'node:crypto';
import { FakeClock, LookupHmac, createPracticePlayerToken } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import {
  MeditationService,
  reconcilePublicShareDurations,
  validateMeditationAudio,
} from './meditation.service.js';

describe('reconcilePublicShareDurations', () => {
  it('removes deleted durations and moves an obsolete default to the first retained duration', () => {
    expect(reconcilePublicShareDurations([15, 25], [15, 20, 25, 30], 20)).toEqual({
      allowedDurations: [15, 25],
      defaultDurationMinutes: 15,
    });
  });

  it('uses the first current meditation duration when none of the old durations remain', () => {
    expect(reconcilePublicShareDurations([10, 12], [20, 30], 20)).toEqual({
      allowedDurations: [10],
      defaultDurationMinutes: 10,
    });
  });
});

describe('validateMeditationAudio', () => {
  it('accepts MP3 and M4A files whose content matches their extension', () => {
    expect(
      validateMeditationAudio({
        filename: 'baslangic.mp3',
        mimetype: 'audio/mpeg',
        buffer: Buffer.from('ID3valid-audio-placeholder'),
      }),
    ).toBe('mp3');

    const m4a = Buffer.alloc(16);
    m4a.write('ftyp', 4, 'ascii');
    expect(
      validateMeditationAudio({
        filename: 'bitis.m4a',
        mimetype: 'audio/mp4',
        buffer: m4a,
      }),
    ).toBe('m4a');
  });

  it('rejects a renamed or unsupported file before storage', () => {
    expect(() =>
      validateMeditationAudio({
        filename: 'ses.mp3',
        mimetype: 'audio/mpeg',
        buffer: Buffer.from('not-an-mp3'),
      }),
    ).toThrow('içeriği uzantısıyla uyuşmuyor');
    expect(() =>
      validateMeditationAudio({
        filename: 'ses.wav',
        mimetype: 'audio/wav',
        buffer: Buffer.from('RIFF'),
      }),
    ).toThrow('Yalnızca MP3 veya M4A');
  });
});

describe('MeditationService practice access', () => {
  const sessionId = '10000000-0000-4000-8000-000000000001';
  const startAt = new Date('2026-07-29T18:00:00.000Z');
  const clock = new FakeClock('2026-07-29T17:50:00.000Z');

  function fixture(sessionOverrides: Record<string, unknown> = {}) {
    const secret = randomBytes(32);
    const code = randomBytes(16).toString('base64url');
    const session = {
      id: sessionId,
      startAt,
      durationMinutes: 15,
      status: 'SCHEDULED',
      meditationType: {
        title: 'Doğal Nefes Farkındalığı',
        description: 'Nefesi doğal akışında gözlemle.',
      },
      meditationRender: null,
      ...sessionOverrides,
    };
    const prisma = {
      practiceSession: {
        findUnique: vi.fn(async () => session),
      },
      practiceAccessLink: {
        findUnique: vi.fn(async ({ where }) =>
          where.codeHmac === new LookupHmac(secret).digest(code)
            ? {
                startAt,
                expiresAt: new Date('2026-07-30T18:00:00.000Z'),
                invalidatedAt: null,
                practiceSession: session,
              }
            : null,
        ),
      },
    };
    const service = new MeditationService(
      prisma as never,
      { LOOKUP_HMAC_KEY: secret.toString('base64') } as never,
      { signedUrl: vi.fn(), get: vi.fn() } as never,
      clock,
    );
    const token = createPracticePlayerToken(secret, {
      sessionId,
      startAtEpochMs: startAt.getTime(),
      expiresAtEpochMs: startAt.getTime() + 24 * 60 * 60_000,
    });
    return { service, token, code };
  }

  it('returns the snapshotted practice duration without exposing student data', async () => {
    const { service, token } = fixture();

    await expect(service.practiceAccess(token)).resolves.toEqual({
      title: 'Doğal Nefes Farkındalığı',
      description: 'Nefesi doğal akışında gözlemle.',
      startsAt: startAt.toISOString(),
      durationMinutes: 15,
      audioUrl: undefined,
      guided: false,
    });
  });

  it('resolves a short code from its HMAC without storing student data in the URL', async () => {
    const { service, code } = fixture();

    await expect(service.practiceAccessCode(code)).resolves.toEqual(
      expect.objectContaining({
        title: 'Doğal Nefes Farkındalığı',
        durationMinutes: 15,
        guided: false,
      }),
    );
    const invalidCode = `${code[0] === 'A' ? 'B' : 'A'}${code.slice(1)}`;
    await expect(service.practiceAccessCode(invalidCode)).rejects.toThrow(
      'Pratik bağlantısı geçersiz',
    );
  });

  it('invalidates the link after rescheduling or cancellation', async () => {
    const rescheduled = fixture({ startAt: new Date('2026-07-29T19:00:00.000Z') });
    await expect(rescheduled.service.practiceAccess(rescheduled.token)).rejects.toThrow(
      'Pratik bağlantısı geçersiz',
    );

    const cancelled = fixture({ status: 'CANCELLED' });
    await expect(cancelled.service.practiceAccess(cancelled.token)).rejects.toThrow(
      'Pratik bağlantısı geçersiz',
    );
  });
});

describe('MeditationService public access', () => {
  it('returns public meditation metadata for the public site', async () => {
    const secret = randomBytes(32);
    const clock = new FakeClock('2026-08-01T10:00:00.000Z');
    const prisma = {
      meditationPublicShare: {
        findUnique: vi.fn(async () => ({
          slug: 'nefese-donus',
          status: 'ACTIVE',
          expiresAt: null,
          allowedDurations: [10, 20],
          defaultDurationMinutes: 10,
          allowDurationSelection: true,
          allowIndexing: true,
          meditationType: {
            title: 'Nefese Dönüş',
            description: 'Nefese nazikçe geri dön.',
            status: 'PUBLISHED',
            guidanceMode: 'GUIDED',
          },
        })),
      },
    };
    const service = new MeditationService(
      prisma as never,
      {
        LOOKUP_HMAC_KEY: secret.toString('base64'),
        PUBLIC_CONTENT_ORIGIN: 'https://sakinzihin.com',
      } as never,
      {} as never,
      clock,
    );

    await expect(service.publicMeditationMeta('nefese-donus')).resolves.toEqual({
      slug: 'nefese-donus',
      title: 'Nefese Dönüş',
      description: 'Nefese nazikçe geri dön.',
      guided: true,
      allowIndexing: true,
      canonicalUrl: 'https://sakinzihin.com/meditasyon/nefese-donus',
      durations: [10, 20],
      defaultDurationMinutes: 10,
      allowDurationSelection: true,
      coverImageUrl: null,
      coverImageAlt: null,
    });
  });

  it('opens a silent meditation without requiring a rendered audio file', async () => {
    const secret = randomBytes(32);
    const clock = new FakeClock('2026-08-01T10:00:00.000Z');
    const prisma = {
      meditationPublicShare: {
        findUnique: vi.fn(async () => ({
          id: '20000000-0000-4000-8000-000000000001',
          slug: 'anapanasati',
          status: 'ACTIVE',
          expiresAt: null,
          allowedDurations: [10, 20],
          defaultDurationMinutes: 10,
          allowDurationSelection: true,
          allowIndexing: false,
          meditationType: {
            id: '30000000-0000-4000-8000-000000000001',
            title: 'Anapanasati',
            description: 'Nefesi olduğu gibi izle.',
            status: 'PUBLISHED',
            guidanceMode: 'SILENT',
            audioRevision: 1,
            renders: [],
          },
        })),
      },
      meditationPublicVisit: {
        upsert: vi.fn(async () => ({ id: '40000000-0000-4000-8000-000000000001' })),
      },
    };
    const service = new MeditationService(
      prisma as never,
      { LOOKUP_HMAC_KEY: secret.toString('base64') } as never,
      { signedUrl: vi.fn(), get: vi.fn() } as never,
      clock,
    );

    await expect(
      service.publicMeditationAccess('anapanasati', {
        visitorId: 'visitor_1234567890',
        durationMinutes: 20,
        source: 'instagram',
        medium: 'story',
        campaign: 'nefese-donus',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        title: 'Anapanasati',
        durationMinutes: 20,
        allowedDurations: [10, 20],
        guided: false,
        audioUrl: undefined,
        visitToken: expect.any(String),
      }),
    );
    expect(prisma.meditationPublicVisit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'instagram',
          medium: 'story',
          campaign: 'nefese-donus',
        }),
      }),
    );
  });

  it('records completion CTA views and WhatsApp clicks against the same public visit', async () => {
    const secret = randomBytes(32);
    const clock = new FakeClock('2026-08-01T10:00:00.000Z');
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      meditationPublicShare: {
        findUnique: vi.fn(async () => ({
          id: '20000000-0000-4000-8000-000000000001',
          status: 'ACTIVE',
          expiresAt: null,
          allowedDurations: [10],
          defaultDurationMinutes: 10,
          allowDurationSelection: false,
          allowIndexing: false,
          meditationType: {
            title: 'Anapanasati',
            description: null,
            status: 'PUBLISHED',
            guidanceMode: 'SILENT',
            audioRevision: 1,
            renders: [],
          },
        })),
      },
      meditationPublicVisit: {
        upsert: vi.fn(async () => ({ id: '40000000-0000-4000-8000-000000000001' })),
        updateMany,
      },
    };
    const service = new MeditationService(
      prisma as never,
      { LOOKUP_HMAC_KEY: secret.toString('base64') } as never,
      { signedUrl: vi.fn(), get: vi.fn() } as never,
      clock,
    );

    const access = await service.publicMeditationAccess('anapanasati', {
      visitorId: 'visitor_1234567890',
    });
    await service.recordPublicMeditationEvent(access.visitToken, 'CTA_VIEW');
    await service.recordPublicMeditationEvent(access.visitToken, 'CTA_CLICK');

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          ctaViewCount: { increment: 1 },
          lastCtaViewedAt: clock.now(),
        }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          ctaClickCount: { increment: 1 },
          lastCtaClickedAt: clock.now(),
        }),
      }),
    );
  });

  it('reports CTA and source metrics in public share details', async () => {
    const secret = randomBytes(32);
    const clock = new FakeClock('2026-08-01T10:00:00.000Z');
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          source: 'instagram',
          medium: 'story',
          campaign: 'nefese-donus',
          unique_visitors: 2n,
          total_views: 9n,
        },
        {
          source: 'direct',
          medium: null,
          campaign: null,
          unique_visitors: 1n,
          total_views: 3n,
        },
      ]),
      meditationPublicShare: {
        findUnique: vi.fn(async () => ({
          id: '20000000-0000-4000-8000-000000000001',
          slug: 'anapanasati',
          status: 'ACTIVE',
          expiresAt: null,
          allowedDurations: [10],
          defaultDurationMinutes: 10,
          allowDurationSelection: false,
          allowIndexing: false,
          version: 1,
          meditationType: { title: 'Anapanasati', status: 'PUBLISHED' },
        })),
      },
      meditationPublicVisit: {
        aggregate: vi.fn(async () => ({
          _sum: {
            viewCount: 12,
            startCount: 8,
            completionCount: 5,
            ctaViewCount: 5,
            ctaClickCount: 2,
          },
        })),
        findMany: vi.fn(async () => [{ visitorHmac: 'one' }, { visitorHmac: 'two' }]),
        groupBy: vi.fn(async () => [
          {
            durationMinutes: 10,
            _sum: { viewCount: 12, startCount: 8, completionCount: 5 },
            _count: { _all: 2 },
          },
        ]),
      },
    };
    const service = new MeditationService(
      prisma as never,
      {
        LOOKUP_HMAC_KEY: secret.toString('base64'),
        ADMIN_ORIGIN: 'https://portal.example.com',
      } as never,
      {} as never,
      clock,
    );

    await expect(
      service.publicShareDetail('30000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          ctaViews: 5,
          ctaClicks: 2,
          ctaClickRate: 40,
          sources: [
            {
              source: 'instagram',
              medium: 'story',
              campaign: 'nefese-donus',
              uniqueVisitors: 2,
              totalViews: 9,
            },
            {
              source: 'direct',
              medium: null,
              campaign: null,
              uniqueVisitors: 1,
              totalViews: 3,
            },
          ],
        }),
      }),
    );
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const withoutSources = await service.publicShareDetail('30000000-0000-4000-8000-000000000001');
    expect(withoutSources.metrics.sources).toEqual([]);
  });
});
