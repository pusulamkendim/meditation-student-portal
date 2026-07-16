import {
  GeminiPaidAdapter,
  containsPromptInjection,
  isFeatureEnabled,
  ragDefaults,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { LlmTask, Prisma, PrismaClient } from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { reserveBudget, releaseBudget, settleBudget } from './llm-budget.js';

const AGENT_MAX_KNOWLEDGE_CHUNKS = 3;
const AGENT_MAX_KNOWLEDGE_CHARS = 6_000;

export interface RetrievalChunk {
  id: string;
  content: string;
  titlePath: string;
  logicalName: string;
  score: number;
}

export interface RetrievalResult {
  supported: boolean;
  chunks: RetrievalChunk[];
  queryLogId: string;
  reasonCode?: string;
}

export class KnowledgeRetrievalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {}

  async search(
    question: string,
    studentId: string,
    sourceMessageId?: string,
  ): Promise<RetrievalResult> {
    const startedAt = this.clock.now().getTime();
    const flag = await this.prisma.featureFlagConfig.findUnique({
      where: { key: 'knowledge.rag.enabled' },
    });
    const active =
      flag &&
      isFeatureEnabled(
        {
          key: 'knowledge.rag.enabled',
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          scope: flag.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
          subjectIds: Array.isArray(flag.subjectIds) ? flag.subjectIds.map(String) : undefined,
        },
        studentId,
      );
    if (!active)
      return this.log({
        studentId,
        sourceMessageId,
        candidates: [],
        selected: [],
        scores: {},
        passed: false,
        startedAt,
        reasonCode: 'RAG_DISABLED',
        curriculumStage: undefined,
        configVersion: 1,
      });
    const config = await this.prisma.knowledgeRetrievalConfig.findUnique({
      where: { id: 'default' },
    });
    const retrieval = config ?? { ...ragDefaults, version: 1 };
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { curriculumStage: true },
    });
    const model = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.KNOWLEDGE_EMBEDDING },
      include: {
        primaryModel: {
          include: { provider: true, priceVersions: { orderBy: { effectiveAt: 'desc' }, take: 1 } },
        },
      },
    });
    if (
      !model?.enabled ||
      !model.primaryModel ||
      model.primaryModel.status !== 'ACTIVE' ||
      model.primaryModel.provider.status !== 'ENABLED' ||
      model.primaryModel.provider.adapterId !== 'gemini' ||
      !this.config.GEMINI_API_KEY
    )
      return this.log({
        studentId,
        sourceMessageId,
        candidates: [],
        selected: [],
        scores: {},
        passed: false,
        startedAt,
        reasonCode: 'EMBEDDING_UNAVAILABLE',
        curriculumStage: student?.curriculumStage,
        configVersion: retrieval.version,
      });
    const operationId = `rag-query:${sourceMessageId ?? randomUUID()}`;
    const price = model.primaryModel.priceVersions[0];
    const estimate = price
      ? (BigInt(Math.ceil(question.length / 4)) * price.inputMicroUsdPerM) / 1_000_000n
      : 0n;
    await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
    try {
      const embedding = await new GeminiPaidAdapter(this.config.GEMINI_API_KEY).embedContent({
        model: {
          id: model.primaryModel.id,
          providerId: model.primaryModel.providerId,
          providerModelId: model.primaryModel.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        content: question,
        outputDimensionality: 768,
      });
      const literal = `[${embedding.values.join(',')}]`;
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          content: string;
          title_path: string;
          logical_name: string;
          score: number;
        }>
      >(Prisma.sql`
        SELECT kc.id, kc.content, kc.title_path, kd.logical_name,
          (${retrieval.vectorWeight} * (1 - (ke.embedding_vector <=> CAST(${literal} AS vector))) +
           ${retrieval.keywordWeight} * ts_rank_cd(to_tsvector('simple', kc.content), plainto_tsquery('simple', ${question}))) AS score
        FROM knowledge_chunks kc
        JOIN knowledge_embeddings ke ON ke.chunk_id = kc.id AND ke.status = 'READY'::"KnowledgeEmbeddingStatus"
        JOIN knowledge_document_versions kdv ON kdv.id = kc.document_version_id AND kdv.status = 'PUBLISHED'::"KnowledgeDocumentVersionStatus"
        JOIN knowledge_documents kd ON kd.id = kdv.document_id AND kd.active = TRUE
        LEFT JOIN knowledge_document_stage_assignments ksa ON ksa.document_version_id = kdv.id
        WHERE (ksa.stage = 'GENERAL'::"KnowledgeStage" OR ksa.stage = ${student?.curriculumStage ?? 'WEEK_1'}::"KnowledgeStage")
        ORDER BY score DESC LIMIT ${retrieval.topK}`);
      const candidates = rows.map((row) => ({ ...row, score: Number(row.score) }));
      const selected: RetrievalChunk[] = [];
      const docs = new Map<string, number>();
      for (const row of candidates) {
        if (row.score < retrieval.minScore) continue;
        const count = docs.get(row.logical_name) ?? 0;
        if (count >= retrieval.maxChunksPerDocument) continue;
        const chars = selected.reduce((sum, item) => sum + item.content.length, 0);
        if (
          chars + row.content.length >
          Math.min(retrieval.maxContextChars, AGENT_MAX_KNOWLEDGE_CHARS)
        )
          break;
        selected.push({
          id: row.id,
          content: row.content,
          titlePath: row.title_path,
          logicalName: row.logical_name,
          score: row.score,
        });
        docs.set(row.logical_name, count + 1);
        if (selected.length >= Math.min(retrieval.finalChunks, AGENT_MAX_KNOWLEDGE_CHUNKS)) break;
      }
      if (selected.some((chunk) => containsPromptInjection(chunk.content)))
        return {
          ...(await this.log({
            studentId,
            sourceMessageId,
            candidates: candidates.map((row) => row.id),
            selected: [],
            scores: Object.fromEntries(candidates.map((row) => [row.id, row.score])),
            passed: false,
            startedAt,
            reasonCode: 'UNTRUSTED_SOURCE',
            curriculumStage: student?.curriculumStage,
            configVersion: retrieval.version,
          })),
          chunks: [],
        };
      const result = await this.log({
        studentId,
        sourceMessageId,
        candidates: candidates.map((row) => row.id),
        selected: selected.map((row) => row.id),
        scores: Object.fromEntries(candidates.map((row) => [row.id, row.score])),
        passed: selected.length > 0,
        startedAt,
        curriculumStage: student?.curriculumStage,
        configVersion: retrieval.version,
      });
      const actual = price
        ? (BigInt(embedding.inputTokens) * price.inputMicroUsdPerM) / 1_000_000n
        : 0n;
      await this.prisma.llmUsageLog.create({
        data: {
          operationId,
          attempt: 1,
          task: LlmTask.KNOWLEDGE_EMBEDDING,
          studentId,
          sourceMessageId,
          requestedModelId: model.primaryModel.id,
          actualModelId: model.primaryModel.id,
          priceVersionId: price?.id,
          inputTokens: embedding.inputTokens,
          outputTokens: 0,
          totalTokens: embedding.inputTokens,
          estimatedMicroUsd: actual,
          latencyMs: this.clock.now().getTime() - startedAt,
          status: 'SUCCEEDED',
          metadata: { purpose: 'RAG_QUERY' },
        },
      });
      await settleBudget(this.prisma, operationId, actual, this.clock.now());
      return { ...result, chunks: selected };
    } catch (error) {
      await releaseBudget(this.prisma, operationId);
      return this.log({
        studentId,
        sourceMessageId,
        candidates: [],
        selected: [],
        scores: {},
        passed: false,
        startedAt,
        reasonCode: error instanceof Error ? error.name : 'RAG_FAILED',
        curriculumStage: student?.curriculumStage,
        configVersion: retrieval.version,
      });
    }
  }

  private async log(input: {
    studentId: string;
    sourceMessageId?: string;
    candidates: string[];
    selected: string[];
    scores: Record<string, number>;
    passed: boolean;
    startedAt: number;
    reasonCode?: string;
    curriculumStage?: string;
    configVersion: number;
  }): Promise<RetrievalResult> {
    const queryLog = await this.prisma.ragQueryLog.create({
      data: {
        studentId: input.studentId,
        sourceMessageId: input.sourceMessageId,
        curriculumStage: input.curriculumStage,
        retrievalConfigVersion: input.configVersion,
        candidateChunkIds: input.candidates,
        selectedChunkIds: input.selected,
        scores: input.reasonCode ? { ...input.scores, reasonCode: input.reasonCode } : input.scores,
        thresholdPassed: input.passed,
        latencyMs: Math.max(0, this.clock.now().getTime() - input.startedAt),
      },
    });
    return {
      supported: input.passed,
      chunks: [],
      queryLogId: queryLog.id,
      reasonCode: input.reasonCode,
    };
  }
}
