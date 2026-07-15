import {
  FieldEncryption,
  GeminiPaidAdapter,
  inboundIntentOutputSchema,
  pseudonymizeForLlm,
  sha256,
  type ApplicationConfig,
  type Clock,
  type InboundIntentOutput,
  type LlmModelCandidate,
  type StudentContextSection,
} from '@meditation/core';
import {
  ConsentScope,
  ConsentStatus,
  LlmTask,
  PrismaClient,
  type Prisma,
} from '@meditation/database';
import { ConversationContextResolver } from './conversation-context.js';
import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';

const DEFAULT_PROMPT = `Classify the current Turkish student message. Return JSON only with domain, action, confidence, source. Never answer the student. Current message overrides stale context when it clearly changes topic.`;

export type IntentRoutingDecision = InboundIntentOutput & {
  id: string;
  inboxEventId: string;
  studentId: string;
};

export type IntentClassificationResult =
  { status: 'classified'; decision: IntentRoutingDecision } | { status: 'not-eligible' | 'failed' };

export function sectionForIntentDomain(
  domain: InboundIntentOutput['domain'],
): StudentContextSection | null {
  if (domain === 'PRACTICE') return 'PRACTICE';
  if (domain === 'MEETING') return 'MEETINGS';
  if (domain === 'PAYMENT') return 'PAYMENT';
  if (domain === 'MEMBERSHIP') return 'MEMBERSHIP';
  if (domain === 'ACCOUNT') return 'ACCOUNT';
  return null;
}

function estimateMicroUsd(
  inputTokens: number,
  outputTokens: number,
  inputRate: bigint,
  outputRate: bigint,
): bigint {
  return (BigInt(inputTokens) * inputRate + BigInt(outputTokens) * outputRate) / 1_000_000n;
}

export class InboundIntentClassifier {
  private readonly encryption: FieldEncryption;
  private readonly conversationContext: ConversationContextResolver;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Intent classifier encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.conversationContext = new ConversationContextResolver(prisma, clock);
  }

  async classify(inboxEventId: string): Promise<IntentClassificationResult> {
    const existing = await this.prisma.inboundIntentDecision.findUnique({
      where: { inboxEventId },
    });
    if (existing)
      return existing.status === 'FAILED'
        ? { status: 'failed' }
        : {
            status: 'classified',
            decision: {
              id: existing.id,
              inboxEventId,
              studentId: existing.studentId,
              ...inboundIntentOutputSchema.parse({
                domain: existing.domain,
                action: existing.action,
                confidence: existing.confidence,
                source: existing.contextSource,
              }),
            },
          };

    const inbox = await this.prisma.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
    if (inbox.processedAt) return { status: 'not-eligible' };
    const normalized = inbox.normalizedData as Record<string, unknown>;
    if (
      typeof normalized.contentEncrypted !== 'string' ||
      typeof normalized.contentKeyId !== 'string' ||
      typeof normalized.senderHmac !== 'string' ||
      typeof normalized.accountExternalId !== 'string'
    )
      return { status: 'not-eligible' };
    const identity = await this.prisma.studentChannelIdentity.findFirst({
      where: {
        externalUserHmac: normalized.senderHmac,
        status: 'ACTIVE',
        channelAccount: { type: inbox.channel, externalId: normalized.accountExternalId },
      },
      include: { student: true },
    });
    if (!identity || identity.student.status !== 'ACTIVE') return { status: 'not-eligible' };
    const consent = await this.prisma.consent.findFirst({
      where: { studentId: identity.studentId, scope: ConsentScope.AGENT_REPLY_AI },
      orderBy: { occurredAt: 'desc' },
    });
    if (consent?.status !== ConsentStatus.GRANTED) return { status: 'not-eligible' };
    if (!this.config.GEMINI_API_KEY) return this.persistFailure(inboxEventId, identity.studentId);

    const current = this.encryption.decrypt(
      {
        ciphertext: Buffer.from(normalized.contentEncrypted, 'base64'),
        keyId: normalized.contentKeyId,
      },
      inbox.dedupeKey,
    );
    const studentName =
      identity.student.fullNameEncrypted && identity.student.fullNameKeyId
        ? this.encryption.decrypt(
            {
              ciphertext: Buffer.from(identity.student.fullNameEncrypted),
              keyId: identity.student.fullNameKeyId,
            },
            `student:${identity.studentId}:name`,
          )
        : '';
    const maskedCurrent = pseudonymizeForLlm(
      current.slice(0, 400),
      studentName ? [{ value: studentName, category: 'STUDENT' }] : [],
    );
    const sourceMessageId = await this.ensureInboundMessage(
      inbox,
      identity.studentId,
      identity.id,
      normalized,
      current,
    );
    const activeContext = await this.conversationContext.resolve({
      inboxEventId,
      inboundMessageId: sourceMessageId,
      studentId: identity.studentId,
      channelIdentityId: identity.id,
      repliedToExternalMessageId:
        typeof normalized.repliedToExternalMessageId === 'string'
          ? normalized.repliedToExternalMessageId
          : undefined,
    });
    const history = await this.readRecentMessages(identity.studentId, sourceMessageId, studentName);
    const state = await this.readState(identity.studentId, identity.student.registrationStep);
    const compactContext = {
      m: maskedCurrent.value,
      reply: activeContext?.method === 'EXPLICIT_REPLY' ? activeContext.eventKey : null,
      event: activeContext?.eventKey ?? null,
      history,
      state,
    };
    const taskConfig = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.INBOUND_INTENT },
      include: {
        primaryModel: {
          include: {
            provider: true,
            priceVersions: {
              where: { effectiveAt: { lte: this.clock.now() } },
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
        fallbackModel: {
          include: {
            provider: true,
            priceVersions: {
              where: { effectiveAt: { lte: this.clock.now() } },
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        },
        promptVersion: true,
      },
    });
    if (
      !taskConfig?.enabled ||
      !taskConfig.primaryModel ||
      taskConfig.primaryModel.status !== 'ACTIVE' ||
      taskConfig.primaryModel.provider.status !== 'ENABLED' ||
      taskConfig.primaryModel.priceVersions.length === 0
    )
      return this.persistFailure(inboxEventId, identity.studentId);

    const operationId = `intent:${inboxEventId}`;
    const primary = this.modelCandidate(taskConfig.primaryModel);
    const fallback =
      taskConfig.fallbackModel?.status === 'ACTIVE' &&
      taskConfig.fallbackModel.provider.status === 'ENABLED' &&
      taskConfig.fallbackModel.priceVersions.length
        ? this.modelCandidate(taskConfig.fallbackModel)
        : null;
    const candidates = [
      { model: primary, fallbackUsed: false, price: taskConfig.primaryModel.priceVersions[0]! },
      ...(fallback
        ? [
            {
              model: fallback,
              fallbackUsed: true,
              price: taskConfig.fallbackModel!.priceVersions[0]!,
            },
          ]
        : []),
    ];
    const estimate = estimateMicroUsd(
      625,
      64,
      taskConfig.primaryModel.priceVersions[0]!.inputMicroUsdPerM,
      taskConfig.primaryModel.priceVersions[0]!.outputMicroUsdPerM,
    );
    try {
      await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const startedAt = this.clock.now().getTime();
        try {
          const result = await new GeminiPaidAdapter(
            this.config.GEMINI_API_KEY,
          ).generateJson<InboundIntentOutput>({
            model: candidate.model,
            operationId,
            systemPrompt: taskConfig.promptVersion?.content ?? DEFAULT_PROMPT,
            userPrompt: JSON.stringify(compactContext),
            maxOutputTokens: 64,
            temperature: 0,
            outputSchema: 'inbound-intent',
          });
          const output = inboundIntentOutputSchema.parse(result.output);
          const actual = estimateMicroUsd(
            result.inputTokens,
            result.outputTokens,
            candidate.price.inputMicroUsdPerM,
            candidate.price.outputMicroUsdPerM,
          );
          await this.recordUsage({
            operationId,
            attempt: index + 1,
            studentId: identity.studentId,
            sourceMessageId,
            requestedModelId: primary.id,
            actualModelId: candidate.model.id,
            priceVersionId: candidate.price.id,
            promptVersionId: taskConfig.promptVersionId,
            providerRequestId: result.providerRequestId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedMicroUsd: actual,
            latencyMs: this.clock.now().getTime() - startedAt,
            status: 'SUCCEEDED',
            fallbackUsed: candidate.fallbackUsed,
            metadata: {
              inboxEventId,
              historyCount: history.length,
              contextHash: sha256(JSON.stringify(compactContext)),
            },
          });
          await settleBudget(this.prisma, operationId, actual, this.clock.now());
          const decision = await this.prisma.inboundIntentDecision.create({
            data: {
              inboxEventId,
              studentId: identity.studentId,
              operationId,
              domain: output.domain,
              action: output.action,
              confidence: output.confidence,
              contextSource: output.source,
              contextSnapshot: {
                eventKey: activeContext?.eventKey ?? null,
                historyCount: history.length,
                state,
                contextHash: sha256(JSON.stringify(compactContext)),
              },
            },
          });
          return {
            status: 'classified',
            decision: { id: decision.id, inboxEventId, studentId: identity.studentId, ...output },
          };
        } catch (error) {
          await this.recordUsage({
            operationId,
            attempt: index + 1,
            studentId: identity.studentId,
            sourceMessageId,
            requestedModelId: primary.id,
            actualModelId: candidate.model.id,
            promptVersionId: taskConfig.promptVersionId,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedMicroUsd: 0n,
            latencyMs: this.clock.now().getTime() - startedAt,
            status: 'FAILED',
            fallbackUsed: candidate.fallbackUsed,
            errorCode: error instanceof Error ? error.name : 'UNKNOWN',
            metadata: { inboxEventId },
          });
        }
      }
    } catch {
      // Fail closed below without applying a state-changing intent.
    }
    await releaseBudget(this.prisma, operationId);
    return this.persistFailure(inboxEventId, identity.studentId, operationId);
  }

  private modelCandidate(model: {
    id: string;
    providerId: string;
    providerModelId: string;
  }): LlmModelCandidate {
    return {
      id: model.id,
      providerId: model.providerId,
      providerModelId: model.providerModelId,
      status: 'ACTIVE',
    };
  }

  private async readState(studentId: string, registrationStep: string) {
    const [awaiting, reflection, subscription] = await Promise.all([
      this.prisma.practiceSession.count({ where: { studentId, status: 'AWAITING_RESPONSE' } }),
      this.prisma.practiceSession.count({
        where: { studentId, status: 'COMPLETED', reflection: { is: null } },
      }),
      this.prisma.subscriptionPeriod.count({ where: { studentId, status: 'ACTIVE' } }),
    ]);
    return [
      `REGISTRATION_${registrationStep}`,
      subscription ? 'MEMBERSHIP_ACTIVE' : 'MEMBERSHIP_INACTIVE',
      ...(awaiting ? ['PRACTICE_AWAITING'] : []),
      ...(reflection ? ['REFLECTION_AVAILABLE'] : []),
    ];
  }

  private async readRecentMessages(
    studentId: string,
    sourceMessageId: string,
    studentName: string,
  ) {
    const rows = await this.prisma.message.findMany({
      where: { studentId, id: { not: sourceMessageId } },
      orderBy: { occurredAt: 'desc' },
      take: 4,
      include: { messageIntent: true },
    });
    return rows.reverse().flatMap((row) => {
      const payload = row.messageIntent?.payload as Record<string, unknown> | undefined;
      const eventKey = typeof payload?.eventKey === 'string' ? payload.eventKey : undefined;
      if (row.direction === 'OUTBOUND' && eventKey) return [['O', eventKey]];
      const associated = row.inboxEventId ?? row.externalMessageId;
      if (!associated || !row.contentEncrypted || !row.contentKeyId) return [];
      try {
        const content = this.encryption.decrypt(
          { ciphertext: Buffer.from(row.contentEncrypted), keyId: row.contentKeyId },
          `message:${associated}`,
        );
        return [
          [
            row.direction === 'INBOUND' ? 'I' : 'O',
            pseudonymizeForLlm(
              content.slice(0, 200),
              studentName ? [{ value: studentName, category: 'STUDENT' }] : [],
            ).value,
          ],
        ];
      } catch {
        return [];
      }
    });
  }

  private async ensureInboundMessage(
    inbox: { id: string; createdAt: Date; dedupeKey: string },
    studentId: string,
    channelIdentityId: string,
    normalized: Record<string, unknown>,
    content: string,
  ) {
    const existing = await this.prisma.message.findUnique({ where: { inboxEventId: inbox.id } });
    if (existing) return existing.id;
    const encrypted = this.encryption.encrypt(content, `message:${inbox.id}`);
    const message = await this.prisma.message.create({
      data: {
        studentId,
        channelIdentityId,
        direction: 'INBOUND',
        status: 'RECEIVED',
        externalMessageId:
          typeof normalized.externalMessageId === 'string' ? normalized.externalMessageId : null,
        contentEncrypted: new Uint8Array(encrypted.ciphertext),
        contentKeyId: encrypted.keyId,
        occurredAt: inbox.createdAt,
        inboxEventId: inbox.id,
      },
    });
    await this.prisma.inboxEvent.update({ where: { id: inbox.id }, data: { studentId } });
    return message.id;
  }

  private async recordUsage(data: Omit<Prisma.LlmUsageLogUncheckedCreateInput, 'task'>) {
    await this.prisma.llmUsageLog.upsert({
      where: { operationId_attempt: { operationId: data.operationId, attempt: data.attempt } },
      create: { ...data, task: LlmTask.INBOUND_INTENT },
      update: {},
    });
  }

  private async persistFailure(
    inboxEventId: string,
    studentId: string,
    operationId = `intent:${inboxEventId}`,
  ) {
    await this.prisma.inboundIntentDecision.upsert({
      where: { inboxEventId },
      create: {
        inboxEventId,
        studentId,
        operationId,
        domain: 'GENERAL',
        action: 'UNKNOWN',
        confidence: 0,
        contextSource: 'CURRENT',
        contextSnapshot: {},
        status: 'FAILED',
      },
      update: {},
    });
    return { status: 'failed' as const };
  }
}
