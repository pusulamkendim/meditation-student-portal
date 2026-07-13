import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  FieldEncryption,
  LookupHmac,
  normalizeWhatsAppPayload,
  normalizeExactCommand,
  reconcileDeliveryStatus,
  type ApplicationConfig,
} from '@meditation/core';
import { ChannelType, MessageStatus, Prisma } from '@meditation/database';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class WhatsAppWebhookService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (
      !config.DATA_ENCRYPTION_KEYS_JSON ||
      !config.ACTIVE_DATA_KEY_ID ||
      !config.LOOKUP_HMAC_KEY
    ) {
      throw new Error('Webhook encryption and lookup keys are required.');
    }
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async accept(
    payload: unknown,
    rawBody: Buffer,
  ): Promise<{ accepted: number; duplicate: number }> {
    const events = normalizeWhatsAppPayload(payload);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    let accepted = 0;
    let duplicate = 0;
    for (const event of events) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.webhookEvent.create({
            data: {
              channel: ChannelType.WHATSAPP,
              accountExternalId: event.accountExternalId,
              dedupeKey: event.dedupeKey,
              eventType: event.eventType,
              externalMessageId: event.externalMessageId,
              payloadHash,
              result: 'ACCEPTED',
              occurredAt: event.occurredAt,
            },
          });
          if (event.eventType === 'MESSAGE_STATUS' && event.status) {
            const statusMap: Record<string, MessageStatus | undefined> = {
              sent: MessageStatus.SENT,
              delivered: MessageStatus.DELIVERED,
              read: MessageStatus.READ,
              failed: MessageStatus.FAILED,
            };
            const incoming = statusMap[event.status];
            if (incoming) {
              await transaction.messageDeliveryEvent.create({
                data: {
                  channel: ChannelType.WHATSAPP,
                  externalMessageId: event.externalMessageId,
                  status: incoming,
                  providerTimestamp: event.occurredAt,
                  payloadHash,
                },
              });
              const message = await transaction.message.findFirst({
                where: { externalMessageId: event.externalMessageId },
              });
              if (message) {
                const status = reconcileDeliveryStatus(
                  message.status as 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
                  incoming as 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
                );
                await transaction.message.update({ where: { id: message.id }, data: { status } });
              }
            }
          }
          const protectedData: Record<string, unknown> = {
            accountExternalId: event.accountExternalId,
            externalMessageId: event.externalMessageId,
            messageType: event.messageType,
            status: event.status,
              occurredAt: event.occurredAt.toISOString(),
              repliedToExternalMessageId: event.repliedToExternalMessageId,
          };
          if (event.sender) {
            protectedData.senderHmac = this.lookup.digest(event.sender);
            const sender = this.encryption.encrypt(event.sender, event.dedupeKey);
            protectedData.senderEncrypted = sender.ciphertext.toString('base64');
            protectedData.senderKeyId = sender.keyId;
          }
          if (event.text !== undefined) {
            const encrypted = this.encryption.encrypt(event.text, event.dedupeKey);
            protectedData.contentEncrypted = encrypted.ciphertext.toString('base64');
            protectedData.contentKeyId = encrypted.keyId;
            const exactCommand = normalizeExactCommand(event.text);
            if (exactCommand) protectedData.exactCommand = exactCommand;
          }
          const inbox = await transaction.inboxEvent.create({
            data: {
              channel: ChannelType.WHATSAPP,
              dedupeKey: event.dedupeKey,
              eventType: event.eventType,
              payloadHash,
              normalizedData: protectedData as Prisma.InputJsonValue,
            },
          });
          if (event.sender) {
            await transaction.studentChannelIdentity.updateMany({
              where: {
                externalUserHmac: this.lookup.digest(event.sender),
                channelAccount: { type: ChannelType.WHATSAPP, externalId: event.accountExternalId },
              },
              data: { lastInboundAt: event.occurredAt },
            });
          }
          const awaitingPractice =
            event.text && event.sender
              ? await transaction.practiceSession.findFirst({
                  where: {
                    OR: [
                      { status: 'AWAITING_RESPONSE' },
                      {
                        status: 'COMPLETED',
                        updatedAt: { gte: new Date(event.occurredAt.getTime() - 60 * 60_000) },
                        reflection: { is: null },
                      },
                    ],
                    student: {
                      channelIdentities: {
                        some: {
                          externalUserHmac: this.lookup.digest(event.sender),
                          channelAccount: {
                            type: ChannelType.WHATSAPP,
                            externalId: event.accountExternalId,
                          },
                        },
                      },
                    },
                  },
                  select: { id: true },
                })
              : null;
          const replySource =
            event.repliedToExternalMessageId && event.sender
              ? await transaction.message.findFirst({
                  where: {
                    channelIdentity: {
                      externalUserHmac: this.lookup.digest(event.sender),
                      channelAccount: {
                        type: ChannelType.WHATSAPP,
                        externalId: event.accountExternalId,
                      },
                    },
                    externalMessageId: event.repliedToExternalMessageId,
                    direction: 'OUTBOUND',
                  },
                  include: { messageIntent: true },
                })
              : null;
          const replyEvent = (
            replySource?.messageIntent?.payload as Record<string, unknown> | undefined
          )?.eventKey;
          await transaction.outboxEvent.create({
            data: {
              topic:
                event.text?.startsWith('practice:') ||
                (typeof replyEvent === 'string' && replyEvent.startsWith('PRACTICE_')) ||
                (awaitingPractice && !replyEvent)
                  ? 'practice.inbound'
                  : 'channel.inbound',
              aggregateType: 'InboxEvent',
              aggregateId: inbox.id,
              eventType: event.eventType,
              payload: { inboxEventId: inbox.id, channel: ChannelType.WHATSAPP },
            },
          });
        });
        accepted += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          duplicate += 1;
          continue;
        }
        throw error;
      }
    }
    return { accepted, duplicate };
  }
}
