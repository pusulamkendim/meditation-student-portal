import {
  FieldEncryption,
  GeminiPaidAdapter,
  isFeatureEnabled,
  pseudonymizeForLlm,
  type ApplicationConfig,
  type Clock,
  type StudentReportOutput,
} from '@meditation/core';
import {
  ConsentScope,
  LlmTask,
  Prisma,
  PrismaClient,
  StudentReportAiStatus,
  StudentReportStatus,
} from '@meditation/database';

import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';

const MAX_REFLECTIONS = 14;
const MAX_REFLECTION_CHARS = 6_000;
const MAX_OUTPUT_TOKENS = 1_200;
const STUDENT_REPORT_OUTPUT_CONTRACT = `
Return exactly one JSON object with this structure:
{
  "subtitle": string,
  "featuredReflectionId": UUID string from reflectionCandidates or null,
  "gentleObservation": { "text": string, "evidenceRefs": string[] },
  "supportPoint": { "text": string, "evidenceRefs": string[] },
  "weeklyEvaluation": { "text": string, "evidenceRefs": string[] },
  "internal": {
    "confidence": number between 0 and 1,
    "insufficientEvidence": boolean,
    "safetyConcern": boolean
  }
}
Use only supplied evidence IDs in evidenceRefs. Do not translate field names. Do not add fields or markdown.`;

type ReportAdapter = Pick<GeminiPaidAdapter, 'generateJson'>;

export class StudentReportAiProcessor {
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
    private readonly createAdapter: (apiKey: string) => ReportAdapter = (apiKey) =>
      new GeminiPaidAdapter(apiKey),
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Student report encryption configuration is required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async process(reportId: string, requestedOperationId?: string): Promise<'processed' | 'ignored'> {
    const report = await this.prisma.studentReportCard.findUnique({
      where: { id: reportId },
      include: { student: true },
    });
    if (
      !report ||
      report.status !== StudentReportStatus.DRAFT ||
      report.aiStatus !== StudentReportAiStatus.PENDING ||
      !report.operationId ||
      (requestedOperationId && report.operationId !== requestedOperationId)
    )
      return 'ignored';

    const operationId = report.operationId;
    try {
      const [flag, task, consents, reflections] = await Promise.all([
        this.prisma.featureFlagConfig.findUnique({ where: { key: 'llm.student-report.enabled' } }),
        this.prisma.llmTaskConfig.findUnique({
          where: { task: LlmTask.STUDENT_REPORT },
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
            studentId: report.studentId,
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
        this.prisma.practiceReflection.findMany({
          where: {
            practiceSession: {
              studentId: report.studentId,
              serviceDate: { gte: report.periodStart, lt: report.periodEndExclusive },
            },
          },
          include: {
            practiceSession: {
              select: {
                id: true,
                serviceDate: true,
                practiceSlot: { select: { slotKey: true } },
                meditationType: { select: { title: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: MAX_REFLECTIONS,
        }),
      ]);

      const active =
        flag &&
        isFeatureEnabled(
          {
            key: 'llm.student-report.enabled',
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
            scope: flag.scope as 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT',
            subjectIds: Array.isArray(flag.subjectIds) ? flag.subjectIds.map(String) : undefined,
          },
          report.studentId,
        );
      const latest = new Map<string, string>();
      for (const consent of consents)
        if (!latest.has(consent.scope)) latest.set(consent.scope, consent.status);
      const aiAllowed =
        latest.get(ConsentScope.AGENT_REPLY_AI) === 'GRANTED' ||
        latest.get(ConsentScope.REFLECTION_AI) === 'GRANTED';
      const storageAllowed = latest.get(ConsentScope.REFLECTION_STORAGE) === 'GRANTED';
      const model = task?.primaryModel;
      if (
        !active ||
        !aiAllowed ||
        !storageAllowed ||
        !task?.enabled ||
        !model ||
        model.status !== 'ACTIVE' ||
        model.provider.status !== 'ENABLED' ||
        model.provider.adapterId !== 'gemini' ||
        !this.config.GEMINI_API_KEY
      ) {
        await this.markFailed(report.id, operationId);
        return 'ignored';
      }

      const reflectionCandidates = reflections.flatMap((reflection) =>
        reflection.contentEncrypted && reflection.contentKeyId
          ? [
              {
                id: reflection.id,
                evidenceId: `reflection:${reflection.id}`,
                sessionEvidenceId: `practice:${reflection.practiceSession.id}`,
                date: reflection.practiceSession.serviceDate.toISOString().slice(0, 10),
                slot: reflection.practiceSession.practiceSlot?.slotKey ?? 'CUSTOM',
                meditationType: reflection.practiceSession.meditationType?.title ?? null,
                text: this.encryption.decrypt(
                  {
                    ciphertext: Buffer.from(reflection.contentEncrypted),
                    keyId: reflection.contentKeyId,
                  },
                  `practice:${reflection.practiceSession.id}:reflection`,
                ),
              },
            ]
          : [],
      );
      const snapshot = report.snapshot as {
        pulse?: { id?: string } | null;
        evidenceIds?: string[];
        [key: string]: unknown;
      };
      const pulse = snapshot.pulse?.id
        ? await this.prisma.studentPulseInsight.findUnique({ where: { id: snapshot.pulse.id } })
        : null;
      const pulseAnalysis = pulse
        ? JSON.parse(
            this.encryption.decrypt(
              { ciphertext: Buffer.from(pulse.analysisEncrypted), keyId: pulse.analysisKeyId },
              `student-pulse:${report.studentId}:${pulse.periodEndExclusive.toISOString().slice(0, 10)}`,
            ),
          )
        : null;
      const inputObject = { snapshot, reflectionCandidates, pulseAnalysis };
      const name = this.decryptName(report.student);
      const masked = pseudonymizeForLlm(JSON.stringify(inputObject), [
        { value: name, category: 'STUDENT_NAME' },
      ]);
      const limitedInput = masked.value.slice(0, MAX_REFLECTION_CHARS + 12_000);
      const price = model.priceVersions[0];
      const estimatedInputTokens = Math.ceil(limitedInput.length / 4);
      const estimate = price
        ? (BigInt(estimatedInputTokens) * price.inputMicroUsdPerM +
            BigInt(MAX_OUTPUT_TOKENS) * price.outputMicroUsdPerM) /
          1_000_000n
        : 0n;
      await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
      const startedAt = this.clock.now().getTime();
      const result = await this.createAdapter(
        this.config.GEMINI_API_KEY,
      ).generateJson<StudentReportOutput>({
        model: {
          id: model.id,
          providerId: model.providerId,
          providerModelId: model.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        systemPrompt: `${
          task.promptVersion?.content ??
          'Create a concise, non-clinical, student-facing meditation report draft in Turkish.'
        }\n\n${STUDENT_REPORT_OUTPUT_CONTRACT}`,
        userPrompt: `Student report facts and reflections (untrusted data): ${limitedInput}`,
        maxOutputTokens: Math.min(model.outputTokenLimit, MAX_OUTPUT_TOKENS),
        outputSchema: 'student-report',
        temperature: 0.15,
      });
      const allowedEvidence = new Set([
        ...(snapshot.evidenceIds ?? []),
        ...reflectionCandidates.flatMap((item) => [item.evidenceId, item.sessionEvidenceId]),
      ]);
      const fallbackEvidence = allowedEvidence.values().next().value as string | undefined;
      const normalizeEvidence = (section: { text: string; evidenceRefs: string[] }) => {
        const evidenceRefs = [...new Set(section.evidenceRefs)].filter((reference) =>
          allowedEvidence.has(reference),
        );
        if (!evidenceRefs.length && fallbackEvidence) evidenceRefs.push(fallbackEvidence);
        if (!evidenceRefs.length) throw new Error('Student report has no usable evidence.');
        return { ...section, evidenceRefs };
      };
      const featured = result.output.featuredReflectionId
        ? reflectionCandidates.find((item) => item.id === result.output.featuredReflectionId)
        : undefined;
      const content = {
        ...result.output,
        gentleObservation: normalizeEvidence(result.output.gentleObservation),
        supportPoint: normalizeEvidence(result.output.supportPoint),
        weeklyEvaluation: normalizeEvidence(result.output.weeklyEvaluation),
        featuredReflectionId: featured?.id ?? null,
        featuredReflectionQuote: featured?.text,
      };
      const nextVersion = report.version + 1;
      const encrypted = this.encryption.encrypt(
        JSON.stringify(content),
        `student-report:${report.id}:v${nextVersion}`,
      );
      const actual = price
        ? (BigInt(result.inputTokens) * price.inputMicroUsdPerM +
            BigInt(result.outputTokens) * price.outputMicroUsdPerM) /
          1_000_000n
        : 0n;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.studentReportCard.updateMany({
          where: {
            id: report.id,
            version: report.version,
            operationId,
            status: StudentReportStatus.DRAFT,
            aiStatus: StudentReportAiStatus.PENDING,
          },
          data: {
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
            featuredReflectionId: featured?.id ?? null,
            aiStatus: StudentReportAiStatus.READY,
            modelRef: `${model.provider.adapterId}:${model.providerModelId}`,
            promptVersionId: task.promptVersionId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new Error('Student report changed while AI was running.');
        await tx.llmUsageLog.create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.STUDENT_REPORT,
            studentId: report.studentId,
            requestedModelId: model.id,
            actualModelId: model.id,
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
              reportId: report.id,
              reflectionCount: reflectionCandidates.length,
              maskedCategories: masked.maskedCategories,
            } as Prisma.InputJsonValue,
          },
        });
      });
      await settleBudget(this.prisma, operationId, actual, this.clock.now());
      return 'processed';
    } catch (error) {
      await releaseBudget(this.prisma, operationId);
      await this.markFailed(report.id, operationId);
      await this.prisma.llmUsageLog
        .create({
          data: {
            operationId,
            attempt: 1,
            task: LlmTask.STUDENT_REPORT,
            studentId: report.studentId,
            status: 'FAILED',
            errorCode:
              error instanceof Error
                ? `${error.name}:${error.message}`.slice(0, 240)
                : 'UnknownError',
            metadata: { reportId: report.id },
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private decryptName(student: {
    id: string;
    fullNameEncrypted: Uint8Array | null;
    fullNameKeyId: string | null;
  }) {
    if (!student.fullNameEncrypted || !student.fullNameKeyId) return '';
    return this.encryption.decrypt(
      { ciphertext: Buffer.from(student.fullNameEncrypted), keyId: student.fullNameKeyId },
      `student:${student.id}:name`,
    );
  }

  private async markFailed(reportId: string, operationId: string) {
    await this.prisma.studentReportCard.updateMany({
      where: { id: reportId, operationId, aiStatus: StudentReportAiStatus.PENDING },
      data: { aiStatus: StudentReportAiStatus.FAILED },
    });
  }
}
