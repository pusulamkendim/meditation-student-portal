import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  LookupHmac,
  renderMessageTemplate,
  resolveMessageVariant,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  ChannelIdentityStatus,
  ChannelType,
  MessageIntentStatus,
  NotificationChannel,
  ProviderTemplateStatus,
  StandardMessageVersionStatus,
  type Prisma,
} from '@meditation/database';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

const linkLifetimeMs = 24 * 60 * 60_000;
const confirmationLifetimeMs = 24 * 60 * 60_000;
const transferCommand = 'NUMARA DEGISTIR';

function normalizeCommandWord(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replaceAll('\u0131', 'i').toUpperCase();
}

export function parseWhatsAppNumberTransferCommand(text: string): string | undefined {
  const parts = text.trim().split(/\s+/u);
  if (
    parts.length !== 3 ||
    normalizeCommandWord(parts[0] ?? '') !== 'NUMARA' ||
    normalizeCommandWord(parts[1] ?? '') !== 'DEGISTIR' ||
    !/^[A-Za-z0-9_-]{32,128}$/u.test(parts[2] ?? '')
  ) {
    return undefined;
  }
  return parts[2];
}

type WhatsAppInboundTransfer = {
  token: string;
  accountExternalId: string;
  externalUserId: string;
  inboxEventId: string;
  externalMessageId?: string;
  occurredAt: Date;
};

type WhatsAppInboundTransferResult =
  | { status: 'CONFIRMED'; studentId: string; identityId: string }
  | { status: 'INVALID' | 'CONFLICT' };

@Injectable()
export class ChannelLinkService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Channel encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async create(studentId: string, channel: ChannelType, actorId?: string) {
    if (channel !== ChannelType.WHATSAPP) {
      throw new BadRequestException('Bu akış yalnızca WhatsApp numarası değişikliği içindir.');
    }
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
      await tx.channelLinkToken.updateMany({
        where: { studentId, channel, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      const created = await tx.channelLinkToken.create({
        data: {
          studentId,
          channel,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(now.getTime() + linkLifetimeMs),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId,
          action: 'WHATSAPP_NUMBER_CHANGE_REQUESTED',
          entityType: 'Student',
          entityId: studentId,
          safeDiff: { channel, expiresAt: created.expiresAt.toISOString() },
          reason: 'WhatsApp number ownership verification requested',
          requestId: randomUUID(),
          correlationId: randomUUID(),
        },
      });
      return created;
    });
    return {
      id: record.id,
      token,
      command: `${transferCommand} ${token}`,
      expiresAt: record.expiresAt,
    };
  }

  async consumeWhatsAppInbound(
    tx: Prisma.TransactionClient,
    input: WhatsAppInboundTransfer,
  ): Promise<WhatsAppInboundTransferResult> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const initialLink = await tx.channelLinkToken.findUnique({ where: { tokenHash } });
    if (!initialLink) {
      await this.finishWithoutReply(tx, input.inboxEventId);
      return { status: 'INVALID' };
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initialLink.studentId}))`;
    const link = await tx.channelLinkToken.findUniqueOrThrow({ where: { tokenHash } });
    const now = this.clock.now();
    if (
      link.channel !== ChannelType.WHATSAPP ||
      link.usedAt ||
      link.revokedAt ||
      link.expiresAt <= now
    ) {
      await this.auditRejectedTransfer(tx, link.studentId, 'TOKEN_INVALID_OR_EXPIRED');
      await this.finishWithoutReply(tx, input.inboxEventId);
      return { status: 'INVALID' };
    }

    const account = await tx.channelAccount.findUnique({
      where: {
        type_externalId: {
          type: ChannelType.WHATSAPP,
          externalId: input.accountExternalId,
        },
      },
    });
    if (!account) {
      await this.auditRejectedTransfer(tx, link.studentId, 'CHANNEL_ACCOUNT_NOT_FOUND');
      await this.finishWithoutReply(tx, input.inboxEventId);
      return { status: 'INVALID' };
    }

    const externalUserHmac = this.lookup.digest(input.externalUserId);
    const existingIdentity = await tx.studentChannelIdentity.findUnique({
      where: {
        channelAccountId_externalUserHmac: {
          channelAccountId: account.id,
          externalUserHmac,
        },
      },
      select: { id: true, studentId: true },
    });
    const existingPhoneOwner = await tx.student.findFirst({
      where: { phoneHmac: externalUserHmac, id: { not: link.studentId } },
      select: { id: true },
    });
    if ((existingIdentity && existingIdentity.studentId !== link.studentId) || existingPhoneOwner) {
      await this.auditRejectedTransfer(tx, link.studentId, 'NUMBER_LINKED_TO_ANOTHER_STUDENT');
      await this.finishWithoutReply(tx, input.inboxEventId);
      return { status: 'CONFLICT' };
    }

    const encryptedIdentity = this.encryption.encrypt(
      input.externalUserId,
      `channel:${account.id}`,
    );
    const identity = existingIdentity
      ? await tx.studentChannelIdentity.update({
          where: { id: existingIdentity.id },
          data: {
            externalUserEncrypted: new Uint8Array(encryptedIdentity.ciphertext),
            externalUserKeyId: encryptedIdentity.keyId,
            status: ChannelIdentityStatus.ACTIVE,
            verifiedAt: input.occurredAt,
            lastInboundAt: input.occurredAt,
          },
        })
      : await tx.studentChannelIdentity.create({
          data: {
            studentId: link.studentId,
            channelAccountId: account.id,
            externalUserEncrypted: new Uint8Array(encryptedIdentity.ciphertext),
            externalUserKeyId: encryptedIdentity.keyId,
            externalUserHmac,
            status: ChannelIdentityStatus.ACTIVE,
            verifiedAt: input.occurredAt,
            lastInboundAt: input.occurredAt,
          },
        });

    const previousWhatsAppIdentities = await tx.studentChannelIdentity.findMany({
      where: {
        studentId: link.studentId,
        id: { not: identity.id },
        channelAccount: { type: ChannelType.WHATSAPP },
      },
      select: { id: true },
    });
    const previousIdentityIds = previousWhatsAppIdentities.map((item) => item.id);
    if (previousIdentityIds.length) {
      await tx.studentChannelIdentity.updateMany({
        where: { id: { in: previousIdentityIds } },
        data: { status: ChannelIdentityStatus.REVOKED },
      });
    }

    const encryptedPhone = this.encryption.encrypt(
      input.externalUserId,
      `student:${link.studentId}:phone`,
    );
    const student = await tx.student.update({
      where: { id: link.studentId },
      data: {
        defaultChannelIdentityId: identity.id,
        phoneEncrypted: new Uint8Array(encryptedPhone.ciphertext),
        phoneKeyId: encryptedPhone.keyId,
        phoneHmac: externalUserHmac,
        version: { increment: 1 },
      },
      select: {
        id: true,
        version: true,
        preferredLocale: true,
        curriculumStage: true,
      },
    });

    if (previousIdentityIds.length) {
      await tx.messageIntent.updateMany({
        where: {
          studentId: student.id,
          channelIdentityId: { in: previousIdentityIds },
          status: MessageIntentStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: { channelIdentityId: identity.id, aggregateVersion: student.version },
      });
      await this.requeueSuppressedIntents(
        tx,
        student.id,
        previousIdentityIds,
        identity.id,
        student.version,
        now,
      );
    }

    const redactedContent = this.encryption.encrypt(
      transferCommand,
      `message:${input.inboxEventId}`,
    );
    await tx.message.create({
      data: {
        studentId: student.id,
        channelIdentityId: identity.id,
        direction: 'INBOUND',
        status: 'RECEIVED',
        externalMessageId: input.externalMessageId,
        contentEncrypted: new Uint8Array(redactedContent.ciphertext),
        contentKeyId: redactedContent.keyId,
        inboxEventId: input.inboxEventId,
        occurredAt: input.occurredAt,
      },
    });
    await tx.inboxEvent.update({
      where: { id: input.inboxEventId },
      data: { studentId: student.id, processedAt: now },
    });
    await tx.channelLinkToken.update({ where: { id: link.id }, data: { usedAt: now } });

    const intentId = await this.createConfirmationIntent(tx, {
      student,
      identityId: identity.id,
      inboxEventId: input.inboxEventId,
      linkId: link.id,
      now,
    });
    await tx.inboundResponseOwnership.create({
      data: {
        inboundMessageId: input.inboxEventId,
        owner: intentId ? 'SYSTEM_STANDARD_MESSAGE' : 'NO_REPLY',
        referenceId: intentId,
      },
    });
    await tx.systemEventOccurrence.create({
      data: {
        eventKey: 'DEFAULT_CHANNEL_CHANGED',
        studentId: student.id,
        idempotencyKey: `channel-link-default:${link.id}`,
        variables: { channelName: 'WhatsApp' },
        occurredAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'WHATSAPP_NUMBER_CHANGED',
        entityType: 'Student',
        entityId: student.id,
        safeDiff: {
          newChannelIdentityId: identity.id,
          revokedChannelIdentityCount: previousIdentityIds.length,
        },
        reason: 'New WhatsApp number verified by signed inbound webhook',
        requestId: input.inboxEventId,
        correlationId: link.id,
      },
    });
    return { status: 'CONFIRMED', studentId: student.id, identityId: identity.id };
  }

  async setDefault(studentId: string, identityId: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.studentChannelIdentity.findFirstOrThrow({
        where: { id: identityId, studentId, status: ChannelIdentityStatus.ACTIVE },
      });
      const changed = await tx.student.updateMany({
        where: { id: studentId, version: expectedVersion },
        data: { defaultChannelIdentityId: identityId, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Student version conflict.');
      return tx.student.findUniqueOrThrow({ where: { id: studentId } });
    });
  }

  private async requeueSuppressedIntents(
    tx: Prisma.TransactionClient,
    studentId: string,
    previousIdentityIds: string[],
    identityId: string,
    aggregateVersion: number,
    now: Date,
  ) {
    const candidates = await tx.messageIntent.findMany({
      where: {
        studentId,
        channelIdentityId: { in: previousIdentityIds },
        status: MessageIntentStatus.SUPPRESSED,
        suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
        expiresAt: { gt: now },
      },
      select: { id: true },
      orderBy: { dueAt: 'asc' },
      take: 50,
    });
    for (const candidate of candidates) {
      const changed = await tx.messageIntent.updateMany({
        where: {
          id: candidate.id,
          status: MessageIntentStatus.SUPPRESSED,
          suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
        },
        data: {
          channelIdentityId: identityId,
          aggregateVersion,
          status: MessageIntentStatus.PENDING,
          suppressionReason: null,
        },
      });
      if (changed.count !== 1) continue;
      await tx.outboxEvent.create({
        data: {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: candidate.id,
          eventType: 'MessageIntentRetryRequested',
          payload: { intentId: candidate.id },
          availableAt: new Date(now.getTime() + 1_000),
        },
      });
    }
  }

  private async createConfirmationIntent(
    tx: Prisma.TransactionClient,
    input: {
      student: { id: string; version: number; preferredLocale: string; curriculumStage: string };
      identityId: string;
      inboxEventId: string;
      linkId: string;
      now: Date;
    },
  ): Promise<string | undefined> {
    const versions = await tx.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: input.now },
        variant: {
          channel: NotificationChannel.WHATSAPP,
          standardMessage: { eventKey: 'CHANNEL_LINK_CONFIRMED', audience: 'STUDENT' },
        },
      },
      include: { variant: { include: { providerBinding: true } } },
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
      {
        locale: input.student.preferredLocale,
        stage: input.student.curriculumStage,
        hasStudentName: false,
      },
    );
    const variables = { channelName: 'WhatsApp' };
    const rendered = variant
      ? renderMessageTemplate('CHANNEL_LINK_CONFIRMED', variant.content, variables)
      : 'WhatsApp numaran doğrulandı. Bundan sonraki pratik hatırlatmalarını ve diğer mesajlarını bu numaradan alacaksın.';
    const occurrence = await tx.systemEventOccurrence.create({
      data: {
        eventKey: 'CHANNEL_LINK_CONFIRMED',
        studentId: input.student.id,
        inboundMessageId: input.inboxEventId,
        idempotencyKey: `channel-link-confirmed:${input.linkId}`,
        variables,
        occurredAt: input.now,
      },
    });
    const intent = await tx.messageIntent.create({
      data: {
        studentId: input.student.id,
        channelIdentityId: input.identityId,
        category: 'CHANNEL_LINK_RESPONSE',
        status: MessageIntentStatus.PENDING,
        idempotencyKey: `system-event:${occurrence.id}`,
        dueAt: input.now,
        expiresAt: new Date(input.now.getTime() + confirmationLifetimeMs),
        aggregateVersion: input.student.version,
        payload: {
          eventKey: 'CHANNEL_LINK_CONFIRMED',
          standardMessageVersionId: variant?.id,
          rendered,
          reactive: true,
          locale: variant?.variant.locale ?? input.student.preferredLocale,
          providerTemplateName:
            variant?.variant.providerBinding?.status === ProviderTemplateStatus.APPROVED
              ? variant.variant.providerBinding.templateName
              : undefined,
          providerTemplateLocale:
            variant?.variant.providerBinding?.status === ProviderTemplateStatus.APPROVED
              ? variant.variant.providerBinding.providerLocale
              : undefined,
          providerTemplateParameters:
            variant?.variant.providerBinding?.status === ProviderTemplateStatus.APPROVED
              ? (variant.placeholders as string[]).map((key) =>
                  String(variables[key as keyof typeof variables] ?? ''),
                )
              : undefined,
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

  private async finishWithoutReply(tx: Prisma.TransactionClient, inboxEventId: string) {
    await tx.inboxEvent.update({
      where: { id: inboxEventId },
      data: { processedAt: this.clock.now() },
    });
    await tx.inboundResponseOwnership.create({
      data: { inboundMessageId: inboxEventId, owner: 'NO_REPLY' },
    });
  }

  private auditRejectedTransfer(tx: Prisma.TransactionClient, studentId: string, reason: string) {
    return tx.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'WHATSAPP_NUMBER_CHANGE_REJECTED',
        entityType: 'Student',
        entityId: studentId,
        safeDiff: { reason },
        reason: 'WhatsApp number ownership verification rejected',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }
}
