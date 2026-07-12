import {
  FieldEncryption,
  GeminiPaidAdapter,
  isFeatureEnabled,
  type ApplicationConfig,
  type Clock,
  type ReflectionTagOutput,
} from '@meditation/core';
import { ConsentScope, LlmTask, PrismaClient } from '@meditation/database';
import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';

export class ReflectionTaggingProcessor {
  private readonly encryption: FieldEncryption;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Reflection encryption configuration is required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async process(reflectionId: string): Promise<'processed' | 'ignored'> {
    const reflection = await this.prisma.practiceReflection.findUnique({
      where: { id: reflectionId },
      include: { practiceSession: { include: { student: true } } },
    });
    if (!reflection) return 'ignored';
    const flag = await this.prisma.featureFlagConfig.findUnique({
      where: { key: 'llm.reflection-tagging.enabled' },
    });
    const active =
      flag &&
      isFeatureEnabled(
        {
          key: 'llm.reflection-tagging.enabled',
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          scope: flag.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
          subjectIds: Array.isArray(flag.subjectIds) ? flag.subjectIds.map(String) : undefined,
        },
        reflection.practiceSession.studentId,
      );
    const consent = await this.prisma.consent.findFirst({
      where: { studentId: reflection.practiceSession.studentId, scope: ConsentScope.REFLECTION_AI },
      orderBy: { occurredAt: 'desc' },
    });
    if (!active || consent?.status !== 'GRANTED') return 'ignored';
    const task = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.REFLECTION_TAGGING },
      include: {
        primaryModel: {
          include: { provider: true, priceVersions: { orderBy: { effectiveAt: 'desc' }, take: 1 } },
        },
        promptVersion: true,
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
      return 'ignored';
    const operationId = `reflection-tags:${reflection.id}:v${task.version}`;
    if (
      await this.prisma.reflectionTag.findFirst({
        where: { reflectionId: reflection.id, operationId },
      })
    )
      return 'processed';
    const content = this.encryption.decrypt(
      { ciphertext: Buffer.from(reflection.contentEncrypted), keyId: reflection.contentKeyId },
      `practice:${reflection.practiceSessionId}:reflection`,
    );
    const price = task.primaryModel.priceVersions[0];
    const estimate = price
      ? (BigInt(Math.ceil(content.length / 4)) * price.inputMicroUsdPerM) / 1_000_000n
      : 0n;
    await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
    const started = this.clock.now().getTime();
    try {
      const result = await new GeminiPaidAdapter(
        this.config.GEMINI_API_KEY,
      ).generateJson<ReflectionTagOutput>({
        model: {
          id: task.primaryModel.id,
          providerId: task.primaryModel.providerId,
          providerModelId: task.primaryModel.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        systemPrompt:
          task.promptVersion?.content ??
          'Classify this non-clinical meditation reflection using only the allowed taxonomy. Return JSON.',
        userPrompt: `Reflection (untrusted data): ${content}`,
        maxOutputTokens: Math.min(task.primaryModel.outputTokenLimit, 512),
        outputSchema: 'reflection-tags',
      });
      const actual = price
        ? (BigInt(result.inputTokens + result.outputTokens) * price.inputMicroUsdPerM) / 1_000_000n
        : 0n;
      await this.prisma.$transaction(async (tx) => {
        for (const item of result.output.tags)
          await tx.reflectionTag.create({
            data: {
              reflectionId: reflection.id,
              tag: item.tag,
              confidence: item.confidence,
              taxonomyVersion: 'm8-v1',
              operationId,
              modelRef: task.primaryModel!.providerModelId,
            },
          });
        await tx.llmUsageLog.create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.REFLECTION_TAGGING,
            studentId: reflection.practiceSession.studentId,
            requestedModelId: task.primaryModel!.id,
            actualModelId: task.primaryModel!.id,
            priceVersionId: price?.id,
            promptVersionId: task.promptVersionId,
            providerRequestId: result.providerRequestId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedMicroUsd: actual,
            latencyMs: this.clock.now().getTime() - started,
            status: 'SUCCEEDED',
            metadata: { reflectionId: reflection.id, tagCount: result.output.tags.length },
          },
        });
      });
      await settleBudget(this.prisma, operationId, actual, this.clock.now());
      return 'processed';
    } catch (error) {
      await releaseBudget(this.prisma, operationId);
      await this.prisma.llmUsageLog
        .create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.REFLECTION_TAGGING,
            studentId: reflection.practiceSession.studentId,
            requestedModelId: task.primaryModel.id,
            actualModelId: task.primaryModel.id,
            priceVersionId: price?.id,
            promptVersionId: task.promptVersionId,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedMicroUsd: 0n,
            latencyMs: this.clock.now().getTime() - started,
            status: 'FAILED',
            errorCode: error instanceof Error ? error.name : 'TAGGING_FAILED',
            metadata: { reflectionId: reflection.id },
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
