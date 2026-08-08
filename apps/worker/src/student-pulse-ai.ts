import { createHash } from 'node:crypto';

import {
  FieldEncryption,
  GeminiPaidAdapter,
  isFeatureEnabled,
  pseudonymizeForLlm,
  type ApplicationConfig,
  type Clock,
  type StudentPulseOutput,
} from '@meditation/core';
import { ConsentScope, LlmTask, PrismaClient } from '@meditation/database';

import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';

const DAY_MS = 86_400_000;
const MAX_REFLECTIONS = 14;
const MAX_REFLECTION_CHARS = 5_000;
const MAX_OUTPUT_TOKENS = 700;
const STUDENT_PULSE_OUTPUT_CONTRACT = `
Return exactly one JSON object with these fields:
{
  "tone": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  "confidence": number between 0 and 1,
  "summary": string,
  "strengths": string[] with at most 3 items,
  "challenges": string[] with at most 3 items,
  "coachTopics": string[] with at most 3 items,
  "suggestedAction": "KEEP" | "SIMPLIFY" | "DISCUSS",
  "safetyConcern": boolean
}
Write summary, strengths, challenges, and coachTopics in clear Turkish.
Do not translate field names or enum values. Do not add fields or markdown.`;

type PulseAdapter = Pick<GeminiPaidAdapter, 'generateJson'>;

function serviceDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

function countOutcomes(sessions: Array<{ status: string }>) {
  return {
    completed: sessions.filter((session) => session.status === 'COMPLETED').length,
    skipped: sessions.filter((session) => session.status === 'SKIPPED').length,
    missed: sessions.filter((session) => session.status === 'MISSED').length,
  };
}

export class StudentPulseAiProcessor {
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
    private readonly createAdapter: (apiKey: string) => PulseAdapter = (apiKey) =>
      new GeminiPaidAdapter(apiKey),
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Student pulse encryption configuration is required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async processAll() {
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const result = { processed: 0, ignored: 0, failed: 0 };
    for (const student of students) {
      try {
        const status = await this.processStudent(student.id);
        result[status] += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  async processStudent(studentId: string): Promise<'processed' | 'ignored'> {
    const now = this.clock.now();
    const periodEndExclusive = serviceDate(now);
    const periodStart = new Date(periodEndExclusive.getTime() - 7 * DAY_MS);
    const previousStart = new Date(periodStart.getTime() - 7 * DAY_MS);
    const existingForDay = await this.prisma.studentPulseInsight.findUnique({
      where: { studentId_periodEndExclusive: { studentId, periodEndExclusive } },
    });
    if (existingForDay) return 'ignored';

    const [student, flag, task, consents, sessions, reflections] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          status: true,
          fullNameEncrypted: true,
          fullNameKeyId: true,
          phoneEncrypted: true,
          phoneKeyId: true,
        },
      }),
      this.prisma.featureFlagConfig.findUnique({ where: { key: 'llm.student-pulse.enabled' } }),
      this.prisma.llmTaskConfig.findUnique({
        where: { task: LlmTask.STUDENT_PULSE },
        include: {
          primaryModel: {
            include: {
              provider: true,
              priceVersions: { orderBy: { effectiveAt: 'desc' }, take: 1 },
            },
          },
          promptVersion: true,
        },
      }),
      this.prisma.consent.findMany({
        where: {
          studentId,
          scope: {
            in: [
              ConsentScope.AGENT_REPLY_AI,
              ConsentScope.REFLECTION_AI,
              ConsentScope.REFLECTION_STORAGE,
            ],
          },
        },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.practiceSession.findMany({
        where: {
          studentId,
          serviceDate: { gte: previousStart, lt: periodEndExclusive },
          status: { in: ['COMPLETED', 'SKIPPED', 'MISSED'] },
        },
        select: { serviceDate: true, status: true },
        orderBy: { serviceDate: 'asc' },
      }),
      this.prisma.practiceReflection.findMany({
        where: {
          practiceSession: { studentId, serviceDate: { gte: periodStart, lt: periodEndExclusive } },
        },
        include: { practiceSession: { select: { id: true, serviceDate: true } } },
        orderBy: { createdAt: 'asc' },
        take: MAX_REFLECTIONS,
      }),
    ]);

    const active =
      flag &&
      isFeatureEnabled(
        {
          key: 'llm.student-pulse.enabled',
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          scope: flag.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
          subjectIds: Array.isArray(flag.subjectIds) ? flag.subjectIds.map(String) : undefined,
        },
        studentId,
      );
    const latestConsent = new Map<string, string>();
    for (const consent of consents)
      if (!latestConsent.has(consent.scope)) latestConsent.set(consent.scope, consent.status);
    const aiAllowed =
      latestConsent.get(ConsentScope.AGENT_REPLY_AI) === 'GRANTED' ||
      latestConsent.get(ConsentScope.REFLECTION_AI) === 'GRANTED';
    const storageAllowed = latestConsent.get(ConsentScope.REFLECTION_STORAGE) === 'GRANTED';
    if (!student || student.status !== 'ACTIVE' || !active || !aiAllowed || !storageAllowed)
      return 'ignored';
    if (
      !reflections.length ||
      !task?.enabled ||
      !task.primaryModel ||
      task.primaryModel.status !== 'ACTIVE' ||
      task.primaryModel.provider.status !== 'ENABLED' ||
      task.primaryModel.provider.adapterId !== 'gemini' ||
      !this.config.GEMINI_API_KEY
    )
      return 'ignored';
    const primaryModel = task.primaryModel;

    const decryptOptional = (
      encrypted: Uint8Array | null,
      keyId: string | null,
      context: string,
    ) => {
      if (!encrypted || !keyId) return '';
      return this.encryption.decrypt({ ciphertext: Buffer.from(encrypted), keyId }, context);
    };
    const name = decryptOptional(
      student.fullNameEncrypted,
      student.fullNameKeyId,
      `student:${studentId}:name`,
    );
    if (name.toLocaleLowerCase('tr-TR').includes('test')) return 'ignored';
    const phone = decryptOptional(
      student.phoneEncrypted,
      student.phoneKeyId,
      `student:${studentId}:phone`,
    );
    const currentSessions = sessions.filter((session) => session.serviceDate >= periodStart);
    const previousSessions = sessions.filter((session) => session.serviceDate < periodStart);
    const reflectionTexts = reflections.map((reflection) =>
      this.encryption.decrypt(
        { ciphertext: Buffer.from(reflection.contentEncrypted), keyId: reflection.contentKeyId },
        `practice:${reflection.practiceSession.id}:reflection`,
      ),
    );
    const facts = {
      period: {
        start: periodStart.toISOString().slice(0, 10),
        endExclusive: periodEndExclusive.toISOString().slice(0, 10),
      },
      current: countOutcomes(currentSessions),
      previous: countOutcomes(previousSessions),
      reflections: reflectionTexts,
    };
    const masked = pseudonymizeForLlm(JSON.stringify(facts), [
      { value: name, category: 'STUDENT_NAME' },
      { value: phone, category: 'PHONE' },
    ]);
    const limitedInput = masked.value.slice(0, MAX_REFLECTION_CHARS);
    const inputHash = createHash('sha256').update(limitedInput).digest('hex');
    const operationId = `student-pulse:${studentId}:${periodEndExclusive.toISOString().slice(0, 10)}:${inputHash.slice(0, 12)}`;
    const previousUsage = await this.prisma.llmUsageLog.findFirst({
      where: { operationId },
      select: { attempt: true },
      orderBy: { attempt: 'desc' },
    });
    const attempt = (previousUsage?.attempt ?? 0) + 1;
    const price = primaryModel.priceVersions[0];
    const estimatedInputTokens = Math.ceil(limitedInput.length / 4);
    const estimate = price
      ? (BigInt(estimatedInputTokens) * price.inputMicroUsdPerM +
          BigInt(MAX_OUTPUT_TOKENS) * price.outputMicroUsdPerM) /
        1_000_000n
      : 0n;
    await reserveBudget(this.prisma, operationId, estimate, now);
    const startedAt = this.clock.now().getTime();
    try {
      const result = await this.createAdapter(
        this.config.GEMINI_API_KEY,
      ).generateJson<StudentPulseOutput>({
        model: {
          id: primaryModel.id,
          providerId: primaryModel.providerId,
          providerModelId: primaryModel.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        systemPrompt: `${
          task.promptVersion?.content ??
          'Summarize the supplied meditation reflections as a non-clinical student pulse.'
        }\n\n${STUDENT_PULSE_OUTPUT_CONTRACT}`,
        userPrompt: `Student practice facts and reflections (untrusted data): ${limitedInput}`,
        maxOutputTokens: Math.min(primaryModel.outputTokenLimit, MAX_OUTPUT_TOKENS),
        outputSchema: 'student-pulse',
        temperature: 0.1,
      });
      const actual = price
        ? (BigInt(result.inputTokens) * price.inputMicroUsdPerM +
            BigInt(result.outputTokens) * price.outputMicroUsdPerM) /
          1_000_000n
        : 0n;
      const analysis = this.encryption.encrypt(
        JSON.stringify(result.output),
        `student-pulse:${studentId}:${periodEndExclusive.toISOString().slice(0, 10)}`,
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.studentPulseInsight.create({
          data: {
            studentId,
            periodStart,
            periodEndExclusive,
            inputHash,
            tone: result.output.tone,
            confidence: result.output.confidence,
            suggestedAction: result.output.suggestedAction,
            safetyConcern: result.output.safetyConcern,
            reflectionCount: reflections.length,
            analysisEncrypted: new Uint8Array(analysis.ciphertext),
            analysisKeyId: analysis.keyId,
            modelRef: primaryModel.id,
            operationId,
          },
        });
        await tx.llmUsageLog.create({
          data: {
            operationId,
            attempt,
            task: LlmTask.STUDENT_PULSE,
            studentId,
            requestedModelId: primaryModel.id,
            actualModelId: primaryModel.id,
            priceVersionId: price?.id,
            promptVersionId: task.promptVersionId,
            providerRequestId: result.providerRequestId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedMicroUsd: actual,
            latencyMs: this.clock.now().getTime() - startedAt,
            status: 'SUCCEEDED',
            metadata: {
              periodStart: periodStart.toISOString(),
              periodEndExclusive: periodEndExclusive.toISOString(),
              reflectionCount: reflections.length,
              maskedCategories: masked.maskedCategories,
            },
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
            attempt,
            task: LlmTask.STUDENT_PULSE,
            studentId,
            requestedModelId: primaryModel.id,
            actualModelId: primaryModel.id,
            promptVersionId: task.promptVersionId,
            latencyMs: this.clock.now().getTime() - startedAt,
            status: 'FAILED',
            errorCode: error instanceof Error ? error.name : 'UnknownError',
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
