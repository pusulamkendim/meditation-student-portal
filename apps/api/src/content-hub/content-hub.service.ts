import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_TOKEN, type Clock } from '@meditation/core';
import {
  MeditationGuidanceMode,
  MeditationPublicShareStatus,
  MeditationTypeStatus,
  ReadingPublicShareStatus,
  ReadingStatus,
} from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';

function publicImagePath(path: string, hash?: string | null) {
  return hash ? `${path}?v=${encodeURIComponent(hash.slice(0, 16))}` : path;
}

@Injectable()
export class ContentHubService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async catalog() {
    const now = this.clock.now();
    const [readingShares, meditationShares] = await Promise.all([
      this.prisma.readingPublicShare.findMany({
        where: {
          status: ReadingPublicShareStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          reading: { status: ReadingStatus.PUBLISHED },
        },
        include: {
          reading: {
            include: { _count: { select: { sections: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this.prisma.meditationPublicShare.findMany({
        where: {
          status: MeditationPublicShareStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          meditationType: { status: MeditationTypeStatus.PUBLISHED },
        },
        include: { meditationType: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
    ]);

    return {
      readings: readingShares.map((share) => ({
        slug: share.slug,
        title: share.reading.title,
        description: share.reading.description,
        author: share.reading.author,
        estimatedMinutes: share.reading.estimatedMinutes,
        sectionCount: share.reading._count.sections,
        hasPdf: share.allowPdf && Boolean(share.reading.pdfStorageKey),
        allowIndexing: share.allowIndexing,
        coverImageUrl: share.reading.coverImageStorageKey
          ? publicImagePath(
              `/v1/readings/public/${encodeURIComponent(share.slug)}/image`,
              share.reading.coverImageHash,
            )
          : null,
        coverImageAlt: share.reading.coverImageAlt ?? null,
        updatedAt: share.updatedAt.toISOString(),
      })),
      meditations: meditationShares.map((share) => ({
        slug: share.slug,
        title: share.meditationType.title,
        description: share.meditationType.description,
        level: share.meditationType.level,
        guided: share.meditationType.guidanceMode === MeditationGuidanceMode.GUIDED,
        durations: share.allowedDurations,
        defaultDurationMinutes: share.defaultDurationMinutes,
        allowDurationSelection: share.allowDurationSelection,
        allowIndexing: share.allowIndexing,
        coverImageUrl: share.meditationType.coverImageStorageKey
          ? publicImagePath(
              `/v1/public/meditations/${encodeURIComponent(share.slug)}/image`,
              share.meditationType.coverImageHash,
            )
          : null,
        coverImageAlt: share.meditationType.coverImageAlt ?? null,
        updatedAt: share.updatedAt.toISOString(),
      })),
      generatedAt: now.toISOString(),
    };
  }
}
