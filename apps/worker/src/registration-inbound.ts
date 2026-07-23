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
  ChannelIdentityStatus,
  ConsentScope,
  ConsentStatus,
  MessageIntentStatus,
  PaymentStatus,
  RegistrationStep,
  StandardMessageVersionStatus,
  StudentStatus,
  Prisma,
  PrismaClient,
} from '@meditation/database';

const PRIVACY_NOTICE_TEXT =
  'Ad, soyad, iletişim, ödeme, program ve pratik bilgilerin yalnızca programın yürütülmesi, hatırlatmaların gönderilmesi ve görüşmelerin planlanması amacıyla işlenir ve güvenli biçimde saklanır.';
const PRIVACY_NOTICE_VERSION = 'kvkk-v1';
const MESSAGING_CONSENT_VERSION = 'messaging-v1';
const AI_CONSENT_VERSION = 'ai-consent-v1';
const AI_CONSENT_TEXT =
  'Onay verirsen paylaşımların yalnızca bu amaçlarla, veri minimizasyonu uygulanarak işlenir. İznini dilediğin zaman geri çekebilirsin.';
const acceptancePattern =
  /^(evet|onay|onayladım|onayladim|onaylıyorum|onayliyorum|kabul|kabul ediyorum|tamam|olur|uygun)$/u;
const declinePattern = /^(hayır|hayir|istemiyorum|kabul etmiyorum)$/u;
const paymentPattern = /^(ödeme yaptım|odeme yaptim|ödemeyi yaptım|odemeyi yaptim|dekont)$/u;
const conversationalNonNamePattern =
  /\b(tamam|evet|hayır|hayir|süper|super|sevindim|teşekkür|tesekkur|sağ ol|sag ol|diyebilirsiniz|diyebilirsin)\b/iu;

function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeCommand(value: string): string {
  return normalizeAnswer(value).toLocaleLowerCase('tr-TR');
}

export function registrationQuickReplies(
  eventKey: SystemEventKey,
): Array<{ id: string; title: string }> | undefined {
  switch (eventKey) {
    case 'PRIVACY_NOTICE_SENT':
      return [{ id: 'ONAYLIYORUM', title: 'Onaylıyorum' }];
    case 'CHANNEL_OPT_IN_REQUEST':
      return [{ id: 'EVET', title: 'Evet' }];
    case 'AGENT_REPLY_AI_CONSENT_REQUEST':
      return [
        { id: 'EVET', title: 'Evet' },
        { id: 'HAYIR', title: 'Hayır' },
      ];
    case 'PAYMENT_INSTRUCTIONS':
      return [{ id: 'ÖDEME YAPTIM', title: 'Ödeme yaptım' }];
    default:
      return undefined;
  }
}

export function extractFullName(value: string): string | undefined {
  const candidates = [...value.normalize('NFKC').split(/\r?\n/u).reverse(), value];
  for (const candidate of candidates) {
    const normalized = normalizeAnswer(
      candidate.replace(/^[\p{M}\p{P}\p{S}\s]+|[\p{M}\p{P}\p{S}\s]+$/gu, ''),
    );
    if (
      normalized.length >= 3 &&
      normalized.length <= 200 &&
      normalized.split(' ').length >= 2 &&
      !conversationalNonNamePattern.test(normalized) &&
      /^[\p{L}][\p{L}' -]*[\p{L}]$/u.test(normalized)
    )
      return normalized;
  }
  return undefined;
}

export function isValidFullName(value: string): boolean {
  return extractFullName(value) !== undefined;
}

export function shouldHandleRegistrationMessage(
  exactCommand: unknown,
  registrationStep: RegistrationStep | undefined,
): boolean {
  if (exactCommand === 'KAYIT') return true;
  return registrationStep !== undefined && registrationStep !== RegistrationStep.COMPLETE;
}

export class RegistrationInboundProcessor {
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
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
    if (
      typeof normalized.accountExternalId !== 'string' ||
      typeof normalized.senderHmac !== 'string'
    )
      return 'unhandled';

    const account = await this.prisma.channelAccount.findUnique({
      where: {
        type_externalId: { type: inbox.channel, externalId: normalized.accountExternalId },
      },
    });
    const knownIdentity = account
      ? await this.prisma.studentChannelIdentity.findUnique({
          where: {
            channelAccountId_externalUserHmac: {
              channelAccountId: account.id,
              externalUserHmac: normalized.senderHmac,
            },
          },
          include: { student: true },
        })
      : null;
    if (
      !shouldHandleRegistrationMessage(
        normalized.exactCommand,
        knownIdentity?.student.registrationStep,
      )
    )
      return 'unhandled';
    if (
      normalized.exactCommand === 'KAYIT' &&
      (typeof normalized.senderEncrypted !== 'string' || typeof normalized.senderKeyId !== 'string')
    )
      throw new Error('Registration command is missing protected sender identity.');

    const text = this.decryptContent(inbox.dedupeKey, normalized);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
      if (current.processedAt) return;
      const channelAccount = await tx.channelAccount.upsert({
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
            channelAccountId: channelAccount.id,
            externalUserHmac: normalized.senderHmac as string,
          },
        },
        include: { student: true },
      });
      let eventKey: SystemEventKey;
      let variables: Record<string, unknown>;

      if (!identity) {
        const rawSender = this.encryption.decrypt(
          {
            ciphertext: Buffer.from(normalized.senderEncrypted as string, 'base64'),
            keyId: normalized.senderKeyId as string,
          },
          inbox.dedupeKey,
        );
        const protectedSender = this.encryption.encrypt(rawSender, `channel:${channelAccount.id}`);
        const student = await tx.student.create({
          data: { registrationStep: RegistrationStep.PRIVACY_NOTICE },
        });
        identity = await tx.studentChannelIdentity.create({
          data: {
            studentId: student.id,
            channelAccountId: channelAccount.id,
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
        eventKey = 'PRIVACY_NOTICE_SENT';
        variables = {
          privacyNoticeUrl: PRIVACY_NOTICE_TEXT,
          noticeVersion: PRIVACY_NOTICE_VERSION,
        };
      } else if (normalized.exactCommand === 'KAYIT') {
        ({ eventKey, variables } = await this.promptForCurrentStep(tx, identity.student));
      } else {
        ({ eventKey, variables } = await this.advanceRegistration(
          tx,
          identity,
          inbox,
          normalized,
          text,
        ));
      }

      const existingInbound = await tx.message.findUnique({
        where: { inboxEventId: inbox.id },
        select: { id: true },
      });
      if (!existingInbound) {
        const protectedContent = text
          ? this.encryption.encrypt(text, `message:${inbox.id}`)
          : undefined;
        const occurredAt =
          typeof normalized.occurredAt === 'string' &&
          !Number.isNaN(new Date(normalized.occurredAt).getTime())
            ? new Date(normalized.occurredAt)
            : inbox.createdAt;
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
            contentEncrypted: protectedContent ? new Uint8Array(protectedContent.ciphertext) : null,
            contentKeyId: protectedContent?.keyId,
            inboxEventId: inbox.id,
            occurredAt,
          },
        });
      }

      const student = await tx.student.findUniqueOrThrow({ where: { id: identity.studentId } });
      const rendered = await this.render(tx, eventKey, inbox.channel, variables);
      const now = this.clock.now();
      const intent = await tx.messageIntent.create({
        data: {
          studentId: student.id,
          channelIdentityId: identity.id,
          category: 'REGISTRATION_RESPONSE',
          status: MessageIntentStatus.PENDING,
          idempotencyKey: `registration:${inbox.id}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + 86400000),
          aggregateVersion: student.version,
          payload: {
            rendered,
            reactive: true,
            eventKey,
            quickReplies: registrationQuickReplies(eventKey),
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
          idempotencyKey: `registration-event:${inbox.id}`,
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
    });
    return 'processed';
  }

  private async advanceRegistration(
    tx: Prisma.TransactionClient,
    identity: NonNullable<Awaited<ReturnType<typeof this.findIdentityPlaceholder>>>,
    inbox: { id: string; channel: 'WHATSAPP' | 'TELEGRAM' },
    normalized: Record<string, unknown>,
    text: string | undefined,
  ): Promise<{ eventKey: SystemEventKey; variables: Record<string, unknown> }> {
    const answer = text ? normalizeCommand(text) : '';
    const student = identity.student;
    const externalMessageId =
      typeof normalized.externalMessageId === 'string' ? normalized.externalMessageId : undefined;
    const now = this.clock.now();
    switch (student.registrationStep) {
      case RegistrationStep.PRIVACY_NOTICE:
        if (!acceptancePattern.test(answer)) return this.promptForCurrentStep(tx, student);
        await tx.privacyNoticeReceipt.create({
          data: {
            studentId: student.id,
            noticeVersion: PRIVACY_NOTICE_VERSION,
            channel: inbox.channel,
            externalMessageId,
            deliveredAt: now,
          },
        });
        await this.updateStep(tx, student.id, student.version, RegistrationStep.CHANNEL_OPT_IN);
        return {
          eventKey: 'CHANNEL_OPT_IN_REQUEST',
          variables: { channelName: inbox.channel === 'TELEGRAM' ? 'Telegram' : 'WhatsApp' },
        };
      case RegistrationStep.CHANNEL_OPT_IN:
        if (!acceptancePattern.test(answer)) return this.promptForCurrentStep(tx, student);
        await tx.consent.create({
          data: {
            studentId: student.id,
            scope: ConsentScope.MESSAGING,
            status: ConsentStatus.GRANTED,
            textVersion: MESSAGING_CONSENT_VERSION,
            channel: inbox.channel,
            externalMessageId,
            occurredAt: now,
          },
        });
        await this.updateStep(tx, student.id, student.version, RegistrationStep.AI_PREFERENCE);
        return {
          eventKey: 'AGENT_REPLY_AI_CONSENT_REQUEST',
          variables: { privacyNoticeUrl: AI_CONSENT_TEXT },
        };
      case RegistrationStep.AI_PREFERENCE: {
        const accepted = acceptancePattern.test(answer);
        if (!accepted && !declinePattern.test(answer))
          return this.promptForCurrentStep(tx, student);
        await tx.consent.createMany({
          data: [ConsentScope.AGENT_REPLY_AI, ConsentScope.REFLECTION_STORAGE].map((scope) => ({
            studentId: student.id,
            scope,
            status: accepted ? ConsentStatus.GRANTED : ConsentStatus.WITHDRAWN,
            textVersion: AI_CONSENT_VERSION,
            channel: inbox.channel,
            externalMessageId,
            occurredAt: now,
          })),
        });
        await this.updateStep(tx, student.id, student.version, RegistrationStep.NAME);
        return { eventKey: 'NAME_REQUEST', variables: {} };
      }
      case RegistrationStep.NAME: {
        const fullName = text ? extractFullName(text) : undefined;
        if (!fullName) return { eventKey: 'NAME_REQUEST', variables: {} };
        const encrypted = this.encryption.encrypt(fullName, `student:${student.id}:name`);
        const named = await tx.student.updateMany({
          where: {
            id: student.id,
            version: student.version,
            registrationStep: RegistrationStep.NAME,
          },
          data: {
            fullNameEncrypted: new Uint8Array(encrypted.ciphertext),
            fullNameKeyId: encrypted.keyId,
            registrationStep: RegistrationStep.PAYMENT_INSTRUCTIONS,
            version: { increment: 1 },
          },
        });
        if (named.count !== 1) throw new Error('Registration name step conflict.');
        return { eventKey: 'PAYMENT_INSTRUCTIONS', variables: this.paymentVariables(student.id) };
      }
      case RegistrationStep.PAYMENT_INSTRUCTIONS: {
        const isMedia = normalized.messageType && normalized.messageType !== 'text';
        if (!paymentPattern.test(answer) && !isMedia)
          return { eventKey: 'PAYMENT_INSTRUCTIONS', variables: this.paymentVariables(student.id) };
        const reference = this.paymentReference(student.id);
        const payment = await tx.payment.create({
          data: {
            studentId: student.id,
            amountMinor: 400000,
            referenceCode: reference,
            reportedAt: now,
          },
        });
        const reported = await tx.student.updateMany({
          where: {
            id: student.id,
            version: student.version,
            registrationStep: RegistrationStep.PAYMENT_INSTRUCTIONS,
          },
          data: {
            status: StudentStatus.PAYMENT_PENDING,
            registrationStep: RegistrationStep.PAYMENT_REVIEW,
            version: { increment: 1 },
          },
        });
        if (reported.count !== 1) throw new Error('Registration payment step conflict.');
        await tx.outboxEvent.create({
          data: {
            topic: 'admin.notifications',
            aggregateType: 'Payment',
            aggregateId: payment.id,
            eventType: 'ADMIN_PAYMENT_REVIEW_REQUIRED',
            payload: { studentId: student.id, paymentReference: reference },
          },
        });
        return {
          eventKey: 'PAYMENT_REPORTED',
          variables: { reference, reportedAtText: this.formatDate(now) },
        };
      }
      default:
        return this.promptForCurrentStep(tx, student);
    }
  }

  private async promptForCurrentStep(
    tx: Prisma.TransactionClient,
    student: { id: string; registrationStep: RegistrationStep },
  ): Promise<{ eventKey: SystemEventKey; variables: Record<string, unknown> }> {
    switch (student.registrationStep) {
      case RegistrationStep.PRIVACY_NOTICE:
        return {
          eventKey: 'PRIVACY_NOTICE_SENT',
          variables: {
            privacyNoticeUrl: PRIVACY_NOTICE_TEXT,
            noticeVersion: PRIVACY_NOTICE_VERSION,
          },
        };
      case RegistrationStep.CHANNEL_OPT_IN:
        return { eventKey: 'CHANNEL_OPT_IN_REQUEST', variables: { channelName: 'bu kanal' } };
      case RegistrationStep.AI_PREFERENCE:
        return {
          eventKey: 'AGENT_REPLY_AI_CONSENT_REQUEST',
          variables: { privacyNoticeUrl: AI_CONSENT_TEXT },
        };
      case RegistrationStep.NAME:
        return { eventKey: 'NAME_REQUEST', variables: {} };
      case RegistrationStep.PAYMENT_INSTRUCTIONS:
        return { eventKey: 'PAYMENT_INSTRUCTIONS', variables: this.paymentVariables(student.id) };
      case RegistrationStep.PAYMENT_REVIEW: {
        const payment = await tx.payment.findFirst({
          where: { studentId: student.id, status: PaymentStatus.REPORTED },
          orderBy: { reportedAt: 'desc' },
        });
        return payment
          ? {
              eventKey: 'PAYMENT_REPORTED',
              variables: {
                reference: payment.referenceCode,
                reportedAtText: this.formatDate(payment.reportedAt),
              },
            }
          : { eventKey: 'REGISTRATION_ALREADY_EXISTS', variables: {} };
      }
      default:
        return { eventKey: 'REGISTRATION_ALREADY_EXISTS', variables: {} };
    }
  }

  private async render(
    tx: Prisma.TransactionClient,
    eventKey: SystemEventKey,
    channel: 'WHATSAPP' | 'TELEGRAM',
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
      { locale: 'tr-TR', hasStudentName: false },
    );
    const template = selected?.content ?? getDefaultRegistrationMessage(eventKey);
    if (!template) throw new Error(`Registration message is unavailable: ${eventKey}`);
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

  private async updateStep(
    tx: Prisma.TransactionClient,
    studentId: string,
    version: number,
    step: RegistrationStep,
  ) {
    const changed = await tx.student.updateMany({
      where: { id: studentId, version },
      data: { registrationStep: step, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error('Registration step conflict.');
  }

  private paymentReference(studentId: string): string {
    return `MED-${studentId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }

  private paymentVariables(studentId: string) {
    return {
      amountText: '4.000 TL',
      iban: this.config.PAYMENT_IBAN ?? 'TR00 0000 0000 0000 0000 0000 00',
      accountHolder: this.config.PAYMENT_ACCOUNT_HOLDER ?? 'Meditasyon Programı',
      reference: this.paymentReference(studentId),
    };
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Istanbul',
    }).format(value);
  }

  // This declaration keeps the identity include shape explicit without exporting a repository type.
  private findIdentityPlaceholder() {
    return this.prisma.studentChannelIdentity.findFirstOrThrow({ include: { student: true } });
  }
}
