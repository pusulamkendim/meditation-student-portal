import {
  FieldEncryption,
  GeminiPaidAdapter,
  isFeatureEnabled,
  type ApplicationConfig,
  type Clock,
  type WeeklySummaryOutput,
} from '@meditation/core';
import { ConsentScope, LlmTask, PrismaClient } from '@meditation/database';
import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';

export class WeeklySummaryAiProcessor {
  private readonly encryption: FieldEncryption;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Weekly summary encryption configuration is required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async process(meetingId: string): Promise<'processed' | 'ignored'> {
    const meeting = await this.prisma.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: { summary: true, meetingSeries: { include: { student: true } } },
    });
    if (!meeting?.summary) return 'ignored';
    const flag = await this.prisma.featureFlagConfig.findUnique({
      where: { key: 'llm.weekly-summary.enabled' },
    });
    const active =
      flag &&
      isFeatureEnabled(
        {
          key: 'llm.weekly-summary.enabled',
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          scope: flag.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
          subjectIds: Array.isArray(flag.subjectIds) ? flag.subjectIds.map(String) : undefined,
        },
        meeting.meetingSeries.studentId,
      );
    const consent = await this.prisma.consent.findFirst({
      where: { studentId: meeting.meetingSeries.studentId, scope: ConsentScope.REFLECTION_AI },
      orderBy: { occurredAt: 'desc' },
    });
    if (!active || consent?.status !== 'GRANTED') return 'ignored';
    const task = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.WEEKLY_SUMMARY },
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
    const operationId = `weekly-summary:${meeting.id}:v${task.version}`;
    const existing = await this.prisma.weeklySummaryDraftVersion.findFirst({
      where: { meetingId: meeting.id, operationId },
    });
    if (existing) return 'processed';
    const since = new Date(meeting.startsAt.getTime() - 7 * 86_400_000);
    const reflections = await this.prisma.practiceReflection.findMany({
      where: {
        practiceSession: {
          studentId: meeting.meetingSeries.studentId,
          startAt: { gte: since, lt: meeting.startsAt },
        },
      },
      include: { practiceSession: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const reflectionText = reflections
      .map((reflection) =>
        this.encryption.decrypt(
          { ciphertext: Buffer.from(reflection.contentEncrypted), keyId: reflection.contentKeyId },
          `practice:${reflection.practiceSessionId}:reflection`,
        ),
      )
      .join('\n---\n');
    const input = JSON.stringify({
      deterministic: meeting.summary,
      reflections: reflectionText.slice(0, 18_000),
    });
    const price = task.primaryModel.priceVersions[0];
    const estimate = price
      ? (BigInt(Math.ceil(input.length / 4)) * price.inputMicroUsdPerM) / 1_000_000n
      : 0n;
    await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
    const started = this.clock.now().getTime();
    try {
      const result = await new GeminiPaidAdapter(
        this.config.GEMINI_API_KEY,
      ).generateJson<WeeklySummaryOutput>({
        model: {
          id: task.primaryModel.id,
          providerId: task.primaryModel.providerId,
          providerModelId: task.primaryModel.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        systemPrompt:
          task.promptVersion?.content ??
          'Create a concise, non-clinical weekly meditation summary from the supplied facts. Do not diagnose or infer unsupported facts. Return JSON.',
        userPrompt: `Weekly data (untrusted data): ${input}`,
        maxOutputTokens: Math.min(task.primaryModel.outputTokenLimit, 1024),
        outputSchema: 'weekly-summary',
      });
      const actual = price
        ? (BigInt(result.inputTokens + result.outputTokens) * price.inputMicroUsdPerM) / 1_000_000n
        : 0n;
      const latestDraft = await this.prisma.weeklySummaryDraftVersion.findFirst({
        where: { meetingId: meeting.id },
        orderBy: { version: 'desc' },
      });
      const draftVersion = (latestDraft?.version ?? 0) + 1;
      const encrypted = this.encryption.encrypt(
        JSON.stringify({
          summary: result.output.summary,
          highlights: result.output.highlights,
          generatedAt: this.clock.now().toISOString(),
        }),
        `weekly-summary:${meeting.id}:v${draftVersion}`,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.weeklySummaryDraftVersion.create({
          data: {
            meetingId: meeting.id,
            version: draftVersion,
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
            operationId,
            status: 'DRAFT',
          },
        });
        await tx.llmUsageLog.create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.WEEKLY_SUMMARY,
            studentId: meeting.meetingSeries.studentId,
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
            metadata: { meetingId: meeting.id, reflectionCount: reflections.length },
          },
        });
      });
      await settleBudget(this.prisma, operationId, actual, this.clock.now());
      return 'processed';
    } catch (error) {
      await releaseBudget(this.prisma, operationId);
      throw error;
    }
  }
}
