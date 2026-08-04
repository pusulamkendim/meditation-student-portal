import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AuditActorType,
  MeditationAudioKind,
  MeditationGuidanceMode,
  MeditationLevel,
  MeditationPublicShareStatus,
  MeditationRenderStatus,
  MeditationTypeStatus,
  Prisma,
} from '@meditation/database';
import {
  CLOCK_TOKEN,
  createPracticeAudioToken,
  LookupHmac,
  verifyPracticeAudioToken,
  verifyPracticePlayerToken,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { type ObjectStorage, R2ObjectStorage } from '../knowledge/storage.js';

export const MEDITATION_STORAGE = Symbol('MEDITATION_STORAGE');
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']);
type Transaction = Prisma.TransactionClient;
type PlayerSession = Prisma.PracticeSessionGetPayload<{
  include: { meditationType: true; meditationRender: true };
}>;
type PublicMeditationClaims = {
  visitId: string;
  shareId: string;
  renderId?: string;
  expiresAtEpochMs: number;
};

export type MeditationUpload = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

export function createMeditationStorage(config: ApplicationConfig): ObjectStorage {
  return new R2ObjectStorage(config);
}

function audioExtension(filename: string): 'mp3' | 'm4a' | undefined {
  const extension = filename.toLocaleLowerCase('en-US').split('.').pop();
  return extension === 'mp3' || extension === 'm4a' ? extension : undefined;
}

export function validateMeditationAudio(input: MeditationUpload): 'mp3' | 'm4a' {
  if (!input.buffer.byteLength) throw new BadRequestException('Ses dosyası boş olamaz.');
  if (input.buffer.byteLength > MAX_AUDIO_BYTES)
    throw new BadRequestException('Ses dosyası 25 MiB sınırını aşıyor.');
  const extension = audioExtension(input.filename);
  if (!extension || !AUDIO_TYPES.has(input.mimetype))
    throw new BadRequestException('Yalnızca MP3 veya M4A ses dosyası yükleyin.');
  const isMp3 =
    input.buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
    (input.buffer[0] === 0xff && (input.buffer[1] & 0xe0) === 0xe0);
  const isM4a =
    input.buffer.byteLength >= 12 && input.buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  if ((extension === 'mp3' && !isMp3) || (extension === 'm4a' && !isM4a))
    throw new BadRequestException('Ses dosyasının içeriği uzantısıyla uyuşmuyor.');
  return extension;
}

function normalizeDurations(values: number[]): number[] {
  const unique = [...new Set(values)].sort((left, right) => left - right);
  if (
    !unique.length ||
    unique.some((value) => !Number.isInteger(value) || value < 1 || value > 180)
  )
    throw new BadRequestException('Süreler 1 ile 180 dakika arasında olmalıdır.');
  return unique;
}

export function reconcilePublicShareDurations(
  targetDurations: number[],
  allowedDurations: number[],
  defaultDurationMinutes: number,
) {
  const availableDurations = normalizeDurations(targetDurations);
  const availableSet = new Set(availableDurations);
  const retainedDurations = [...new Set(allowedDurations)]
    .filter((duration) => availableSet.has(duration))
    .sort((left, right) => left - right);
  const nextAllowedDurations = retainedDurations.length
    ? retainedDurations
    : [availableDurations[0]!];
  return {
    allowedDurations: nextAllowedDurations,
    defaultDurationMinutes: nextAllowedDurations.includes(defaultDurationMinutes)
      ? defaultDurationMinutes
      : nextAllowedDurations[0]!,
  };
}

@Injectable()
export class MeditationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(MEDITATION_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  list() {
    return this.prisma.meditationType.findMany({
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        openingAudio: true,
        closingAudio: true,
        renders: {
          where: { status: { not: MeditationRenderStatus.FAILED } },
          orderBy: [{ sourceVersion: 'desc' }, { durationMinutes: 'asc' }],
        },
        publicShare: true,
      },
    });
  }

  async detail(id: string) {
    const item = await this.prisma.meditationType.findUnique({
      where: { id },
      include: {
        openingAudio: true,
        closingAudio: true,
        audioAssets: { orderBy: [{ kind: 'asc' }, { version: 'desc' }] },
        renders: { orderBy: [{ sourceVersion: 'desc' }, { durationMinutes: 'asc' }] },
        publicShare: true,
      },
    });
    if (!item) throw new NotFoundException('Meditasyon türü bulunamadı.');
    return item;
  }

  async create(
    input: {
      title: string;
      description?: string;
      level: MeditationLevel;
      guidanceMode?: MeditationGuidanceMode;
      targetDurations: number[];
    },
    adminId: string,
  ) {
    const targetDurations = normalizeDurations(input.targetDurations);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.meditationType.create({
        data: {
          title: input.title.trim(),
          description: input.description?.trim() || null,
          level: input.level,
          guidanceMode: input.guidanceMode ?? MeditationGuidanceMode.SILENT,
          targetDurations,
          createdByAdminId: adminId,
          updatedByAdminId: adminId,
        },
      });
      await this.audit(tx, adminId, 'MEDITATION_TYPE_CREATED', item.id, {
        title: item.title,
        level: item.level,
        targetDurations,
        guidanceMode: input.guidanceMode ?? MeditationGuidanceMode.SILENT,
      });
      return item;
    });
  }

  async update(
    id: string,
    input: {
      expectedVersion: number;
      title?: string;
      description?: string | null;
      level?: MeditationLevel;
      guidanceMode?: MeditationGuidanceMode;
      targetDurations?: number[];
      status?: MeditationTypeStatus;
    },
    adminId: string,
  ) {
    const current = await this.prisma.meditationType.findUnique({
      where: { id },
      include: { openingAudio: true, closingAudio: true, publicShare: true },
    });
    if (!current) throw new NotFoundException('Meditasyon türü bulunamadı.');
    if (current.version !== input.expectedVersion)
      throw new ConflictException('Meditasyon başka bir oturumda güncellendi.');
    const targetDurations = input.targetDurations
      ? normalizeDurations(input.targetDurations)
      : current.targetDurations;
    const guidanceMode = input.guidanceMode ?? current.guidanceMode;
    if (
      input.status === MeditationTypeStatus.PUBLISHED &&
      guidanceMode === MeditationGuidanceMode.GUIDED
    ) {
      if (!current.openingAudio)
        throw new BadRequestException('Yayınlamak için başlangıç yönlendirmesi yükleyin.');
      const ready = await this.prisma.meditationAudioRender.findMany({
        where: {
          meditationTypeId: id,
          sourceVersion: current.audioRevision,
          durationMinutes: { in: targetDurations },
          status: MeditationRenderStatus.READY,
        },
        select: { durationMinutes: true },
      });
      const readyDurations = new Set(ready.map((item) => item.durationMinutes));
      const missing = targetDurations.filter((duration) => !readyDurations.has(duration));
      if (missing.length)
        throw new BadRequestException(
          `Önce şu sürelerin seslerini hazırlayın: ${missing.join(', ')} dk.`,
        );
    }
    const durationsChanged =
      targetDurations.join(',') !== [...current.targetDurations].sort((a, b) => a - b).join(',');
    if (durationsChanged && input.status === MeditationTypeStatus.PUBLISHED)
      throw new BadRequestException(
        'Süreleri önce kaydedin; sesler hazırlandıktan sonra meditasyonu yayınlayın.',
      );
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.meditationType.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.guidanceMode !== undefined ? { guidanceMode: input.guidanceMode } : {}),
          ...(input.targetDurations !== undefined ? { targetDurations } : {}),
          ...(input.status !== undefined
            ? { status: input.status }
            : durationsChanged
              ? { status: MeditationTypeStatus.DRAFT }
              : {}),
          ...(durationsChanged ? { audioRevision: { increment: 1 } } : {}),
          updatedByAdminId: adminId,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Meditasyon başka bir oturumda güncellendi.');
      const next = await tx.meditationType.findUniqueOrThrow({ where: { id } });
      if (durationsChanged && current.openingAudio)
        await this.createRenderJobs(tx, next, current.openingAudio.id, current.closingAudio?.id);
      if (durationsChanged && current.publicShare) {
        const reconciledShare = reconcilePublicShareDurations(
          targetDurations,
          current.publicShare.allowedDurations,
          current.publicShare.defaultDurationMinutes,
        );
        const changedShare = await tx.meditationPublicShare.updateMany({
          where: { id: current.publicShare.id, version: current.publicShare.version },
          data: {
            allowedDurations: reconciledShare.allowedDurations,
            defaultDurationMinutes: reconciledShare.defaultDurationMinutes,
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (changedShare.count !== 1)
          throw new ConflictException('Paylaşım başka bir oturumda güncellendi.');
      }
      await this.audit(tx, adminId, 'MEDITATION_TYPE_UPDATED', id, {
        title: input.title,
        level: input.level,
        targetDurations: input.targetDurations,
        status: input.status,
        guidanceMode: input.guidanceMode,
      });
      if (input.status === MeditationTypeStatus.ARCHIVED)
        await tx.meditationPublicShare.updateMany({
          where: { meditationTypeId: id },
          data: { status: MeditationPublicShareStatus.PAUSED, version: { increment: 1 } },
        });
      return next;
    });
  }

  async remove(id: string, expectedVersion: number, adminId: string) {
    const current = await this.prisma.meditationType.findUnique({
      where: { id },
      include: {
        audioAssets: { select: { storageKey: true } },
        renders: { where: { storageKey: { not: null } }, select: { storageKey: true } },
        _count: { select: { practiceSlots: true, practiceSessions: true } },
      },
    });
    if (!current) throw new NotFoundException('Meditasyon türü bulunamadı.');
    if (current.version !== expectedVersion)
      throw new ConflictException('Meditasyon başka bir oturumda güncellendi.');

    const used = current._count.practiceSlots > 0 || current._count.practiceSessions > 0;
    if (used) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.meditationType.updateMany({
          where: { id, version: expectedVersion },
          data: {
            status: MeditationTypeStatus.ARCHIVED,
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Meditasyon başka bir oturumda güncellendi.');
        await tx.meditationPublicShare.updateMany({
          where: { meditationTypeId: id },
          data: { status: MeditationPublicShareStatus.PAUSED, version: { increment: 1 } },
        });
        await this.audit(tx, adminId, 'MEDITATION_TYPE_ARCHIVED_ON_DELETE', id, {
          practiceSlots: current._count.practiceSlots,
          practiceSessions: current._count.practiceSessions,
        });
      });
      return {
        mode: 'ARCHIVED' as const,
        message: 'Geçmiş pratiklerde kullanıldığı için meditasyon silinmek yerine arşivlendi.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.meditationAudioRender.deleteMany({ where: { meditationTypeId: id } });
      await tx.meditationAudioAsset.deleteMany({ where: { meditationTypeId: id } });
      const deleted = await tx.meditationType.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (deleted.count !== 1)
        throw new ConflictException('Meditasyon başka bir oturumda güncellendi.');
      await this.audit(tx, adminId, 'MEDITATION_TYPE_DELETED', id, { title: current.title });
    });
    const storageKeys = [
      ...current.audioAssets.map((asset) => asset.storageKey),
      ...current.renders.flatMap((render) => (render.storageKey ? [render.storageKey] : [])),
    ];
    await Promise.allSettled(
      [...new Set(storageKeys)].map((key) =>
        this.storage.remove(this.config.R2_PRIVATE_BUCKET, key),
      ),
    );
    return { mode: 'DELETED' as const, message: 'Meditasyon kalıcı olarak silindi.' };
  }

  async createPublicShare(
    meditationTypeId: string,
    input: {
      slug: string;
      allowedDurations: number[];
      defaultDurationMinutes: number;
      allowDurationSelection: boolean;
      allowIndexing: boolean;
      expiresAt?: Date | null;
    },
    adminId: string,
  ) {
    const meditation = await this.publicShareMeditation(meditationTypeId);
    const allowedDurations = this.validatePublicDurations(
      meditation,
      input.allowedDurations,
      input.defaultDurationMinutes,
    );
    if (input.expiresAt && input.expiresAt <= this.clock.now())
      throw new BadRequestException('Yayın bitiş tarihi gelecekte olmalıdır.');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.meditationPublicShare.create({
          data: {
            meditationTypeId,
            slug: input.slug,
            allowedDurations,
            defaultDurationMinutes: input.defaultDurationMinutes,
            allowDurationSelection: input.allowDurationSelection,
            allowIndexing: input.allowIndexing,
            expiresAt: input.expiresAt ?? null,
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
          },
        });
        await this.audit(tx, adminId, 'MEDITATION_PUBLIC_SHARE_CREATED', meditationTypeId, {
          slug: input.slug,
          allowedDurations,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Bu bağlantı adı başka bir meditasyonda kullanılıyor.');
      throw error;
    }
    return this.publicShareDetail(meditationTypeId);
  }

  async updatePublicShare(
    meditationTypeId: string,
    input: {
      expectedVersion: number;
      slug?: string;
      status?: MeditationPublicShareStatus;
      allowedDurations?: number[];
      defaultDurationMinutes?: number;
      allowDurationSelection?: boolean;
      allowIndexing?: boolean;
      expiresAt?: Date | null;
    },
    adminId: string,
  ) {
    const current = await this.prisma.meditationPublicShare.findUnique({
      where: { meditationTypeId },
    });
    if (!current) throw new NotFoundException('Herkese açık paylaşım bulunamadı.');
    const meditation = await this.publicShareMeditation(meditationTypeId);
    const currentDurations = reconcilePublicShareDurations(
      meditation.targetDurations,
      current.allowedDurations,
      current.defaultDurationMinutes,
    );
    const requestedDurations = input.allowedDurations ?? currentDurations.allowedDurations;
    const requestedDefaultDuration =
      input.defaultDurationMinutes ??
      (requestedDurations.includes(currentDurations.defaultDurationMinutes)
        ? currentDurations.defaultDurationMinutes
        : requestedDurations[0]!);
    const allowedDurations = this.validatePublicDurations(
      meditation,
      requestedDurations,
      requestedDefaultDuration,
    );
    const durationsRepaired =
      allowedDurations.join(',') !== current.allowedDurations.join(',') ||
      requestedDefaultDuration !== current.defaultDurationMinutes;
    const expiresAt = input.expiresAt === undefined ? current.expiresAt : input.expiresAt;
    if (
      input.status === MeditationPublicShareStatus.ACTIVE &&
      expiresAt &&
      expiresAt <= this.clock.now()
    )
      throw new BadRequestException('Süresi dolmuş paylaşımı açmadan önce tarihi güncelleyin.');
    try {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.meditationPublicShare.updateMany({
          where: { id: current.id, version: input.expectedVersion },
          data: {
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.allowedDurations !== undefined || durationsRepaired
              ? { allowedDurations }
              : {}),
            ...(input.defaultDurationMinutes !== undefined || durationsRepaired
              ? { defaultDurationMinutes: requestedDefaultDuration }
              : {}),
            ...(input.allowDurationSelection !== undefined
              ? { allowDurationSelection: input.allowDurationSelection }
              : {}),
            ...(input.allowIndexing !== undefined ? { allowIndexing: input.allowIndexing } : {}),
            ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Paylaşım başka bir oturumda güncellendi.');
        await this.audit(tx, adminId, 'MEDITATION_PUBLIC_SHARE_UPDATED', meditationTypeId, {
          slug: input.slug,
          status: input.status,
          allowedDurations,
          defaultDurationMinutes: requestedDefaultDuration,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Bu bağlantı adı başka bir meditasyonda kullanılıyor.');
      throw error;
    }
    return this.publicShareDetail(meditationTypeId);
  }

  async publicShareDetail(meditationTypeId: string) {
    const share = await this.prisma.meditationPublicShare.findUnique({
      where: { meditationTypeId },
      include: { meditationType: { select: { title: true, status: true } } },
    });
    if (!share) throw new NotFoundException('Herkese açık paylaşım bulunamadı.');
    const [aggregate, visitors, durationRows] = await Promise.all([
      this.prisma.meditationPublicVisit.aggregate({
        where: { shareId: share.id },
        _sum: {
          viewCount: true,
          startCount: true,
          completionCount: true,
          ctaViewCount: true,
          ctaClickCount: true,
        },
      }),
      this.prisma.meditationPublicVisit.findMany({
        where: { shareId: share.id },
        distinct: ['visitorHmac'],
        select: { visitorHmac: true },
      }),
      this.prisma.meditationPublicVisit.groupBy({
        by: ['durationMinutes'],
        where: { shareId: share.id },
        _sum: { viewCount: true, startCount: true, completionCount: true },
        _count: { _all: true },
      }),
    ]);
    const starts = aggregate._sum.startCount ?? 0;
    const completions = aggregate._sum.completionCount ?? 0;
    const ctaViews = aggregate._sum.ctaViewCount ?? 0;
    const ctaClicks = aggregate._sum.ctaClickCount ?? 0;
    return {
      id: share.id,
      meditationTypeId,
      slug: share.slug,
      status: share.status,
      effectiveStatus:
        share.status === MeditationPublicShareStatus.PAUSED
          ? 'PAUSED'
          : share.expiresAt && share.expiresAt <= this.clock.now()
            ? 'EXPIRED'
            : share.meditationType.status !== MeditationTypeStatus.PUBLISHED
              ? 'MEDITATION_UNAVAILABLE'
              : 'ACTIVE',
      allowedDurations: share.allowedDurations,
      defaultDurationMinutes: share.defaultDurationMinutes,
      allowDurationSelection: share.allowDurationSelection,
      allowIndexing: share.allowIndexing,
      expiresAt: share.expiresAt,
      version: share.version,
      publicUrl: this.publicMeditationUrl(share.slug),
      metrics: {
        totalViews: aggregate._sum.viewCount ?? 0,
        uniqueVisitors: visitors.length,
        starts,
        completions,
        completionRate: starts ? Math.round((completions / starts) * 100) : 0,
        ctaViews,
        ctaClicks,
        ctaClickRate: ctaViews ? Math.round((ctaClicks / ctaViews) * 100) : 0,
        completedMinutes: durationRows.reduce(
          (total, row) => total + row.durationMinutes * (row._sum.completionCount ?? 0),
          0,
        ),
        durations: durationRows
          .map((row) => ({
            durationMinutes: row.durationMinutes,
            uniqueVisitors: row._count._all,
            views: row._sum.viewCount ?? 0,
            starts: row._sum.startCount ?? 0,
            completions: row._sum.completionCount ?? 0,
          }))
          .sort((left, right) => left.durationMinutes - right.durationMinutes),
      },
    };
  }

  async uploadAudio(
    id: string,
    kind: MeditationAudioKind,
    file: MeditationUpload,
    adminId: string,
  ) {
    const extension = validateMeditationAudio(file);
    const current = await this.prisma.meditationType.findUnique({
      where: { id },
      include: { openingAudio: true, closingAudio: true },
    });
    if (!current) throw new NotFoundException('Meditasyon türü bulunamadı.');
    if (current.status === MeditationTypeStatus.ARCHIVED)
      throw new BadRequestException('Arşivlenmiş meditasyona ses yüklenemez.');
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `meditations/sources/${id}/${kind.toLocaleLowerCase('en-US')}/${randomUUID()}.${extension}`;
    await this.storage.put(this.config.R2_PRIVATE_BUCKET, storageKey, file.buffer, file.mimetype);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`meditation-audio:${id}:${kind}`}))`;
        const locked = await tx.meditationType.findUnique({
          where: { id },
          include: { openingAudio: true, closingAudio: true },
        });
        if (!locked) throw new NotFoundException('Meditasyon türü bulunamadı.');
        if (locked.status === MeditationTypeStatus.ARCHIVED)
          throw new BadRequestException('Arşivlenmiş meditasyona ses yüklenemez.');
        const latest = await tx.meditationAudioAsset.aggregate({
          where: { meditationTypeId: id, kind },
          _max: { version: true },
        });
        const asset = await tx.meditationAudioAsset.create({
          data: {
            meditationTypeId: id,
            kind,
            version: (latest._max.version ?? 0) + 1,
            filename: file.filename,
            contentType: file.mimetype,
            byteSize: file.buffer.byteLength,
            contentHash,
            storageKey,
            createdByAdminId: adminId,
          },
        });
        const next = await tx.meditationType.update({
          where: { id },
          data: {
            ...(kind === MeditationAudioKind.OPENING
              ? { openingAudioAssetId: asset.id }
              : { closingAudioAssetId: asset.id }),
            status: MeditationTypeStatus.DRAFT,
            updatedByAdminId: adminId,
            audioRevision: { increment: 1 },
            version: { increment: 1 },
          },
          include: { openingAudio: true, closingAudio: true },
        });
        if (next.openingAudio)
          await this.createRenderJobs(tx, next, next.openingAudio.id, next.closingAudio?.id);
        await this.audit(tx, adminId, 'MEDITATION_AUDIO_UPLOADED', asset.id, {
          meditationTypeId: id,
          kind,
          filename: file.filename,
          byteSize: file.buffer.byteLength,
          contentHash,
        });
        return asset;
      });
    } catch (error) {
      await this.storage.remove(this.config.R2_PRIVATE_BUCKET, storageKey).catch(() => undefined);
      throw error;
    }
  }

  async retryRender(id: string, renderId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const render = await tx.meditationAudioRender.findFirst({
        where: { id: renderId, meditationTypeId: id },
      });
      if (!render) throw new NotFoundException('Hazırlanmış ses kaydı bulunamadı.');
      if (render.status === MeditationRenderStatus.READY)
        throw new BadRequestException('Bu ses zaten hazır.');
      await tx.meditationAudioRender.update({
        where: { id: render.id },
        data: { status: MeditationRenderStatus.PENDING, errorCode: null },
      });
      await this.enqueueRender(tx, render.id, `retry-${render.attempts + 1}`);
      await this.audit(tx, adminId, 'MEDITATION_RENDER_RETRIED', render.id, {
        meditationTypeId: id,
        durationMinutes: render.durationMinutes,
      });
      return { queued: true };
    });
  }

  async audio(id: string, assetId: string) {
    const asset = await this.prisma.meditationAudioAsset.findFirst({
      where: { id: assetId, meditationTypeId: id },
    });
    if (!asset) throw new NotFoundException('Ses dosyası bulunamadı.');
    return {
      filename: asset.filename,
      contentType: asset.contentType,
      buffer: await this.storage.get(this.config.R2_PRIVATE_BUCKET, asset.storageKey),
    };
  }

  async renderedAudio(id: string, renderId: string) {
    const render = await this.prisma.meditationAudioRender.findFirst({
      where: { id: renderId, meditationTypeId: id, status: MeditationRenderStatus.READY },
    });
    if (!render?.storageKey || !render.contentType)
      throw new NotFoundException('Hazırlanmış ses dosyası bulunamadı.');
    return {
      filename: `${render.durationMinutes}-dakika.m4a`,
      contentType: render.contentType,
      buffer: await this.storage.get(this.config.R2_PRIVATE_BUCKET, render.storageKey),
    };
  }

  async publicMeditationAccess(
    slug: string,
    input: {
      durationMinutes?: number;
      visitorId: string;
      source?: string;
      medium?: string;
      campaign?: string;
    },
  ) {
    const now = this.clock.now();
    const share = await this.prisma.meditationPublicShare.findUnique({
      where: { slug },
      include: {
        meditationType: {
          include: {
            renders: { where: { status: MeditationRenderStatus.READY } },
          },
        },
      },
    });
    if (
      !share ||
      share.status !== MeditationPublicShareStatus.ACTIVE ||
      (share.expiresAt && share.expiresAt <= now) ||
      share.meditationType.status !== MeditationTypeStatus.PUBLISHED
    )
      throw new NotFoundException('Meditasyon bağlantısı kullanılamıyor.');
    const durationMinutes = input.durationMinutes ?? share.defaultDurationMinutes;
    if (!share.allowedDurations.includes(durationMinutes))
      throw new BadRequestException('Bu meditasyon süresi yayında değil.');
    if (!share.allowDurationSelection && durationMinutes !== share.defaultDurationMinutes)
      throw new BadRequestException('Bu bağlantıda meditasyon süresi sabittir.');

    const meditation = share.meditationType;
    const render =
      meditation.guidanceMode === MeditationGuidanceMode.GUIDED
        ? meditation.renders.find(
            (candidate) =>
              candidate.sourceVersion === meditation.audioRevision &&
              candidate.durationMinutes === durationMinutes,
          )
        : undefined;
    if (meditation.guidanceMode === MeditationGuidanceMode.GUIDED && !render?.storageKey)
      throw new NotFoundException('Bu süre için sesli yönlendirme henüz hazır değil.');

    const visitorHmac = new LookupHmac(this.playerSecret()).digest(
      `${share.id}:${input.visitorId}`,
    );
    const visit = await this.prisma.meditationPublicVisit.upsert({
      where: {
        shareId_visitorHmac_durationMinutes: {
          shareId: share.id,
          visitorHmac,
          durationMinutes,
        },
      },
      create: {
        shareId: share.id,
        visitorHmac,
        durationMinutes,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        firstOpenedAt: now,
        lastSeenAt: now,
      },
      update: { viewCount: { increment: 1 }, lastSeenAt: now },
    });
    const expiresAtEpochMs = Math.min(
      share.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
      now.getTime() + Math.max(8 * 60 * 60_000, (durationMinutes + 120) * 60_000),
    );
    const visitToken = this.createPublicMeditationToken({
      visitId: visit.id,
      shareId: share.id,
      renderId: render?.id,
      expiresAtEpochMs,
    });
    let audioUrl: string | undefined;
    if (render?.storageKey) {
      const expiresIn = Math.max(60, Math.ceil((expiresAtEpochMs - now.getTime()) / 1_000));
      const signed = await this.storage.signedUrl(
        this.config.R2_PRIVATE_BUCKET,
        render.storageKey,
        expiresIn,
      );
      audioUrl = signed.startsWith('local://')
        ? `/v1/public/meditations/audio/${visitToken}`
        : signed;
    }
    return {
      title: meditation.title,
      description: meditation.description,
      durationMinutes,
      allowedDurations: share.allowDurationSelection
        ? share.allowedDurations
        : [share.defaultDurationMinutes],
      allowDurationSelection: share.allowDurationSelection,
      allowIndexing: share.allowIndexing,
      audioUrl,
      guided: Boolean(audioUrl),
      visitToken,
    };
  }

  async publicMeditationMeta(slug: string) {
    const share = await this.prisma.meditationPublicShare.findUnique({
      where: { slug },
      include: { meditationType: true },
    });
    if (
      !share ||
      share.status !== MeditationPublicShareStatus.ACTIVE ||
      (share.expiresAt && share.expiresAt <= this.clock.now()) ||
      share.meditationType.status !== MeditationTypeStatus.PUBLISHED
    )
      throw new NotFoundException('Meditasyon bağlantısı kullanılamıyor.');
    return {
      title: share.meditationType.title,
      description: share.meditationType.description,
      allowIndexing: share.allowIndexing,
      canonicalUrl: this.publicMeditationUrl(share.slug),
      durations: share.allowedDurations,
    };
  }

  async recordPublicMeditationEvent(
    token: string,
    event: 'START' | 'COMPLETE' | 'CTA_VIEW' | 'CTA_CLICK',
  ) {
    const claims = this.verifyPublicMeditationToken(token);
    if (!claims) throw new NotFoundException('Meditasyon oturumu geçersiz veya süresi dolmuş.');
    const now = this.clock.now();
    const changed = await this.prisma.meditationPublicVisit.updateMany({
      where: { id: claims.visitId, shareId: claims.shareId },
      data: {
        START: { startCount: { increment: 1 }, lastStartedAt: now, lastSeenAt: now },
        COMPLETE: {
          completionCount: { increment: 1 },
          lastCompletedAt: now,
          lastSeenAt: now,
        },
        CTA_VIEW: { ctaViewCount: { increment: 1 }, lastCtaViewedAt: now, lastSeenAt: now },
        CTA_CLICK: {
          ctaClickCount: { increment: 1 },
          lastCtaClickedAt: now,
          lastSeenAt: now,
        },
      }[event],
    });
    if (changed.count !== 1) throw new NotFoundException('Meditasyon oturumu bulunamadı.');
    return { recorded: true };
  }

  async publicMeditationAudio(token: string) {
    const claims = this.verifyPublicMeditationToken(token);
    if (!claims?.renderId)
      throw new NotFoundException('Meditasyon sesi geçersiz veya süresi dolmuş.');
    const render = await this.prisma.meditationAudioRender.findUnique({
      where: { id: claims.renderId },
      include: { meditationType: { include: { publicShare: true } } },
    });
    const share = render?.meditationType.publicShare;
    if (
      !render ||
      !share ||
      share.id !== claims.shareId ||
      share.status !== MeditationPublicShareStatus.ACTIVE ||
      (share.expiresAt && share.expiresAt <= this.clock.now()) ||
      render.status !== MeditationRenderStatus.READY ||
      !render.storageKey ||
      !render.contentType
    )
      throw new NotFoundException('Meditasyon sesi geçersiz veya süresi dolmuş.');
    return {
      filename: `${render.durationMinutes}-dakika.m4a`,
      contentType: render.contentType,
      buffer: await this.storage.get(this.config.R2_PRIVATE_BUCKET, render.storageKey),
    };
  }

  async practiceAccess(token: string) {
    const now = this.clock.now();
    const claims = verifyPracticePlayerToken(this.playerSecret(), token, now);
    if (!claims) throw new NotFoundException('Pratik bağlantısı geçersiz veya süresi dolmuş.');
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: claims.sessionId },
      include: { meditationType: true, meditationRender: true },
    });
    if (
      !session ||
      session.startAt.getTime() !== claims.startAtEpochMs ||
      ['CANCELLED', 'SUPPRESSED'].includes(session.status)
    )
      throw new NotFoundException('Pratik bağlantısı geçersiz veya süresi dolmuş.');
    return this.practicePayload(session, claims.expiresAtEpochMs, now);
  }

  async practiceAccessCode(code: string) {
    const now = this.clock.now();
    const codeHmac = new LookupHmac(this.playerSecret()).digest(code);
    const link = await this.prisma.practiceAccessLink.findUnique({
      where: { codeHmac },
      include: {
        practiceSession: {
          include: { meditationType: true, meditationRender: true },
        },
      },
    });
    const session = link?.practiceSession;
    if (
      !link ||
      !session ||
      link.invalidatedAt ||
      link.expiresAt.getTime() <= now.getTime() ||
      session.startAt.getTime() !== link.startAt.getTime() ||
      ['CANCELLED', 'SUPPRESSED'].includes(session.status)
    )
      throw new NotFoundException('Pratik bağlantısı geçersiz veya süresi dolmuş.');
    return this.practicePayload(session, link.expiresAt.getTime(), now);
  }

  private async practicePayload(session: PlayerSession, accessExpiresAtEpochMs: number, now: Date) {
    let audioUrl: string | undefined;
    if (
      session.meditationRender?.status === MeditationRenderStatus.READY &&
      session.meditationRender.storageKey
    ) {
      const requestedExpiry = Math.max(
        now.getTime() + 2 * 60 * 60_000,
        session.startAt.getTime() + (session.durationMinutes * 60 + 2 * 60 * 60) * 1_000,
      );
      const expiresAtEpochMs = Math.min(accessExpiresAtEpochMs, requestedExpiry);
      const expiresIn = Math.max(60, Math.ceil((expiresAtEpochMs - now.getTime()) / 1_000));
      const signed = await this.storage.signedUrl(
        this.config.R2_PRIVATE_BUCKET,
        session.meditationRender.storageKey,
        expiresIn,
      );
      if (signed.startsWith('local://')) {
        const audioToken = createPracticeAudioToken(this.playerSecret(), {
          sessionId: session.id,
          startAtEpochMs: session.startAt.getTime(),
          expiresAtEpochMs,
        });
        audioUrl = `/v1/public/practices/audio/${audioToken}`;
      } else {
        audioUrl = signed;
      }
    }
    return {
      title: session.meditationType?.title ?? 'Meditasyon pratiği',
      description: session.meditationType?.description,
      startsAt: session.startAt.toISOString(),
      durationMinutes: session.durationMinutes,
      audioUrl,
      guided: Boolean(audioUrl),
    };
  }

  async practiceAudio(token: string) {
    const claims = verifyPracticeAudioToken(this.playerSecret(), token, this.clock.now());
    if (!claims) throw new NotFoundException('Ses bağlantısı geçersiz veya süresi dolmuş.');
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: claims.sessionId },
      include: { meditationRender: true },
    });
    if (
      !session ||
      session.startAt.getTime() !== claims.startAtEpochMs ||
      ['CANCELLED', 'SUPPRESSED'].includes(session.status) ||
      session.meditationRender?.status !== MeditationRenderStatus.READY ||
      !session.meditationRender.storageKey ||
      !session.meditationRender.contentType
    )
      throw new NotFoundException('Ses bağlantısı geçersiz veya süresi dolmuş.');
    return {
      filename: `${session.durationMinutes}-dakika.m4a`,
      contentType: session.meditationRender.contentType,
      buffer: await this.storage.get(
        this.config.R2_PRIVATE_BUCKET,
        session.meditationRender.storageKey,
      ),
    };
  }

  private async publicShareMeditation(id: string) {
    const meditation = await this.prisma.meditationType.findUnique({
      where: { id },
      include: { renders: { where: { status: MeditationRenderStatus.READY } } },
    });
    if (!meditation) throw new NotFoundException('Meditasyon türü bulunamadı.');
    if (meditation.status !== MeditationTypeStatus.PUBLISHED)
      throw new BadRequestException('Yalnızca yayındaki meditasyon herkese açılabilir.');
    return meditation;
  }

  private validatePublicDurations(
    meditation: Awaited<ReturnType<MeditationService['publicShareMeditation']>>,
    requestedDurations: number[],
    defaultDurationMinutes: number,
  ) {
    const allowedDurations = normalizeDurations(requestedDurations);
    if (allowedDurations.some((duration) => !meditation.targetDurations.includes(duration)))
      throw new BadRequestException(
        'Paylaşım süreleri meditasyon süreleri arasından seçilmelidir.',
      );
    if (!allowedDurations.includes(defaultDurationMinutes))
      throw new BadRequestException('Varsayılan süre paylaşım sürelerinden biri olmalıdır.');
    if (meditation.guidanceMode === MeditationGuidanceMode.GUIDED) {
      const readyDurations = new Set(
        meditation.renders
          .filter((render) => render.sourceVersion === meditation.audioRevision)
          .map((render) => render.durationMinutes),
      );
      const missing = allowedDurations.filter((duration) => !readyDurations.has(duration));
      if (missing.length)
        throw new BadRequestException(
          `Şu sürelerin sesli yönlendirmesi hazır değil: ${missing.join(', ')} dk.`,
        );
    }
    return allowedDurations;
  }

  private publicMeditationUrl(slug: string) {
    const origin = (this.config.ADMIN_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/u, '');
    return `${origin}/meditasyon/${slug}`;
  }

  private createPublicMeditationToken(claims: PublicMeditationClaims) {
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.playerSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyPublicMeditationToken(token: string): PublicMeditationClaims | undefined {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return undefined;
    const expected = createHmac('sha256', this.playerSecret()).update(payload).digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64url');
    } catch {
      return undefined;
    }
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
      return undefined;
    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Partial<PublicMeditationClaims>;
      if (
        typeof claims.visitId !== 'string' ||
        typeof claims.shareId !== 'string' ||
        typeof claims.expiresAtEpochMs !== 'number' ||
        claims.expiresAtEpochMs <= this.clock.now().getTime() ||
        (claims.renderId !== undefined && typeof claims.renderId !== 'string')
      )
        return undefined;
      return claims as PublicMeditationClaims;
    } catch {
      return undefined;
    }
  }

  private playerSecret() {
    if (!this.config.LOOKUP_HMAC_KEY) throw new Error('LOOKUP_HMAC_KEY is required.');
    return Buffer.from(this.config.LOOKUP_HMAC_KEY, 'base64');
  }

  private async createRenderJobs(
    tx: Transaction,
    type: { id: string; audioRevision: number; targetDurations: number[] },
    openingAudioAssetId: string,
    closingAudioAssetId?: string,
  ) {
    for (const durationMinutes of type.targetDurations) {
      const render = await tx.meditationAudioRender.create({
        data: {
          meditationTypeId: type.id,
          sourceVersion: type.audioRevision,
          durationMinutes,
          openingAudioAssetId,
          closingAudioAssetId,
        },
      });
      await this.enqueueRender(tx, render.id);
    }
  }

  private enqueueRender(tx: Transaction, renderId: string, suffix = 'initial') {
    return tx.outboxEvent.create({
      data: {
        topic: 'meditation.audio-render',
        aggregateType: 'MeditationAudioRender',
        aggregateId: renderId,
        eventType: `MEDITATION_AUDIO_RENDER_REQUESTED_${suffix}`,
        payload: { renderId },
      },
    });
  }

  private audit(
    tx: Transaction,
    adminId: string,
    action: string,
    entityId: string,
    safeDiff: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        action,
        entityType: 'MeditationType',
        entityId,
        safeDiff,
        requestId: `meditation-${randomUUID()}`,
        correlationId: `meditation-${entityId}`,
      },
    });
  }
}
