import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  contentHash,
  knowledgeStageSchema,
  ragDefaults,
  type KnowledgeStage,
  type ApplicationConfig,
} from '@meditation/core';
import { KnowledgeDocumentVersionStatus, Prisma } from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { R2ObjectStorage } from './storage.js';

const ALLOWED_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const EXTENSIONS = new Set(['.txt', '.md', '.csv', '.pdf', '.docx']);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

@Injectable()
export class KnowledgeService {
  private readonly storage: R2ObjectStorage;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {
    this.storage = new R2ObjectStorage(this.config);
  }

  async listBases() {
    return this.prisma.knowledgeBase.findMany({
      include: { _count: { select: { documents: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createBase(input: { name: string; description?: string }) {
    return this.prisma.knowledgeBase.create({
      data: { name: input.name.trim(), description: input.description?.trim() || null },
    });
  }

  async listDocuments(baseId: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: baseId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { stageAssignments: true, _count: { select: { chunks: true } } },
        },
      },
      orderBy: { logicalName: 'asc' },
    });
  }

  async upload(input: {
    baseId: string;
    logicalName?: string;
    stages: string[];
    files: Array<{ filename: string; mimetype: string; buffer: Buffer }>;
  }) {
    if (!input.files.length) throw new BadRequestException('En az bir dosya yüklenmelidir.');
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id: input.baseId } });
    if (!base) throw new NotFoundException('Bilgi bankası bulunamadı.');
    const stages = input.stages.length ? input.stages : ['GENERAL'];
    const parsedStages = stages.map((stage) => {
      const parsed = knowledgeStageSchema.safeParse(stage);
      if (!parsed.success) throw new BadRequestException(`Geçersiz aşama: ${stage}`);
      return parsed.data as KnowledgeStage;
    });
    const totalBytes = input.files.reduce((total, file) => total + file.buffer.byteLength, 0);
    if (totalBytes > MAX_REQUEST_BYTES)
      throw new BadRequestException('İstek toplam boyutu 100 MiB sınırını aşıyor.');
    const results = [];
    for (const file of input.files) {
      if (file.buffer.byteLength > MAX_FILE_BYTES)
        throw new BadRequestException(`${file.filename} 25 MiB sınırını aşıyor.`);
      const extension = file.filename.slice(file.filename.lastIndexOf('.')).toLowerCase();
      if (!EXTENSIONS.has(extension) || !ALLOWED_TYPES.has(file.mimetype))
        throw new BadRequestException(`${file.filename} desteklenmeyen dosya türü.`);
      const name = (input.logicalName?.trim() || file.filename).slice(0, 240);
      const document = await this.prisma.knowledgeDocument.upsert({
        where: { knowledgeBaseId_logicalName: { knowledgeBaseId: base.id, logicalName: name } },
        create: { knowledgeBaseId: base.id, logicalName: name },
        update: { active: true },
      });
      const latest = await this.prisma.knowledgeDocumentVersion.findFirst({
        where: { documentId: document.id },
        orderBy: { version: 'desc' },
      });
      const version = (latest?.version ?? 0) + 1;
      const hash = contentHash(file.buffer);
      const quarantineKey = `quarantine/${document.id}/${version}-${randomUUID()}${extension}`;
      await this.storage.put(
        this.configBucket('quarantine'),
        quarantineKey,
        file.buffer,
        file.mimetype,
      );
      const created = await this.prisma.$transaction(async (tx) => {
        const versionRow = await tx.knowledgeDocumentVersion.create({
          data: {
            documentId: document.id,
            version,
            filename: file.filename,
            contentType: file.mimetype,
            byteSize: file.buffer.byteLength,
            contentHash: hash,
            quarantineKey,
            status: KnowledgeDocumentVersionStatus.UPLOADED,
            stageAssignments: { create: parsedStages.map((stage) => ({ stage })) },
          },
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'knowledge.document-parse',
            aggregateType: 'KnowledgeDocumentVersion',
            aggregateId: versionRow.id,
            eventType: 'KnowledgeDocumentUploaded',
            payload: { versionId: versionRow.id },
          },
        });
        return versionRow;
      });
      results.push(created);
    }
    return results;
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.knowledgeDocumentVersion.findUnique({
      where: { id: versionId },
      include: {
        document: { include: { knowledgeBase: true } },
        stageAssignments: true,
        chunks: { orderBy: { chunkIndex: 'asc' }, take: 100 },
      },
    });
    if (!version) throw new NotFoundException('Belge sürümü bulunamadı.');
    return {
      ...version,
      extractedText: version.extractedText ? version.extractedText.slice(0, 20_000) : null,
    };
  }

  async signedUrl(versionId: string) {
    const version = await this.prisma.knowledgeDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version?.storageKey) throw new NotFoundException('Yayınlanmış dosya bulunamadı.');
    return {
      url: await this.storage.signedUrl(this.configBucket('private'), version.storageKey, 300),
      expiresIn: 300,
    };
  }

  async setStatus(versionId: string, status: 'PUBLISHED' | 'ARCHIVED') {
    const version = await this.prisma.knowledgeDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Belge sürümü bulunamadı.');
    if (status === 'PUBLISHED' && !['READY', 'PUBLISHED'].includes(version.status))
      throw new BadRequestException('Yalnızca READY sürümler yayınlanabilir.');
    return this.prisma.$transaction(async (tx) => {
      if (status === 'PUBLISHED')
        await tx.knowledgeDocumentVersion.updateMany({
          where: { documentId: version.documentId, id: { not: versionId }, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        });
      return tx.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data:
          status === 'PUBLISHED'
            ? { status, publishedAt: new Date(), archivedAt: null }
            : { status, archivedAt: new Date() },
      });
    });
  }

  async reindex(versionId: string) {
    const version = await this.prisma.knowledgeDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Belge sürümü bulunamadı.');
    let quarantineKey = version.quarantineKey;
    if (version.storageKey) {
      quarantineKey = `quarantine/${version.documentId}/${version.version}-${randomUUID()}-reindex`;
      await this.storage.copy(
        this.configBucket('private'),
        version.storageKey,
        this.configBucket('quarantine'),
        quarantineKey,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data: { status: 'UPLOADED', quarantineKey, errorCode: null },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'knowledge.document-parse',
          aggregateType: 'KnowledgeDocumentVersion',
          aggregateId: versionId,
          eventType: 'KnowledgeDocumentReindexRequested',
          payload: { versionId },
        },
      });
    });
    return { accepted: true, versionId };
  }

  async retrievalConfig() {
    return this.prisma.knowledgeRetrievalConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...ragDefaults },
      update: {},
    });
  }

  async updateRetrievalConfig(input: {
    topK: number;
    finalChunks: number;
    minScore: number;
    maxContextChars: number;
    vectorWeight: number;
    keywordWeight: number;
    maxChunksPerDocument: number;
  }) {
    if (input.finalChunks > input.topK || input.vectorWeight + input.keywordWeight <= 0)
      throw new BadRequestException('Retrieval ayarları tutarsız.');
    return this.prisma.knowledgeRetrievalConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...input, version: 1 },
      update: { ...input, version: { increment: 1 } },
    });
  }

  async testSearch(query: string, stage?: string) {
    const parsedStage = stage ? knowledgeStageSchema.safeParse(stage) : null;
    if (parsedStage && !parsedStage.success) throw new BadRequestException('Geçersiz aşama.');
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; content: string; title_path: string; logical_name: string; rank: number }>
    >(Prisma.sql`
      SELECT kc.id, kc.content, kc.title_path, kd.logical_name,
        ts_rank_cd(to_tsvector('simple', kc.content), plainto_tsquery('simple', ${query})) AS rank
      FROM knowledge_chunks kc
      JOIN knowledge_document_versions kdv ON kdv.id = kc.document_version_id
      JOIN knowledge_documents kd ON kd.id = kdv.document_id
      LEFT JOIN knowledge_document_stage_assignments ksa ON ksa.document_version_id = kdv.id
      WHERE kdv.status = 'PUBLISHED'::"KnowledgeDocumentVersionStatus"
        AND (${parsedStage ? Prisma.sql`ksa.stage = ${parsedStage.data}::"KnowledgeStage"` : Prisma.sql`TRUE`})
      ORDER BY rank DESC, kc.created_at DESC LIMIT 20`);
    return {
      query,
      stage: parsedStage?.data ?? null,
      results: rows.map((row) => ({ ...row, rank: Number(row.rank) })),
    };
  }

  async handoffs(status?: 'OPEN' | 'RESOLVED') {
    return this.prisma.handoff.findMany({
      where: status ? { status } : undefined,
      include: { student: { select: { id: true, preferredLocale: true, curriculumStage: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async resolveHandoff(id: string, adminId: string) {
    const result = await this.prisma.handoff.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedByAdminId: adminId, resolvedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Açık handoff bulunamadı.');
    return this.prisma.handoff.findUniqueOrThrow({ where: { id } });
  }

  private configBucket(kind: 'quarantine' | 'private'): string {
    return kind === 'quarantine' ? this.config.R2_QUARANTINE_BUCKET : this.config.R2_PRIVATE_BUCKET;
  }
}
