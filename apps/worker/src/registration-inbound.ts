import { FieldEncryption, type ApplicationConfig, type Clock } from '@meditation/core';
import {
  ChannelIdentityStatus,
  MessageIntentStatus,
  RegistrationStep,
  PrismaClient,
} from '@meditation/database';

const PRIVACY_MESSAGE =
  'Kaydınızı başlatmak için kişisel verilerinizin kayıt, iletişim ve hizmet süreçlerinde işlenmesini kabul etmeniz gerekir. Kabul ediyorsanız ONAY yazın.';
const EXISTING_MESSAGE =
  'Bu iletişim kanalıyla daha önce bir kayıt başlatılmış. Kaldığınız adımdan devam edebilirsiniz.';

export class RegistrationInboundProcessor {
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Registration worker encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async process(inboxEventId: string): Promise<'processed' | 'unhandled'> {
    const inbox = await this.prisma.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
    if (inbox.processedAt) return 'processed';
    const normalized = inbox.normalizedData as Record<string, unknown>;
    if (normalized.exactCommand !== 'KAYIT') return 'unhandled';
    if (
      typeof normalized.accountExternalId !== 'string' ||
      typeof normalized.senderHmac !== 'string' ||
      typeof normalized.senderEncrypted !== 'string' ||
      typeof normalized.senderKeyId !== 'string'
    ) {
      throw new Error('Registration command is missing protected sender identity.');
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
      if (current.processedAt) return;
      const account = await tx.channelAccount.upsert({
        where: {
          type_externalId: {
            type: inbox.channel,
            externalId: normalized.accountExternalId as string,
          },
        },
        create: {
          type: inbox.channel,
          externalId: normalized.accountExternalId as string,
          displayName: `${inbox.channel} primary`,
        },
        update: { active: true },
      });
      let identity = await tx.studentChannelIdentity.findUnique({
        where: {
          channelAccountId_externalUserHmac: {
            channelAccountId: account.id,
            externalUserHmac: normalized.senderHmac as string,
          },
        },
        include: { student: true },
      });
      const existing = Boolean(identity);
      if (!identity) {
        const rawSender = this.encryption.decrypt(
          {
            ciphertext: Buffer.from(normalized.senderEncrypted as string, 'base64'),
            keyId: normalized.senderKeyId as string,
          },
          inbox.dedupeKey,
        );
        const protectedSender = this.encryption.encrypt(rawSender, `channel:${account.id}`);
        const student = await tx.student.create({
          data: { registrationStep: RegistrationStep.PRIVACY_NOTICE },
        });
        identity = await tx.studentChannelIdentity.create({
          data: {
            studentId: student.id,
            channelAccountId: account.id,
            externalUserEncrypted: new Uint8Array(protectedSender.ciphertext),
            externalUserKeyId: protectedSender.keyId,
            externalUserHmac: normalized.senderHmac as string,
            status: ChannelIdentityStatus.ACTIVE,
            verifiedAt: this.clock.now(),
            lastInboundAt: this.clock.now(),
          },
          include: { student: true },
        });
        await tx.student.update({
          where: { id: student.id },
          data: { defaultChannelIdentityId: identity.id, version: { increment: 1 } },
        });
        await tx.messagingPreference.create({ data: { studentId: student.id } });
      }
      const now = this.clock.now();
      const intent = await tx.messageIntent.create({
        data: {
          studentId: identity.studentId,
          channelIdentityId: identity.id,
          category: 'REGISTRATION_RESPONSE',
          status: MessageIntentStatus.PENDING,
          idempotencyKey: `registration:${inbox.id}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
          aggregateVersion: existing ? identity.student.version : identity.student.version + 1,
          payload: { rendered: existing ? EXISTING_MESSAGE : PRIVACY_MESSAGE, reactive: true },
        },
      });
      await tx.inboxEvent.update({
        where: { id: inbox.id },
        data: { studentId: identity.studentId, processedAt: now },
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
    });
    return 'processed';
  }
}
