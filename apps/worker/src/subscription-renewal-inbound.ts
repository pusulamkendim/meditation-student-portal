import { randomBytes } from 'node:crypto';

import {
  FieldEncryption,
  getDefaultRegistrationMessage,
  renderMessageTemplate,
  resolveMessageVariant,
  type ApplicationConfig,
  type Clock,
  type SystemEventKey,
} from '@meditation/core';
import {
  MessageIntentStatus,
  Prisma,
  PrismaClient,
  RegistrationStep,
  StandardMessageVersionStatus,
  SubscriptionRenewalStatus,
} from '@meditation/database';

export type RenewalAction = 'CONTINUE' | 'DECLINE' | 'PAYMENT_REPORTED';

const continuePattern =
  /^(devam etmek isterim|devam etmek istiyorum|üyeliğime devam etmek istiyorum|üyeliğimi sürdürmek istiyorum)$/u;
const declinePattern =
  /^(devam etmeyeceğim|devam etmeyecegim|üyeliğimi sürdürmeyeceğim|üyeliğimi sürdürmeyecegim)$/u;
const paymentPattern = /^(ödeme yaptım|odeme yaptim|ödemeyi yaptım|odemeyi yaptim|dekont)$/u;

function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('tr-TR');
}

export function classifySubscriptionRenewalAction(
  content: string | undefined,
  messageType: unknown,
): RenewalAction | undefined {
  const answer = content ? normalizeAnswer(content) : '';
  if (continuePattern.test(answer)) return 'CONTINUE';
  if (declinePattern.test(answer)) return 'DECLINE';
  if (paymentPattern.test(answer) || messageType === 'image' || messageType === 'document')
    return 'PAYMENT_REPORTED';
  return undefined;
}

export class SubscriptionRenewalInboundProcessor {
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Subscription renewal encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async process(inboxEventId: string): Promise<'processed' | 'unhandled'> {
    const inbox = await this.prisma.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
    if (inbox.processedAt) return 'processed';
    const normalized = inbox.normalizedData as Record<string, unknown>;
    if (
      typeof normalized.accountExternalId !== 'string' ||
      typeof normalized.senderHmac !== 'string'
    )
      return 'unhandled';
    const content = this.decryptContent(inbox.dedupeKey, normalized);
    const action = classifySubscriptionRenewalAction(content, normalized.messageType);
    if (!action) return 'unhandled';

    const account = await this.prisma.channelAccount.findUnique({
      where: {
        type_externalId: { type: inbox.channel, externalId: normalized.accountExternalId },
      },
    });
    if (!account) return 'unhandled';
    const identity = await this.prisma.studentChannelIdentity.findUnique({
      where: {
        channelAccountId_externalUserHmac: {
          channelAccountId: account.id,
          externalUserHmac: normalized.senderHmac,
        },
      },
      include: { student: true },
    });
    if (!identity || identity.student.registrationStep !== RegistrationStep.COMPLETE)
      return 'unhandled';

    const handled = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.studentId}))`;
      const current = await tx.inboxEvent.findUniqueOrThrow({ where: { id: inbox.id } });
      if (current.processedAt) return true;
      const renewal = await tx.subscriptionRenewal.findFirst({
        where: {
          studentId: identity.studentId,
          status:
            action === 'PAYMENT_REPORTED'
              ? {
                  in: [
                    SubscriptionRenewalStatus.CONTINUE_REQUESTED,
                    SubscriptionRenewalStatus.PAYMENT_REPORTED,
                  ],
                }
              : {
                  in: [
                    SubscriptionRenewalStatus.REMINDER_QUEUED,
                    SubscriptionRenewalStatus.CONTINUE_REQUESTED,
                    SubscriptionRenewalStatus.DECLINED,
                  ],
                },
        },
        include: { sourceSubscriptionPeriod: true, payment: true },
        orderBy: { reminderQueuedAt: 'desc' },
      });
      if (!renewal) return false;

      const student = await tx.student.findUniqueOrThrow({ where: { id: identity.studentId } });
      const now = this.clock.now();
      let eventKey: SystemEventKey;
      let variables: Record<string, unknown>;
      let quickReplies: Array<{ id: string; title: string }> | undefined;

      if (action === 'CONTINUE') {
        const changed = await tx.subscriptionRenewal.updateMany({
          where: { id: renewal.id, version: renewal.version },
          data: {
            status: SubscriptionRenewalStatus.CONTINUE_REQUESTED,
            choiceRecordedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new Error('Subscription renewal choice conflict.');
        eventKey = 'SUBSCRIPTION_RENEWAL_PAYMENT_INSTRUCTIONS';
        variables = await this.paymentVariables(tx, student.id);
        quickReplies = [{ id: 'ÖDEME YAPTIM', title: 'Ödeme yaptım' }];
      } else if (action === 'DECLINE') {
        const changed = await tx.subscriptionRenewal.updateMany({
          where: { id: renewal.id, version: renewal.version },
          data: {
            status: SubscriptionRenewalStatus.DECLINED,
            choiceRecordedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new Error('Subscription renewal choice conflict.');
        eventKey = 'SUBSCRIPTION_RENEWAL_DECLINED';
        variables = {
          studentDisplayName: await this.firstName(tx, student.id),
          subscriptionEndsAtText: this.formatDate(
            new Date(renewal.sourceSubscriptionPeriod.endExclusive.getTime() - 86_400_000),
          ),
        };
      } else {
        let payment = renewal.payment;
        if (!payment) {
          payment = await tx.payment.create({
            data: {
              studentId: student.id,
              amountMinor: 400000,
              referenceCode: `YNL-${randomBytes(4).toString('hex').toUpperCase()}`,
              reportedAt: now,
            },
          });
          const changed = await tx.subscriptionRenewal.updateMany({
            where: {
              id: renewal.id,
              version: renewal.version,
              status: SubscriptionRenewalStatus.CONTINUE_REQUESTED,
              paymentId: null,
            },
            data: {
              status: SubscriptionRenewalStatus.PAYMENT_REPORTED,
              paymentId: payment.id,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) throw new Error('Subscription renewal payment conflict.');
          await tx.outboxEvent.create({
            data: {
              topic: 'admin.notifications',
              aggregateType: 'Payment',
              aggregateId: payment.id,
              eventType: 'ADMIN_PAYMENT_REVIEW_REQUIRED',
              payload: {
                studentId: student.id,
                paymentReference: payment.referenceCode,
                purpose: 'SUBSCRIPTION_RENEWAL',
              },
            },
          });
        }
        eventKey = 'PAYMENT_REPORTED';
        variables = {
          reference: payment.referenceCode,
          reportedAtText: this.formatDateTime(now),
        };
      }

      const existingInbound = await tx.message.findUnique({
        where: { inboxEventId: inbox.id },
        select: { id: true },
      });
      if (!existingInbound) {
        const protectedContent = content
          ? this.encryption.encrypt(content, `message:${inbox.id}`)
          : undefined;
        const occurredAt =
          typeof normalized.occurredAt === 'string' &&
          !Number.isNaN(new Date(normalized.occurredAt).getTime())
            ? new Date(normalized.occurredAt)
            : inbox.createdAt;
        await tx.message.create({
          data: {
            studentId: student.id,
            channelIdentityId: identity.id,
            direction: 'INBOUND',
            status: 'RECEIVED',
            externalMessageId:
              typeof normalized.externalMessageId === 'string'
                ? normalized.externalMessageId
                : null,
            contentEncrypted: protectedContent ? new Uint8Array(protectedContent.ciphertext) : null,
            contentKeyId: protectedContent?.keyId,
            inboxEventId: inbox.id,
            occurredAt,
          },
        });
      }

      const rendered = await this.render(
        tx,
        eventKey,
        inbox.channel,
        student.preferredLocale,
        variables,
      );
      const intent = await tx.messageIntent.create({
        data: {
          studentId: student.id,
          channelIdentityId: identity.id,
          category: 'SUBSCRIPTION_RENEWAL_RESPONSE',
          status: MessageIntentStatus.PENDING,
          idempotencyKey: `subscription-renewal-response:${inbox.id}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000),
          aggregateVersion: student.version,
          payload: {
            rendered,
            reactive: true,
            eventKey,
            subscriptionRenewalId: renewal.id,
            quickReplies,
          },
        },
      });
      await tx.inboxEvent.update({
        where: { id: inbox.id },
        data: { studentId: student.id, processedAt: now },
      });
      await tx.systemEventOccurrence.create({
        data: {
          eventKey,
          studentId: student.id,
          inboundMessageId: inbox.id,
          idempotencyKey: `subscription-renewal-event:${inbox.id}`,
          variables: variables as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      await tx.inboundResponseOwnership.create({
        data: {
          inboundMessageId: inbox.id,
          owner: 'SYSTEM_STANDARD_MESSAGE',
          referenceId: intent.id,
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
      return true;
    });
    return handled ? 'processed' : 'unhandled';
  }

  private async render(
    tx: Prisma.TransactionClient,
    eventKey: SystemEventKey,
    channel: 'WHATSAPP' | 'TELEGRAM',
    locale: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const versions = await tx.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: this.clock.now() },
        variant: {
          channel,
          standardMessage: { eventKey, audience: 'STUDENT' },
        },
      },
      include: { variant: true },
    });
    const selected = resolveMessageVariant(
      versions.map((version) => ({
        ...version,
        locale: version.variant.locale,
        stage: version.variant.curriculumStage,
        slot: version.variant.slot,
        priority: version.variant.priority,
        requiresStudentName: version.variant.requiresStudentName,
        effectiveAt: version.effectiveAt!,
      })),
      { locale, hasStudentName: typeof variables.studentDisplayName === 'string' },
    );
    const template = selected?.content ?? getDefaultRegistrationMessage(eventKey);
    if (!template) throw new Error(`Subscription renewal message is unavailable: ${eventKey}`);
    return renderMessageTemplate(eventKey, template, variables);
  }

  private decryptContent(
    dedupeKey: string,
    normalized: Record<string, unknown>,
  ): string | undefined {
    if (
      typeof normalized.contentEncrypted !== 'string' ||
      typeof normalized.contentKeyId !== 'string'
    )
      return undefined;
    return this.encryption.decrypt(
      {
        ciphertext: Buffer.from(normalized.contentEncrypted, 'base64'),
        keyId: normalized.contentKeyId,
      },
      dedupeKey,
    );
  }

  private async firstName(tx: Prisma.TransactionClient, studentId: string): Promise<string> {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { fullNameEncrypted: true, fullNameKeyId: true },
    });
    if (!student.fullNameEncrypted || !student.fullNameKeyId) return 'öğrencim';
    return this.encryption
      .decrypt(
        {
          ciphertext: Buffer.from(student.fullNameEncrypted),
          keyId: student.fullNameKeyId,
        },
        `student:${studentId}:name`,
      )
      .trim()
      .split(/\s+/u)[0]!;
  }

  private async paymentVariables(tx: Prisma.TransactionClient, studentId: string) {
    return {
      amountText: '4.000 TL',
      iban: this.config.PAYMENT_IBAN ?? 'TR00 0000 0000 0000 0000 0000 00',
      accountHolder: this.config.PAYMENT_ACCOUNT_HOLDER ?? 'Meditasyon Programı',
      studentDisplayName: await this.firstName(tx, studentId),
    };
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'long',
      timeZone: 'Europe/Istanbul',
    }).format(value);
  }

  private formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Istanbul',
    }).format(value);
  }
}
