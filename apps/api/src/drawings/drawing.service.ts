import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { contentHash, FieldEncryption, LookupHmac, type ApplicationConfig } from '@meditation/core';
import { DrawingAssignmentStatus, DrawingStatus, Prisma, type Drawing } from '@meditation/database';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { R2ObjectStorage, type ObjectStorage } from '../knowledge/storage.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

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
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(DRAWING_STORAGE) private readonly storage: ObjectStorage,
    @Inject(SystemMessageOrchestrator) private readonly messages: SystemMessageOrchestrator,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Drawing encryption and lookup keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  list() {
    return this.prisma.drawing.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        byteSize: true,
        elementCount: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        createdByAdmin: { select: { email: true } },
        updatedByAdmin: { select: { email: true } },
        _count: { select: { assignments: true } },
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
        _count: { select: { assignments: true } },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            student: {
              select: { id: true, fullNameEncrypted: true, fullNameKeyId: true, status: true },
            },
            messageIntent: { select: { status: true, suppressionReason: true } },
          },
        },
      },
    });
    if (!drawing) throw new NotFoundException('Çizim bulunamadı.');
    return {
      ...drawing,
      scene: await this.readScene(drawing),
      assignments: drawing.assignments.map(({ student, ...assignment }) => ({
        ...assignment,
        student: {
          id: student.id,
          status: student.status,
          fullName: this.decryptStudentName(
            student.id,
            student.fullNameEncrypted,
            student.fullNameKeyId,
          ),
        },
      })),
    };
  }

  async update(
    id: string,
    input: {
      expectedVersion: number;
      title?: string;
      description?: string | null;
      scene?: unknown;
      status?: DrawingStatus;
    },
    adminId: string,
  ) {
    const current = await this.prisma.drawing.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Çizim bulunamadı.');
    if (
      input.title === undefined &&
      input.description === undefined &&
      input.scene === undefined &&
      input.status === undefined
    )
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
            ...(input.status !== undefined ? { status: input.status } : {}),
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
          status: input.status,
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
    const drawing = await this.prisma.drawing.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    });
    if (!drawing) throw new NotFoundException('Çizim bulunamadı.');
    if (drawing._count.assignments > 0)
      throw new ConflictException(
        'Öğrenciyle paylaşılmış bir çizim kalıcı olarak silinemez. Çizimi arşivleyebilirsiniz.',
      );
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.drawing.deleteMany({
        where: { id, assignments: { none: {} } },
      });
      if (deleted.count !== 1)
        throw new ConflictException(
          'Çizim bu sırada bir öğrenciyle paylaşıldı ve silinemedi. Sayfayı yenileyin.',
        );
      await this.audit(tx, adminId, 'DRAWING_DELETED', id, {
        title: drawing.title,
        version: drawing.version,
      });
    });
    await this.storage
      .remove(this.config.R2_PRIVATE_BUCKET, drawing.storageKey)
      .catch(() => undefined);
    return { id, deleted: true };
  }

  async assign(drawingId: string, studentIds: string[], adminId: string) {
    let drawing = await this.prisma.drawing.findUnique({ where: { id: drawingId } });
    if (!drawing) throw new NotFoundException('Çizim bulunamadı.');
    if (drawing.status === DrawingStatus.ARCHIVED)
      throw new BadRequestException('Arşivlenmiş bir çizim öğrenciyle paylaşılamaz.');
    if (drawing.status === DrawingStatus.DRAFT)
      drawing = await this.prisma.drawing.update({
        where: { id: drawing.id },
        data: {
          status: DrawingStatus.PUBLISHED,
          updatedByAdminId: adminId,
          version: { increment: 1 },
        },
      });

    const uniqueStudentIds = [...new Set(studentIds)];
    const students = await this.prisma.student.findMany({
      where: { id: { in: uniqueStudentIds } },
      include: { defaultChannelIdentity: true },
    });
    if (students.length !== uniqueStudentIds.length)
      throw new BadRequestException('Öğrenci seçimlerinden biri bulunamadı.');

    const results = [];
    for (const student of students) {
      if (!student.defaultChannelIdentity) {
        results.push({
          studentId: student.id,
          sent: false,
          error: 'Öğrencinin varsayılan mesaj kanalı bulunmuyor.',
        });
        continue;
      }
      const existing = await this.prisma.drawingAssignment.findUnique({
        where: { drawingId_studentId: { drawingId, studentId: student.id } },
      });
      const token = randomBytes(32).toString('base64url');
      const assignment = existing
        ? await this.prisma.drawingAssignment.update({
            where: { id: existing.id },
            data: {
              assignedByAdminId: adminId,
              accessTokenHmac: this.lookup.digest(token),
              status: DrawingAssignmentStatus.SHARED,
              sharedVersion: drawing.version,
              assignedAt: new Date(),
              revokedAt: null,
              version: { increment: 1 },
            },
          })
        : await this.prisma.drawingAssignment.create({
            data: {
              drawingId,
              studentId: student.id,
              assignedByAdminId: adminId,
              accessTokenHmac: this.lookup.digest(token),
              sharedVersion: drawing.version,
            },
          });
      const drawingUrl = this.drawingUrl(token);
      try {
        const message = await this.messages.createIntent({
          eventKey: 'DRAWING_SHARED',
          studentId: student.id,
          channelIdentityId: student.defaultChannelIdentity.id,
          idempotencyKey: `drawing:${assignment.id}:shared:v${assignment.version}`,
          locale: student.preferredLocale,
          stage: student.curriculumStage,
          variables: {
            studentDisplayName: this.firstNameVariable(student),
            drawingTitle: drawing.title,
            drawingUrl,
          },
        });
        await this.prisma.drawingAssignment.update({
          where: { id: assignment.id },
          data: { messageIntentId: message.intentId },
        });
        results.push({
          studentId: student.id,
          assignmentId: assignment.id,
          drawingUrl,
          sent: true,
          messageIntentId: message.intentId,
        });
      } catch (error) {
        results.push({
          studentId: student.id,
          assignmentId: assignment.id,
          drawingUrl,
          sent: false,
          error: error instanceof Error ? error.message : 'Mesaj oluşturulamadı.',
        });
      }
      await this.audit(this.prisma, adminId, 'DRAWING_SHARED', assignment.id, {
        drawingId,
        studentId: student.id,
        sharedVersion: drawing.version,
      });
    }
    return { items: results };
  }

  async revoke(drawingId: string, assignmentId: string, adminId: string) {
    const assignment = await this.prisma.drawingAssignment.findFirst({
      where: { id: assignmentId, drawingId },
    });
    if (!assignment) throw new NotFoundException('Çizim paylaşımı bulunamadı.');
    if (assignment.status !== DrawingAssignmentStatus.REVOKED)
      await this.prisma.drawingAssignment.update({
        where: { id: assignment.id },
        data: {
          status: DrawingAssignmentStatus.REVOKED,
          revokedAt: new Date(),
          version: { increment: 1 },
        },
      });
    await this.audit(this.prisma, adminId, 'DRAWING_ACCESS_REVOKED', assignment.id, {
      drawingId,
      studentId: assignment.studentId,
    });
    return { id: assignment.id, revoked: true };
  }

  async access(token: string) {
    if (token.length < 32 || token.length > 100)
      throw new NotFoundException('Çizim bağlantısı geçersiz.');
    const assignment = await this.prisma.drawingAssignment.findUnique({
      where: { accessTokenHmac: this.lookup.digest(token) },
      include: { drawing: true },
    });
    if (!assignment || assignment.status === DrawingAssignmentStatus.REVOKED)
      throw new NotFoundException('Çizim bağlantısı geçersiz veya erişim kaldırılmış.');
    const now = new Date();
    await this.prisma.drawingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: DrawingAssignmentStatus.OPENED,
        firstOpenedAt: assignment.firstOpenedAt ?? now,
        lastOpenedAt: now,
        version: { increment: 1 },
      },
    });
    return {
      title: assignment.drawing.title,
      description: assignment.drawing.description,
      scene: await this.readScene(assignment.drawing),
      sharedVersion: assignment.sharedVersion,
      currentVersion: assignment.drawing.version,
      updatedSinceShare: assignment.sharedVersion !== assignment.drawing.version,
    };
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

  private drawingUrl(token: string): string {
    const origin = (this.config.ADMIN_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/u, '');
    return `${origin}/drawing#${token}`;
  }

  private firstNameVariable(student: {
    id: string;
    fullNameEncrypted: Uint8Array | null;
    fullNameKeyId: string | null;
  }): string {
    const name = this.decryptStudentName(
      student.id,
      student.fullNameEncrypted,
      student.fullNameKeyId,
    );
    return name ? ` ${name.trim().split(/\s+/)[0]}` : '';
  }

  private decryptStudentName(
    studentId: string,
    encrypted: Uint8Array | null,
    keyId: string | null,
  ): string | undefined {
    if (!encrypted || !keyId) return undefined;
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `student:${studentId}:name`,
      );
    } catch {
      return undefined;
    }
  }

  private audit(
    tx: Prisma.TransactionClient | PrismaService,
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
