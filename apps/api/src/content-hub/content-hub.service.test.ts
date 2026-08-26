import { FakeClock } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import { ContentHubService } from './content-hub.service.js';

describe('ContentHubService', () => {
  it('returns only the public catalog fields needed by the marketing hub', async () => {
    const clock = new FakeClock('2026-08-05T09:00:00.000Z');
    const prisma = {
      readingPublicShare: {
        findMany: vi.fn(async () => [
          {
            slug: 'gecenin-icinden-dogan-sabah',
            allowPdf: true,
            allowIndexing: true,
            updatedAt: new Date('2026-08-04T12:00:00.000Z'),
            reading: {
              title: 'Gecenin İçinden Doğan Sabah',
              description: 'Aydınlanma gecesi üzerine bir okuma.',
              author: 'Necip Sülbü',
              estimatedMinutes: 28,
              pdfStorageKey: 'readings/book.pdf',
              _count: { sections: 5 },
            },
          },
        ]),
      },
      meditationPublicShare: {
        findMany: vi.fn(async () => [
          {
            slug: 'beden-taramasi',
            allowedDurations: [10, 15],
            defaultDurationMinutes: 10,
            allowDurationSelection: true,
            allowIndexing: false,
            updatedAt: new Date('2026-08-04T13:00:00.000Z'),
            meditationType: {
              title: 'Beden Taraması',
              description: 'Bedendeki duyumları fark et.',
              level: 'INTRODUCTION',
              guidanceMode: 'GUIDED',
            },
          },
        ]),
      },
    };

    const service = new ContentHubService(prisma as never, clock);

    await expect(service.catalog()).resolves.toEqual({
      readings: [
        {
          slug: 'gecenin-icinden-dogan-sabah',
          title: 'Gecenin İçinden Doğan Sabah',
          description: 'Aydınlanma gecesi üzerine bir okuma.',
          author: 'Necip Sülbü',
          estimatedMinutes: 28,
          sectionCount: 5,
          hasPdf: true,
          allowIndexing: true,
          updatedAt: '2026-08-04T12:00:00.000Z',
        },
      ],
      meditations: [
        {
          slug: 'beden-taramasi',
          title: 'Beden Taraması',
          description: 'Bedendeki duyumları fark et.',
          level: 'INTRODUCTION',
          guided: true,
          durations: [10, 15],
          defaultDurationMinutes: 10,
          allowDurationSelection: true,
          allowIndexing: false,
          updatedAt: '2026-08-04T13:00:00.000Z',
        },
      ],
      generatedAt: '2026-08-05T09:00:00.000Z',
    });

    expect(prisma.readingPublicShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', reading: { status: 'PUBLISHED' } }),
        take: 25,
      }),
    );
    expect(prisma.meditationPublicShare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          meditationType: { status: 'PUBLISHED' },
        }),
        take: 25,
      }),
    );
  });
});
