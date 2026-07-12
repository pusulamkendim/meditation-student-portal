import {
  FieldEncryption,
  LookupHmac,
  endOfLocalServiceDate,
  parsePracticeResponsePayload,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { PracticeSessionStatus, PrismaClient } from '@meditation/database';

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
  const parsed = parsePracticeResponsePayload(content);
  if (!parsed) return false;
  const identity = await prisma.studentChannelIdentity.findFirst({
    where: {
      externalUserHmac: normalized.senderHmac,
      channelAccount: { type: inbox.channel, externalId: normalized.accountExternalId },
    },
  });
  if (!identity) return false;
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const session = await tx.practiceSession.findUniqueOrThrow({
      where: { id: parsed.sessionId },
      include: { student: true },
    });
    if (
      session.studentId !== identity.studentId ||
      session.status !== PracticeSessionStatus.AWAITING_RESPONSE ||
      !session.replyNonceHmac ||
      !lookup.verify(parsed.nonce, session.replyNonceHmac) ||
      now < session.startAt ||
      now >= endOfLocalServiceDate(session.serviceDate, session.student.timezone)
    )
      return false;
    const changed = await tx.practiceSession.updateMany({
      where: {
        id: session.id,
        version: session.version,
        status: PracticeSessionStatus.AWAITING_RESPONSE,
      },
      data: { status: parsed.response, version: { increment: 1 } },
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
    await tx.inboxEvent.update({
      where: { id: inbox.id },
      data: { processedAt: now, studentId: identity.studentId },
    });
    return true;
  });
}
