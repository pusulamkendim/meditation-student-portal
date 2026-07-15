import {
  FieldEncryption,
  TelegramBotAdapter,
  WhatsAppCloudAdapter,
  evaluateSendPolicy,
  type ApplicationConfig,
  type ChannelAdapter,
  type Clock,
} from '@meditation/core';
import {
  ChannelType,
  MessageIntentStatus,
  PrismaClient,
  StudentStatus,
} from '@meditation/database';

export class MessageDispatcher {
  private readonly encryption: FieldEncryption;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly config: ApplicationConfig,
    private readonly adapters: Partial<Record<ChannelType, ChannelAdapter>>,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID) {
      throw new Error('Worker encryption keys are required.');
    }
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async dispatch(intentId: string): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const intent = await tx.messageIntent.findUnique({
        where: { id: intentId },
        include: {
          student: { include: { messagingPreference: true } },
          channelIdentity: { include: { channelAccount: true } },
        },
      });
      if (!intent || intent.status !== MessageIntentStatus.PENDING) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${intent.studentId}))`;
      const payload = intent.payload as Record<string, unknown>;
      const practiceSession =
        typeof payload.practiceSessionId === 'string'
          ? await tx.practiceSession.findUnique({
              where: { id: payload.practiceSessionId },
              include: { practicePlan: { include: { subscriptionPeriod: true } } },
            })
          : undefined;
      const meeting =
        typeof payload.meetingId === 'string'
          ? await tx.weeklyMeeting.findUnique({
              where: { id: payload.meetingId },
              include: { meetingSeries: { include: { subscriptionPeriod: true } } },
            })
          : undefined;
      const meetingSeries =
        typeof payload.meetingSeriesId === 'string'
          ? await tx.meetingSeries.findUnique({
              where: { id: payload.meetingSeriesId },
              include: {
                subscriptionPeriod: true,
                meetings: { where: { status: 'SCHEDULED' }, select: { id: true }, take: 1 },
              },
            })
          : undefined;
      const practiceStateValid = practiceSession
        ? practiceSession.practicePlan.status === 'ACTIVE' &&
          practiceSession.practicePlan.subscriptionPeriod.status === 'ACTIVE' &&
          practiceSession.version === intent.aggregateVersion &&
          ((intent.category === 'PRACTICE_REMINDER' && practiceSession.status === 'REMINDED') ||
            (intent.category === 'PRACTICE_CHECKIN' &&
              practiceSession.status === 'AWAITING_RESPONSE'))
        : true;
      const meetingStateValid = meeting
        ? meeting.status === 'SCHEDULED' &&
          meeting.version === intent.aggregateVersion &&
          meeting.meetingSeries.subscriptionPeriod.status === 'ACTIVE'
        : true;
      const meetingSeriesStateValid = meetingSeries
        ? meetingSeries.version === intent.aggregateVersion &&
          (meetingSeries.subscriptionPeriod.status === 'ACTIVE' ||
            meetingSeries.subscriptionPeriod.status === 'SCHEDULED') &&
          meetingSeries.meetings.length > 0 &&
          (meetingSeries.conferenceStatus === 'READY' ||
            meetingSeries.conferenceStatus === 'MANUAL_OVERRIDE')
        : true;
      const decision = evaluateSendPolicy(
        {
          dueAt: intent.dueAt,
          expiresAt: intent.expiresAt,
          studentActive:
            intent.student.status === StudentStatus.ACTIVE ||
            (intent.category === 'REGISTRATION_RESPONSE' && payload.reactive === true) ||
            (intent.category === 'PAYMENT_APPROVED' && intent.student.status === 'INACTIVE'),
          messagingEnabled:
            intent.student.messagingPreference?.proactiveEnabled !== false &&
            !intent.student.messagingPreference?.pausedAt,
          identityActive: intent.channelIdentity.status === 'ACTIVE',
          channel: intent.channelIdentity.channelAccount.type,
          lastInboundAt: intent.channelIdentity.lastInboundAt ?? undefined,
          approvedTemplate: typeof payload.providerTemplateName === 'string',
          aggregateVersionMatches: practiceSession
            ? practiceStateValid
            : meeting
              ? meetingStateValid
              : meetingSeries
                ? meetingSeriesStateValid
                : intent.aggregateVersion === intent.student.version,
        },
        this.clock,
      );
      if (!decision.allowed) {
        await tx.messageIntent.update({
          where: { id: intent.id },
          data: { status: MessageIntentStatus.SUPPRESSED, suppressionReason: decision.reason },
        });
        return null;
      }
      const changed = await tx.messageIntent.updateMany({
        where: { id: intent.id, status: MessageIntentStatus.PENDING },
        data: { status: MessageIntentStatus.CLAIMED },
      });
      return changed.count === 1 ? intent : null;
    });
    if (!claimed) return;

    const latest = await this.prisma.messageIntent.findUnique({ where: { id: claimed.id } });
    if (latest?.status !== MessageIntentStatus.CLAIMED) return;

    const payload = claimed.payload as Record<string, unknown>;
    const recipient = this.encryption.decrypt(
      {
        ciphertext: Buffer.from(claimed.channelIdentity.externalUserEncrypted),
        keyId: claimed.channelIdentity.externalUserKeyId,
      },
      `channel:${claimed.channelIdentity.channelAccountId}`,
    );
    const content =
      typeof payload.rendered === 'string'
        ? payload.rendered
        : this.encryption.decrypt(
            {
              ciphertext: Buffer.from(String(payload.contentEncrypted), 'base64'),
              keyId: String(payload.contentKeyId),
            },
            `admin-reply:${claimed.studentId}`,
          );
    const adapter = this.adapters[claimed.channelIdentity.channelAccount.type];
    if (!adapter) throw new Error('Channel adapter is unavailable.');
    try {
      const result = await adapter.send({
        intentId: claimed.id,
        recipient,
        content,
        locale: claimed.student.preferredLocale,
        idempotencyKey: claimed.idempotencyKey,
        template:
          typeof payload.providerTemplateName === 'string' &&
          typeof payload.providerTemplateLocale === 'string'
            ? {
                name: payload.providerTemplateName,
                languageCode: payload.providerTemplateLocale,
                parameters: Array.isArray(payload.providerTemplateParameters)
                  ? payload.providerTemplateParameters.map(String)
                  : [],
              }
            : undefined,
        quickReplies: Array.isArray(payload.quickReplies)
          ? (payload.quickReplies as Array<Record<string, unknown>>)
              .filter((reply) => typeof reply.id === 'string' && typeof reply.title === 'string')
              .map((reply) => ({ id: String(reply.id), title: String(reply.title) }))
          : undefined,
      });
      await this.prisma.$transaction(async (tx) => {
        const encrypted = this.encryption.encrypt(content, `message:${result.providerMessageId}`);
        await tx.message.create({
          data: {
            studentId: claimed.studentId,
            channelIdentityId: claimed.channelIdentityId,
            direction: 'OUTBOUND',
            status: 'SENT',
            externalMessageId: result.providerMessageId,
            messageIntentId: claimed.id,
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
            occurredAt: this.clock.now(),
          },
        });
        await tx.messageIntent.update({
          where: { id: claimed.id },
          data: { status: MessageIntentStatus.SENT, providerMessageId: result.providerMessageId },
        });
        if (typeof payload.draftId === 'string')
          await tx.weeklySummaryDraftVersion.updateMany({
            where: { id: payload.draftId, status: 'APPROVED' },
            data: { status: 'SENT', sentAt: this.clock.now() },
          });
      });
    } catch (error) {
      await this.prisma.messageIntent.update({
        where: { id: claimed.id },
        data: {
          status:
            error instanceof TypeError
              ? MessageIntentStatus.DELIVERY_UNKNOWN
              : MessageIntentStatus.FAILED,
        },
      });
      throw error;
    }
  }
}

export function createChannelAdapters(config: ApplicationConfig) {
  const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {};
  if (config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID) {
    adapters.WHATSAPP = new WhatsAppCloudAdapter(
      config.WHATSAPP_ACCESS_TOKEN,
      config.WHATSAPP_PHONE_NUMBER_ID,
    );
  }
  if (config.TELEGRAM_BOT_TOKEN)
    adapters.TELEGRAM = new TelegramBotAdapter(config.TELEGRAM_BOT_TOKEN);
  return adapters;
}
