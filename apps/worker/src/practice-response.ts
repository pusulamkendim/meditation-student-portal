import {
  FieldEncryption,
  LookupHmac,
  endOfLocalServiceDate,
  parsePracticeResponsePayload,
  renderMessageTemplate,
  resolveMessageVariant,
  type SystemEventKey,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  ConsentScope,
  ConsentStatus,
  MessageIntentStatus,
  PracticeSessionStatus,
  PrismaClient,
  StandardMessageVersionStatus,
  type Prisma,
} from '@meditation/database';

async function createResponseIntent(
  tx: Prisma.TransactionClient,
  now: Date,
  input: {
    eventKey: SystemEventKey;
    studentId: string;
    channelIdentityId: string;
    locale: string;
    stage: string;
    aggregateVersion: number;
    idempotencyKey: string;
    variables: Record<string, string>;
  },
) {
  const versions = await tx.standardMessageVersion.findMany({
    where: {
      status: StandardMessageVersionStatus.PUBLISHED,
      effectiveAt: { lte: now },
      variant: {
        standardMessage: { eventKey: input.eventKey, audience: 'STUDENT' },
      },
    },
    include: { variant: true },
  });
  const variant = resolveMessageVariant(
    versions.map((version) => ({
      ...version,
      locale: version.variant.locale,
      stage: version.variant.curriculumStage,
      slot: version.variant.slot,
      priority: version.variant.priority,
      requiresStudentName: version.variant.requiresStudentName,
      effectiveAt: version.effectiveAt!,
    })),
    { locale: input.locale, stage: input.stage, hasStudentName: false },
  );
  if (!variant) return;
  const occurrence = await tx.systemEventOccurrence.create({
    data: {
      eventKey: input.eventKey,
      studentId: input.studentId,
      idempotencyKey: input.idempotencyKey,
      variables: input.variables,
      occurredAt: now,
    },
  });
  const intent = await tx.messageIntent.create({
    data: {
      studentId: input.studentId,
      channelIdentityId: input.channelIdentityId,
      category: 'SYSTEM_STANDARD_MESSAGE',
      status: MessageIntentStatus.PENDING,
      idempotencyKey: `system-event:${occurrence.id}`,
      dueAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
      aggregateVersion: input.aggregateVersion,
      payload: {
        eventKey: input.eventKey,
        standardMessageVersionId: variant.id,
        rendered: renderMessageTemplate(input.eventKey, variant.content, input.variables),
        locale: variant.variant.locale,
      },
    },
  });
  await tx.outboxEvent.create({
    data: {
      topic: 'message.intents',
      aggregateType: 'MessageIntent',
      aggregateId: intent.id,
      eventType: 'MessageIntentCreated',
      payload: { intentId: intent.id },
    },
  });
  return intent.id;
}

export function parseTypedPracticeResponse(content: string): 'COMPLETED' | 'SKIPPED' | undefined {
  const normalized = content
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i');
  return normalized === 'yaptim' ? 'COMPLETED' : normalized === 'yapamadim' ? 'SKIPPED' : undefined;
}

export async function processPracticeResponse(
  prisma: PrismaClient,
  clock: Clock,
  config: ApplicationConfig,
  inboxEventId: string,
  classifiedResponse?: 'COMPLETED' | 'SKIPPED' | 'REFLECT',
  agentReflection?: {
    answer: string;
    tags: Array<{ tag: string; confidence: number }>;
    operationId: string;
    modelRef: string;
  },
): Promise<boolean> {
  if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
    throw new Error('Practice response encryption configuration is required.');
  const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
  const encryption = new FieldEncryption(
    new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
    config.ACTIVE_DATA_KEY_ID,
  );
  const lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  const inbox = await prisma.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
  const normalized = inbox.normalizedData as Record<string, unknown>;
  if (
    typeof normalized.contentEncrypted !== 'string' ||
    typeof normalized.contentKeyId !== 'string' ||
    typeof normalized.senderHmac !== 'string' ||
    typeof normalized.accountExternalId !== 'string'
  )
    return false;
  const content = encryption.decrypt(
    {
      ciphertext: Buffer.from(normalized.contentEncrypted, 'base64'),
      keyId: normalized.contentKeyId,
    },
    inbox.dedupeKey,
  );
  const parsedPayload = parsePracticeResponsePayload(content);
  const typedResponse = parseTypedPracticeResponse(content);
  const identity = await prisma.studentChannelIdentity.findFirst({
    where: {
      externalUserHmac: normalized.senderHmac,
      channelAccount: { type: inbox.channel, externalId: normalized.accountExternalId },
    },
  });
  if (!identity) return false;
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const resolvedContext = parsedPayload
      ? null
      : await tx.conversationContextResolution.findUnique({
          where: { inboxEventId: inbox.id },
          select: { entityType: true, entityId: true },
        });
    const contextualSessionId =
      resolvedContext?.entityType === 'PracticeSession' ? resolvedContext.entityId : null;
    const session = await tx.practiceSession.findFirst({
      where: parsedPayload
        ? { id: parsedPayload.sessionId }
        : contextualSessionId
          ? { id: contextualSessionId }
          : {
              studentId: identity.studentId,
              OR: [
                { status: PracticeSessionStatus.AWAITING_RESPONSE, startAt: { lte: now } },
                {
                  status: PracticeSessionStatus.COMPLETED,
                  updatedAt: { gte: new Date(now.getTime() - 60 * 60_000) },
                  reflection: { is: null },
                },
              ],
            },
      orderBy: parsedPayload ? undefined : { startAt: 'desc' },
      include: { student: true },
    });
    if (!session) return false;
    if (
      !parsedPayload &&
      session.status === PracticeSessionStatus.COMPLETED &&
      (!classifiedResponse || classifiedResponse === 'REFLECT')
    ) {
      const consent = await tx.consent.findFirst({
        where: { studentId: identity.studentId, scope: ConsentScope.REFLECTION_STORAGE },
        orderBy: { occurredAt: 'desc' },
      });
      if (consent?.status !== ConsentStatus.GRANTED) return false;
      const encryptedReflection = encryption.encrypt(
        content.trim(),
        `practice:${session.id}:reflection`,
      );
      const reflection = await tx.practiceReflection.create({
        data: {
          practiceSessionId: session.id,
          contentEncrypted: new Uint8Array(encryptedReflection.ciphertext),
          contentKeyId: encryptedReflection.keyId,
        },
      });
      if (agentReflection)
        await tx.reflectionTag.createMany({
          data: agentReflection.tags.map((tag) => ({
            reflectionId: reflection.id,
            tag: tag.tag,
            confidence: tag.confidence,
            taxonomyVersion: 'agent-reply-v1',
            operationId: agentReflection.operationId,
            modelRef: agentReflection.modelRef,
          })),
          skipDuplicates: true,
        });
      const existingMessage = await tx.message.findUnique({
        where: { inboxEventId: inbox.id },
        select: { id: true },
      });
      if (!existingMessage) {
        const messageContent = encryption.encrypt(content, `message:${inbox.id}`);
        await tx.message.create({
          data: {
            studentId: identity.studentId,
            channelIdentityId: identity.id,
            direction: 'INBOUND',
            status: 'RECEIVED',
            externalMessageId:
              typeof normalized.externalMessageId === 'string'
                ? normalized.externalMessageId
                : null,
            contentEncrypted: new Uint8Array(messageContent.ciphertext),
            contentKeyId: messageContent.keyId,
            occurredAt: inbox.createdAt,
            inboxEventId: inbox.id,
          },
        });
      }
      const intent = await tx.messageIntent.create({
        data: {
          studentId: identity.studentId,
          channelIdentityId: identity.id,
          category: 'AGENT_REPLY',
          status: MessageIntentStatus.PENDING,
          idempotencyKey: `agent:${inbox.id}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000),
          aggregateVersion: session.student.version,
          payload: {
            rendered:
              agentReflection?.answer ??
              'Bunu paylaştığın için teşekkür ederim. Necip ile görüşmenizde bunları değerlendireceğiz.',
            agent: true,
            reflection: true,
            reflectionId: reflection.id,
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: intent.id,
          eventType: 'MessageIntentCreated',
          payload: { intentId: intent.id },
        },
      });
      await tx.inboundResponseOwnership.create({
        data: { inboundMessageId: inbox.id, owner: 'AGENT_CONTEXTUAL', referenceId: intent.id },
      });
      await tx.inboxEvent.update({
        where: { id: inbox.id },
        data: { processedAt: now, studentId: identity.studentId },
      });
      return true;
    }
    const canSkipReminder =
      classifiedResponse === 'SKIPPED' &&
      !parsedPayload &&
      session.status === PracticeSessionStatus.REMINDED;
    if (
      session.studentId !== identity.studentId ||
      (session.status !== PracticeSessionStatus.AWAITING_RESPONSE && !canSkipReminder) ||
      (!canSkipReminder && !session.replyNonceHmac) ||
      (parsedPayload && !lookup.verify(parsedPayload.nonce, session.replyNonceHmac ?? '')) ||
      (!canSkipReminder && now < session.startAt) ||
      now >= endOfLocalServiceDate(session.serviceDate, session.student.timezone)
    )
      return false;
    const response =
      parsedPayload?.response ??
      (classifiedResponse === 'COMPLETED' || classifiedResponse === 'SKIPPED'
        ? classifiedResponse
        : typedResponse);
    if (!response) {
      const existingMessage = await tx.message.findUnique({
        where: { inboxEventId: inbox.id },
        select: { id: true },
      });
      if (!existingMessage) {
        const messageContent = encryption.encrypt(content, `message:${inbox.id}`);
        await tx.message.create({
          data: {
            studentId: identity.studentId,
            channelIdentityId: identity.id,
            direction: 'INBOUND',
            status: 'RECEIVED',
            externalMessageId:
              typeof normalized.externalMessageId === 'string'
                ? normalized.externalMessageId
                : null,
            contentEncrypted: new Uint8Array(messageContent.ciphertext),
            contentKeyId: messageContent.keyId,
            occurredAt: inbox.createdAt,
            inboxEventId: inbox.id,
          },
        });
      }
      const intentId = await createResponseIntent(tx, now, {
        eventKey: 'PRACTICE_RESPONSE_AMBIGUOUS',
        studentId: identity.studentId,
        channelIdentityId: identity.id,
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        aggregateVersion: session.student.version,
        idempotencyKey: `practice:${session.id}:ambiguous:${inbox.id}`,
        variables: {},
      });
      await tx.inboundResponseOwnership.create({
        data: {
          inboundMessageId: inbox.id,
          owner: intentId ? 'SYSTEM_STANDARD_MESSAGE' : 'NO_REPLY',
          referenceId: intentId,
        },
      });
      await tx.inboxEvent.update({
        where: { id: inbox.id },
        data: { processedAt: now, studentId: identity.studentId },
      });
      return true;
    }
    const changed = await tx.practiceSession.updateMany({
      where: {
        id: session.id,
        version: session.version,
        status: session.status,
      },
      data: { status: response, version: { increment: 1 } },
    });
    if (changed.count !== 1) return false;
    const existingMessage = await tx.message.findUnique({
      where: { inboxEventId: inbox.id },
      select: { id: true },
    });
    if (!existingMessage) {
      const messageContent = encryption.encrypt(content, `message:${inbox.id}`);
      await tx.message.create({
        data: {
          studentId: identity.studentId,
          channelIdentityId: identity.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          externalMessageId:
            typeof normalized.externalMessageId === 'string' ? normalized.externalMessageId : null,
          contentEncrypted: new Uint8Array(messageContent.ciphertext),
          contentKeyId: messageContent.keyId,
          occurredAt: inbox.createdAt,
          inboxEventId: inbox.id,
        },
      });
    }
    const next = await tx.practiceSession.findFirst({
      where: {
        studentId: identity.studentId,
        status: PracticeSessionStatus.SCHEDULED,
        startAt: { gt: now },
      },
      orderBy: { startAt: 'asc' },
    });
    const nextPracticeAtText = next
      ? `Bir sonraki pratiğin ${new Intl.DateTimeFormat('tr-TR', {
          timeZone: session.student.timezone,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(next.startAt)}.`
      : '';
    const acknowledgementIntentId = await createResponseIntent(tx, now, {
      eventKey: response === 'COMPLETED' ? 'PRACTICE_COMPLETED_ACK' : 'PRACTICE_SKIPPED_ACK',
      studentId: identity.studentId,
      channelIdentityId: identity.id,
      locale: session.student.preferredLocale,
      stage: session.student.curriculumStage,
      aggregateVersion: session.student.version,
      idempotencyKey: `practice:${session.id}:${response.toLowerCase()}-ack`,
      variables: { nextPracticeAtText },
    });
    if (response === 'COMPLETED')
      await createResponseIntent(tx, now, {
        eventKey: 'PRACTICE_REFLECTION_REQUEST',
        studentId: identity.studentId,
        channelIdentityId: identity.id,
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        aggregateVersion: session.student.version,
        idempotencyKey: `practice:${session.id}:reflection-request`,
        variables: {},
      });
    await tx.inboundResponseOwnership.create({
      data: {
        inboundMessageId: inbox.id,
        owner: acknowledgementIntentId ? 'SYSTEM_STANDARD_MESSAGE' : 'NO_REPLY',
        referenceId: acknowledgementIntentId,
      },
    });
    await tx.inboxEvent.update({
      where: { id: inbox.id },
      data: { processedAt: now, studentId: identity.studentId },
    });
    return true;
  });
}
