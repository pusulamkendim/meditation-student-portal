import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { contentHash, type ApplicationConfig } from '@meditation/core';
import { Prisma, type Drawing } from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { R2ObjectStorage, type ObjectStorage } from '../knowledge/storage.js';

const MAX_DRAWING_BYTES = 25 * 1024 * 1024;
const MAX_ELEMENTS = 20_000;

const excalidrawSceneSchema = z
  .object({
    type: z.literal('excalidraw'),
    version: z.number().int().positive(),
    source: z.string().max(2_000).optional(),
    elements: z.array(z.record(z.unknown())).max(MAX_ELEMENTS),
    appState: z.record(z.unknown()).optional().default({}),
    files: z.record(z.unknown()).optional().default({}),
  })
  .passthrough();

export type ExcalidrawScene = z.infer<typeof excalidrawSceneSchema>;

export const DRAWING_STORAGE = Symbol('DRAWING_STORAGE');

export function createDrawingStorage(config: ApplicationConfig): ObjectStorage {
  return new R2ObjectStorage(config);
}

export function parseExcalidrawScene(value: unknown): ExcalidrawScene {
  const parsed = excalidrawSceneSchema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      'Geçerli bir Excalidraw çizimi bekleniyor. Dosyayı Excalidraw üzerinden .excalidraw biçiminde dışa aktarın.',
    );
  return parsed.data;
}

export function parseExcalidrawBuffer(buffer: Buffer): ExcalidrawScene {
  if (!buffer.byteLength) throw new BadRequestException('Çizim dosyası boş olamaz.');
  if (buffer.byteLength > MAX_DRAWING_BYTES)
    throw new BadRequestException('Çizim dosyası 25 MiB sınırını aşıyor.');
  try {
    return parseExcalidrawScene(JSON.parse(buffer.toString('utf8')));
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Çizim dosyası geçerli JSON içermiyor.');
  }
}

export function drawingTitleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.excalidraw$/iu, '').trim();
  return (withoutExtension || 'Adsız çizim').slice(0, 160);
}

@Injectable()
export class DrawingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(DRAWING_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  list() {
    return this.prisma.drawing.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        byteSize: true,
        elementCount: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        createdByAdmin: { select: { email: true } },
        updatedByAdmin: { select: { email: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      take: 500,
    });
  }

  createBlank(input: { title: string; description?: string }, adminId: string) {
    const scene: ExcalidrawScene = {
      type: 'excalidraw',
      version: 2,
      source: 'meditation-student-portal',
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };
    return this.create(
      {
        title: input.title,
        description: input.description,
        scene,
      },
      adminId,
    );
  }

  upload(
    input: { filename: string; mimetype: string; buffer: Buffer; title?: string },
    adminId: string,
  ) {
    if (!input.filename.toLocaleLowerCase('tr-TR').endsWith('.excalidraw'))
      throw new BadRequestException('Yalnızca .excalidraw dosyaları yüklenebilir.');
    const allowedTypes = new Set([
      'application/json',
      'application/octet-stream',
      'text/plain',
      '',
    ]);
    if (!allowedTypes.has(input.mimetype))
      throw new BadRequestException('Çizim dosyasının içerik türü desteklenmiyor.');
    return this.create(
      {
        title: input.title?.trim() || drawingTitleFromFilename(input.filename),
        scene: parseExcalidrawBuffer(input.buffer),
      },
      adminId,
    );
  }

  async get(id: string) {
    const drawing = await this.prisma.drawing.findUnique({
      where: { id },
      include: {
        createdByAdmin: { select: { email: true } },
        updatedByAdmin: { select: { email: true } },
      },
    });
    if (!drawing) throw new NotFoundException('Çizim bulunamadı.');
    return { ...drawing, scene: await this.readScene(drawing) };
  }

  async update(
    id: string,
    input: {
      expectedVersion: number;
      title?: string;
      description?: string | null;
      scene?: unknown;
    },
    adminId: string,
  ) {
    const current = await this.prisma.drawing.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Çizim bulunamadı.');
    if (input.title === undefined && input.description === undefined && input.scene === undefined)
      throw new BadRequestException('Kaydedilecek bir değişiklik bulunamadı.');

    const scene = input.scene === undefined ? undefined : parseExcalidrawScene(input.scene);
    const serialized = scene ? this.serializeScene(scene) : undefined;
    const nextVersion = input.expectedVersion + 1;
    const nextStorageKey = serialized
      ? `drawings/${id}/v${nextVersion}-${randomUUID()}.excalidraw`
      : current.storageKey;

    if (serialized)
      await this.storage.put(
        this.config.R2_PRIVATE_BUCKET,
        nextStorageKey,
        serialized,
        'application/json',
      );

    try {
      const changed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.drawing.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            ...(input.title !== undefined ? { title: this.normalizeTitle(input.title) } : {}),
            ...(input.description !== undefined
              ? { description: input.description?.trim() || null }
              : {}),
            ...(serialized && scene
              ? {
                  storageKey: nextStorageKey,
                  contentHash: contentHash(serialized),
                  byteSize: serialized.byteLength,
                  elementCount: scene.elements.length,
                }
              : {}),
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new ConflictException(
            'Çizim başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
          );
        await this.audit(tx, adminId, 'DRAWING_UPDATED', id, {
          version: nextVersion,
          contentUpdated: Boolean(serialized),
        });
        return tx.drawing.findUniqueOrThrow({ where: { id } });
      });
      if (serialized && current.storageKey !== nextStorageKey)
        await this.storage
          .remove(this.config.R2_PRIVATE_BUCKET, current.storageKey)
          .catch(() => undefined);
      return changed;
    } catch (error) {
      if (serialized)
        await this.storage
          .remove(this.config.R2_PRIVATE_BUCKET, nextStorageKey)
          .catch(() => undefined);
      throw error;
    }
  }

  async remove(id: string, adminId: string) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } });
    if (!drawing) throw new NotFoundException('Çizim bulunamadı.');
    await this.prisma.$transaction(async (tx) => {
      await this.audit(tx, adminId, 'DRAWING_DELETED', id, {
        title: drawing.title,
        version: drawing.version,
      });
      await tx.drawing.delete({ where: { id } });
    });
    await this.storage
      .remove(this.config.R2_PRIVATE_BUCKET, drawing.storageKey)
      .catch(() => undefined);
    return { id, deleted: true };
  }

  private async create(
    input: { title: string; description?: string; scene: ExcalidrawScene },
    adminId: string,
  ) {
    const id = randomUUID();
    const serialized = this.serializeScene(input.scene);
    const storageKey = `drawings/${id}/v1-${randomUUID()}.excalidraw`;
    await this.storage.put(
      this.config.R2_PRIVATE_BUCKET,
      storageKey,
      serialized,
      'application/json',
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const drawing = await tx.drawing.create({
          data: {
            id,
            title: this.normalizeTitle(input.title),
            description: input.description?.trim() || null,
            storageKey,
            contentHash: contentHash(serialized),
            byteSize: serialized.byteLength,
            elementCount: input.scene.elements.length,
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
          },
        });
        await this.audit(tx, adminId, 'DRAWING_CREATED', drawing.id, {
          title: drawing.title,
          elementCount: drawing.elementCount,
        });
        return drawing;
      });
    } catch (error) {
      await this.storage.remove(this.config.R2_PRIVATE_BUCKET, storageKey).catch(() => undefined);
      throw error;
    }
  }

  private async readScene(drawing: Drawing): Promise<ExcalidrawScene> {
    const buffer = await this.storage.get(this.config.R2_PRIVATE_BUCKET, drawing.storageKey);
    if (contentHash(buffer) !== drawing.contentHash)
      throw new ConflictException('Çizim dosyasının bütünlük kontrolü başarısız oldu.');
    return parseExcalidrawBuffer(buffer);
  }

  private serializeScene(scene: ExcalidrawScene): Buffer {
    const buffer = Buffer.from(JSON.stringify(scene), 'utf8');
    if (buffer.byteLength > MAX_DRAWING_BYTES)
      throw new BadRequestException('Çizim dosyası 25 MiB sınırını aşıyor.');
    return buffer;
  }

  private normalizeTitle(title: string): string {
    const normalized = title.trim();
    if (!normalized) throw new BadRequestException('Çizim adı gereklidir.');
    if (normalized.length > 160) throw new BadRequestException('Çizim adı 160 karakteri aşamaz.');
    return normalized;
  }

  private audit(
    tx: Prisma.TransactionClient,
    adminId: string,
    action: string,
    drawingId: string,
    safeDiff: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        action,
        entityType: 'Drawing',
        entityId: drawingId,
        safeDiff: safeDiff as Prisma.InputJsonValue,
        reason: 'Admin drawing library action',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }
}
