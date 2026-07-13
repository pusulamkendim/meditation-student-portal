import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  FieldEncryption,
  LookupHmac,
  normalizeTelegramUpdate,
  normalizeExactCommand,
  type ApplicationConfig,
} from '@meditation/core';
import { ChannelType, Prisma } from '@meditation/database';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class TelegramWebhookService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Webhook encryption and lookup keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async accept(payload: unknown, rawBody: Buffer) {
    const event = normalizeTelegramUpdate(payload, this.config.TELEGRAM_ACCOUNT_ID);
    if (event.ignored) return { status: 'ignored' as const };
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.webhookEvent.create({
          data: {
            channel: ChannelType.TELEGRAM,
            accountExternalId: this.config.TELEGRAM_ACCOUNT_ID,
            dedupeKey: event.dedupeKey,
            eventType: 'MESSAGE_RECEIVED',
            externalMessageId: event.externalMessageId,
            payloadHash,
            result: 'ACCEPTED',
            occurredAt: event.occurredAt,
          },
        });
        const normalized: Record<string, unknown> = {
          accountExternalId: this.config.TELEGRAM_ACCOUNT_ID,
          externalMessageId: event.externalMessageId,
          senderHmac: this.lookup.digest(event.sender),
          occurredAt: event.occurredAt.toISOString(),
        };
        const sender = this.encryption.encrypt(event.sender, event.dedupeKey);
        normalized.senderEncrypted = sender.ciphertext.toString('base64');
        normalized.senderKeyId = sender.keyId;
        if (event.text !== undefined) {
          const value = this.encryption.encrypt(event.text, event.dedupeKey);
          normalized.contentEncrypted = value.ciphertext.toString('base64');
          normalized.contentKeyId = value.keyId;
          const exactCommand = normalizeExactCommand(event.text);
          if (exactCommand) normalized.exactCommand = exactCommand;
        }
        const inbox = await transaction.inboxEvent.create({
          data: {
            channel: ChannelType.TELEGRAM,
            dedupeKey: event.dedupeKey,
            eventType: 'MESSAGE_RECEIVED',
            payloadHash,
            normalizedData: normalized as Prisma.InputJsonValue,
          },
        });
        await transaction.studentChannelIdentity.updateMany({
          where: {
            externalUserHmac: this.lookup.digest(event.sender),
            channelAccount: {
              type: ChannelType.TELEGRAM,
              externalId: this.config.TELEGRAM_ACCOUNT_ID,
            },
          },
          data: { lastInboundAt: event.occurredAt },
        });
        await transaction.outboxEvent.create({
          data: {
            topic: event.text?.startsWith('practice:') ? 'practice.inbound' : 'channel.inbound',
            aggregateType: 'InboxEvent',
            aggregateId: inbox.id,
            eventType: 'MESSAGE_RECEIVED',
            payload: { inboxEventId: inbox.id, channel: ChannelType.TELEGRAM },
          },
        });
      });
      return { status: 'accepted' as const };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return { status: 'duplicate' as const };
      throw error;
    }
  }
}
