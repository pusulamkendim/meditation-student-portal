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
}

export async function processPracticeResponse(
  prisma: PrismaClient,
  clock: Clock,
  config: ApplicationConfig,
  inboxEventId: string,
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
  const normalizedResponse = content.trim().toLocaleUpperCase('tr-TR');
  const typedResponse =
    normalizedResponse === 'YAPTIM'
      ? 'COMPLETED'
      : normalizedResponse === 'YAPAMADIM'
        ? 'SKIPPED'
        : undefined;
  const identity = await prisma.studentChannelIdentity.findFirst({
    where: {
      externalUserHmac: normalized.senderHmac,
      channelAccount: { type: inbox.channel, externalId: normalized.accountExternalId },
    },
  });
  if (!identity) return false;
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const session = await tx.practiceSession.findFirst({
      where: parsedPayload
        ? { id: parsedPayload.sessionId }
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
    if (!parsedPayload && session.status === PracticeSessionStatus.COMPLETED) {
      const consent = await tx.consent.findFirst({
        where: { studentId: identity.studentId, scope: ConsentScope.REFLECTION_STORAGE },
        orderBy: { occurredAt: 'desc' },
      });
      if (consent?.status !== ConsentStatus.GRANTED) return false;
      const encryptedReflection = encryption.encrypt(content.trim(), `practice:${session.id}:reflection`);
      const reflection = await tx.practiceReflection.create({
        data: {
          practiceSessionId: session.id,
          contentEncrypted: new Uint8Array(encryptedReflection.ciphertext),
          contentKeyId: encryptedReflection.keyId,
        },
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
      await tx.outboxEvent.create({
        data: {
          topic: 'llm.reflection-tagging',
          aggregateType: 'PracticeReflection',
          aggregateId: reflection.id,
          eventType: 'ReflectionCaptured',
          payload: { reflectionId: reflection.id, studentId: identity.studentId },
        },
      });
      await tx.inboxEvent.update({
        where: { id: inbox.id },
        data: { processedAt: now, studentId: identity.studentId },
      });
      return true;
    }
    if (
      session.studentId !== identity.studentId ||
      session.status !== PracticeSessionStatus.AWAITING_RESPONSE ||
      !session.replyNonceHmac ||
      (parsedPayload && !lookup.verify(parsedPayload.nonce, session.replyNonceHmac)) ||
      now < session.startAt ||
      now >= endOfLocalServiceDate(session.serviceDate, session.student.timezone)
    )
      return false;
    const response = parsedPayload?.response ?? typedResponse;
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
      await createResponseIntent(tx, now, {
        eventKey: 'PRACTICE_RESPONSE_AMBIGUOUS',
        studentId: identity.studentId,
        channelIdentityId: identity.id,
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        aggregateVersion: session.student.version,
        idempotencyKey: `practice:${session.id}:ambiguous:${inbox.id}`,
        variables: {},
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
        status: PracticeSessionStatus.AWAITING_RESPONSE,
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
    await createResponseIntent(tx, now, {
      eventKey:
        response === 'COMPLETED' ? 'PRACTICE_COMPLETED_ACK' : 'PRACTICE_SKIPPED_ACK',
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
    await tx.inboxEvent.update({
      where: { id: inbox.id },
      data: { processedAt: now, studentId: identity.studentId },
    });
    return true;
  });
}
