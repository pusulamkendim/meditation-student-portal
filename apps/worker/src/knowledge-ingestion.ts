import { createConnection } from 'node:net';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import {
  GeminiPaidAdapter,
  isFeatureEnabled,
  chunkKnowledgeText,
  contentHash,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { LlmTask, Prisma, PrismaClient } from '@meditation/database';
import { WorkerObjectStorage } from './knowledge-storage.js';
import { reserveBudget, releaseBudget, settleBudget } from './llm-budget.js';

const MAX_TEXT_CHARS = 5_000_000;

export class KnowledgeIngestionProcessor {
  private readonly storage: WorkerObjectStorage;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    this.storage = new WorkerObjectStorage(config);
  }

  async process(versionId: string): Promise<'processed' | 'deferred' | 'failed'> {
    const enabled = await this.prisma.featureFlagConfig.findUnique({
      where: { key: 'knowledge.ingestion.enabled' },
    });
    if (
      !enabled ||
      !isFeatureEnabled(
        {
          key: 'knowledge.ingestion.enabled',
          enabled: enabled.enabled,
          rolloutPercentage: enabled.rolloutPercentage,
          scope: enabled.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
          subjectIds: Array.isArray(enabled.subjectIds)
            ? enabled.subjectIds.map(String)
            : undefined,
        },
        'knowledge',
      )
    )
      return 'deferred';
    const version = await this.prisma.knowledgeDocumentVersion.findUnique({
      where: { id: versionId },
      include: { document: true },
    });
    if (!version || !version.quarantineKey) return 'failed';
    if (version.status === 'PUBLISHED' || version.status === 'ARCHIVED') return 'processed';
    try {
      await this.setStatus(versionId, 'SCANNING');
      const source = await this.storage.get(
        this.config.R2_QUARANTINE_BUCKET,
        version.quarantineKey,
      );
      await this.scan(source);
      await this.setStatus(versionId, 'PARSING');
      const text = await this.extract(version.contentType, version.filename, source);
      if (!text.trim()) throw new Error('FAILED_TEXT_EXTRACTION');
      if (text.length > MAX_TEXT_CHARS) throw new Error('TEXT_TOO_LARGE');
      await this.prisma.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data: { extractedText: text, parserVersion: 'm8-1', status: 'CHUNKING' },
      });
      const chunks = chunkKnowledgeText(text);
      if (!chunks.length) throw new Error('NO_CHUNKS');
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { documentVersionId: versionId } });
        await tx.knowledgeChunk.createMany({
          data: chunks.map((chunk, index) => ({
            documentVersionId: versionId,
            chunkIndex: index,
            titlePath: chunk.titlePath,
            content: chunk.content,
            contentHash: contentHash(chunk.content),
            tokenCount: chunk.tokenCount,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            stageSnapshot: { source: 'admin', version: version.version },
          })),
        });
        await tx.knowledgeDocumentVersion.update({
          where: { id: versionId },
          data: { status: 'EMBEDDING' },
        });
      });
      await this.embed(versionId, version.document.logicalName);
      const privateKey = `knowledge/${version.documentId}/v${version.version}/${version.id}-${version.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await this.storage.move(
        this.config.R2_QUARANTINE_BUCKET,
        version.quarantineKey,
        this.config.R2_PRIVATE_BUCKET,
        privateKey,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeDocumentVersion.updateMany({
          where: {
            documentId: version.documentId,
            id: { not: versionId },
            status: 'PUBLISHED',
          },
          data: { status: 'ARCHIVED', archivedAt: this.clock.now() },
        });
        await tx.knowledgeDocumentVersion.update({
          where: { id: versionId },
          data: {
            storageKey: privateKey,
            status: 'PUBLISHED',
            publishedAt: this.clock.now(),
            archivedAt: null,
          },
        });
      });
      return 'processed';
    } catch (error) {
      await this.prisma.knowledgeDocumentVersion
        .update({
          where: { id: versionId },
          data: {
            status: 'FAILED',
            errorCode: error instanceof Error ? error.message.slice(0, 120) : 'INGESTION_FAILED',
          },
        })
        .catch(() => undefined);
      await this.prisma.outboxEvent
        .create({
          data: {
            topic: 'admin.notifications',
            aggregateType: 'KnowledgeDocumentVersion',
            aggregateId: versionId,
            eventType: 'KnowledgeIndexFailed',
            payload: {
              versionId,
              errorCode: error instanceof Error ? error.message.slice(0, 120) : 'INGESTION_FAILED',
            },
          },
        })
        .catch(() => undefined);
      return 'failed';
    }
  }

  private async embed(versionId: string, logicalName: string): Promise<void> {
    const task = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.KNOWLEDGE_EMBEDDING },
      include: {
        primaryModel: {
          include: { provider: true, priceVersions: { orderBy: { effectiveAt: 'desc' }, take: 1 } },
        },
      },
    });
    if (
      !task?.enabled ||
      !task.primaryModel ||
      task.primaryModel.status !== 'ACTIVE' ||
      task.primaryModel.provider.status !== 'ENABLED' ||
      task.primaryModel.provider.adapterId !== 'gemini' ||
      !this.config.GEMINI_API_KEY
    )
      throw new Error('EMBEDDING_MODEL_UNAVAILABLE');
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { documentVersionId: versionId },
      orderBy: { chunkIndex: 'asc' },
    });
    const adapter = new GeminiPaidAdapter(this.config.GEMINI_API_KEY);
    for (const [index, chunk] of chunks.entries()) {
      const operationId = `knowledge-embedding:${chunk.id}:${task.version}`;
      const existing = await this.prisma.knowledgeEmbedding.findFirst({
        where: {
          chunkId: chunk.id,
          modelRef: task.primaryModel.providerModelId,
          contentHash: chunk.contentHash,
          status: 'READY',
        },
      });
      if (existing) continue;
      const price = task.primaryModel.priceVersions[0];
      const estimate = price
        ? (BigInt(Math.ceil(chunk.tokenCount)) * price.inputMicroUsdPerM) / 1_000_000n
        : 0n;
      await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
      const started = this.clock.now().getTime();
      try {
        const result = await adapter.embedContent({
          model: {
            id: task.primaryModel.id,
            providerId: task.primaryModel.providerId,
            providerModelId: task.primaryModel.providerModelId,
            status: 'ACTIVE',
          },
          operationId,
          content: `${logicalName}\n\n${chunk.content}`,
          outputDimensionality: 768,
        });
        const actual = price
          ? (BigInt(result.inputTokens) * price.inputMicroUsdPerM) / 1_000_000n
          : 0n;
        const embedding = await this.prisma.knowledgeEmbedding.upsert({
          where: {
            chunkId_modelRef_contentHash: {
              chunkId: chunk.id,
              modelRef: task.primaryModel.providerModelId,
              contentHash: chunk.contentHash,
            },
          },
          create: {
            chunkId: chunk.id,
            modelRef: task.primaryModel.providerModelId,
            modelVersion: 'm8',
            dimension: 768,
            contentHash: chunk.contentHash,
            status: 'READY',
          },
          update: { modelVersion: 'm8', dimension: 768, status: 'READY' },
        });
        const literal = `[${result.values.join(',')}]`;
        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE knowledge_embeddings SET embedding_vector = CAST(${literal} AS vector), status = 'READY'::"KnowledgeEmbeddingStatus" WHERE id = ${embedding.id}::uuid`,
        );
        await this.prisma.llmUsageLog.create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.KNOWLEDGE_EMBEDDING,
            requestedModelId: task.primaryModel.id,
            actualModelId: task.primaryModel.id,
            priceVersionId: price?.id,
            providerRequestId: result.providerRequestId,
            inputTokens: result.inputTokens,
            outputTokens: 0,
            totalTokens: result.inputTokens,
            estimatedMicroUsd: actual,
            latencyMs: this.clock.now().getTime() - started,
            status: 'SUCCEEDED',
            metadata: { chunkId: chunk.id, chunkIndex: index },
          },
        });
        await settleBudget(this.prisma, operationId, actual, this.clock.now());
      } catch (error) {
        await releaseBudget(this.prisma, operationId);
        await this.prisma.llmUsageLog
          .create({
            data: {
              operationId,
              attempt: 1,
              task: LlmTask.KNOWLEDGE_EMBEDDING,
              requestedModelId: task.primaryModel.id,
              actualModelId: task.primaryModel.id,
              priceVersionId: price?.id,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedMicroUsd: 0n,
              latencyMs: this.clock.now().getTime() - started,
              status: 'FAILED',
              errorCode: error instanceof Error ? error.name : 'EMBEDDING_FAILED',
              metadata: { chunkId: chunk.id },
            },
          })
          .catch(() => undefined);
        throw error;
      }
    }
  }

  private async setStatus(versionId: string, status: 'SCANNING' | 'PARSING') {
    await this.prisma.knowledgeDocumentVersion.update({
      where: { id: versionId },
      data: { status },
    });
  }

  private async extract(contentType: string, filename: string, source: Buffer): Promise<string> {
    if (contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf'))
      return (await pdfParse(source)).text;
    if (contentType.includes('wordprocessingml') || filename.toLowerCase().endsWith('.docx'))
      return (await mammoth.extractRawText({ buffer: source })).value;
    return source.toString('utf8');
  }

  private async scan(source: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({
        host: this.config.CLAMAV_HOST,
        port: this.config.CLAMAV_PORT,
      });
      let response = '';
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('CLAMAV_TIMEOUT'));
      }, 15_000);
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < source.length; offset += 64 * 1024) {
          const part = source.subarray(offset, Math.min(source.length, offset + 64 * 1024));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(part.length);
          socket.write(length);
          socket.write(part);
        }
        const end = Buffer.alloc(4);
        socket.write(end);
      });
      socket.on('data', (data) => {
        response += data.toString();
        if (/\bOK\b/.test(response) || /FOUND/.test(response)) {
          clearTimeout(timeout);
          socket.end();
          if (/FOUND/.test(response)) reject(new Error('MALWARE_FOUND'));
          else resolve();
        }
      });
      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('close', () => clearTimeout(timeout));
    });
  }
}
