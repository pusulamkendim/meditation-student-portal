import { ChannelIdentityStatus, ChannelType, MessageIntentStatus } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import { ChannelLinkService, parseWhatsAppNumberTransferCommand } from './channel-link.service.js';

const encryptionKey = Buffer.alloc(32, 41).toString('base64');
const lookupKey = Buffer.alloc(32, 42).toString('base64');
const now = new Date('2026-08-23T09:15:00.000Z');

function createService(prisma: unknown) {
  return new ChannelLinkService(
    prisma as never,
    { now: () => now } as never,
    {
      DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: encryptionKey }),
      ACTIVE_DATA_KEY_ID: 'test',
      LOOKUP_HMAC_KEY: lookupKey,
    } as never,
  );
}

describe('parseWhatsAppNumberTransferCommand', () => {
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-';

  it.each([
    `NUMARA DEGISTIR ${token}`,
    `Numara Değiştir ${token}`,
    `  numara değiştir   ${token}  `,
  ])('accepts the exact one-time transfer command: %s', (message) => {
    expect(parseWhatsAppNumberTransferCommand(message)).toBe(token);
  });

  it.each([`KAYIT ${token}`, `NUMARA DEGISTIR short-token`, `NUMARA DEGISTIR ${token} extra`])(
    'rejects unrelated or malformed text: %s',
    (message) => {
      expect(parseWhatsAppNumberTransferCommand(message)).toBeUndefined();
    },
  );
});

describe('ChannelLinkService', () => {
  it('creates a single-use WhatsApp link that expires after 24 hours', async () => {
    const tx = {
      student: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'student-1' }) },
      $executeRaw: vi.fn().mockResolvedValue(0),
      channelLinkToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'link-1', expiresAt: data.expiresAt }),
          ),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };

    const result = await createService(prisma).create('student-1', ChannelType.WHATSAPP, 'admin-1');

    expect(result.command).toBe(`NUMARA DEGISTIR ${result.token}`);
    expect(result.expiresAt).toEqual(new Date('2026-08-24T09:15:00.000Z'));
    expect(tx.channelLinkToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: 'student-1', usedAt: null, revokedAt: null }),
      }),
    );
  });

  it('moves the default WhatsApp identity and pending deliveries after signed inbound proof', async () => {
    const studentId = '10000000-0000-4000-8000-000000000001';
    const oldIdentityId = '10000000-0000-4000-8000-000000000002';
    const newIdentityId = '10000000-0000-4000-8000-000000000003';
    const inboxEventId = '10000000-0000-4000-8000-000000000004';
    const link = {
      id: '10000000-0000-4000-8000-000000000005',
      studentId,
      channel: ChannelType.WHATSAPP,
      expiresAt: new Date('2026-08-24T09:15:00.000Z'),
      usedAt: null,
      revokedAt: null,
    };
    const systemEventOccurrenceCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: '10000000-0000-4000-8000-000000000006' })
      .mockResolvedValueOnce({ id: '10000000-0000-4000-8000-000000000007' });
    const messageIntentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      channelLinkToken: {
        findUnique: vi.fn().mockResolvedValue(link),
        findUniqueOrThrow: vi.fn().mockResolvedValue(link),
        update: vi.fn().mockResolvedValue({ ...link, usedAt: now }),
      },
      channelAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000008',
          type: ChannelType.WHATSAPP,
        }),
      },
      studentChannelIdentity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: newIdentityId }),
        findMany: vi.fn().mockResolvedValue([{ id: oldIdentityId }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      student: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({
          id: studentId,
          version: 8,
          preferredLocale: 'tr-TR',
          curriculumStage: 'WEEK_1',
        }),
      },
      messageIntent: {
        updateMany: messageIntentUpdateMany,
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: '10000000-0000-4000-8000-000000000009' }),
      },
      message: { create: vi.fn().mockResolvedValue({}) },
      inboxEvent: { update: vi.fn().mockResolvedValue({}) },
      standardMessageVersion: { findMany: vi.fn().mockResolvedValue([]) },
      systemEventOccurrence: { create: systemEventOccurrenceCreate },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      inboundResponseOwnership: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const result = await createService({}).consumeWhatsAppInbound(tx as never, {
      token: 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-',
      accountExternalId: 'whatsapp-business-account',
      externalUserId: '905551112233',
      inboxEventId,
      externalMessageId: 'wamid.new-number-proof',
      occurredAt: now,
    });

    expect(result).toEqual({ status: 'CONFIRMED', studentId, identityId: newIdentityId });
    expect(tx.studentChannelIdentity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [oldIdentityId] } },
      data: { status: ChannelIdentityStatus.REVOKED },
    });
    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: studentId },
        data: expect.objectContaining({ defaultChannelIdentityId: newIdentityId }),
      }),
    );
    expect(messageIntentUpdateMany).toHaveBeenCalledWith({
      where: {
        studentId,
        channelIdentityId: { in: [oldIdentityId] },
        status: MessageIntentStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { channelIdentityId: newIdentityId, aggregateVersion: 8 },
    });
    expect(tx.inboundResponseOwnership.create).toHaveBeenCalledWith({
      data: {
        inboundMessageId: inboxEventId,
        owner: 'SYSTEM_STANDARD_MESSAGE',
        referenceId: '10000000-0000-4000-8000-000000000009',
      },
    });
  });
});
