import { FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import { ConversationsController } from './conversations.controller.js';

describe('ConversationsController inbox', () => {
  it('groups encrypted inbound messages and preserves reading inquiry attribution', async () => {
    const key = Buffer.alloc(32, 31);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const senderHmac = 'sender-hmac';
    const accountExternalId = 'account-1';
    const encrypted = (value: string, dedupeKey: string) => {
      const result = encryption.encrypt(value, dedupeKey);
      return {
        contentEncrypted: result.ciphertext.toString('base64'),
        contentKeyId: result.keyId,
      };
    };
    const sender = (value: string, dedupeKey: string) => {
      const result = encryption.encrypt(value, dedupeKey);
      return {
        senderEncrypted: result.ciphertext.toString('base64'),
        senderKeyId: result.keyId,
      };
    };
    const events = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        studentId: null,
        channel: 'WHATSAPP',
        dedupeKey: 'message-latest',
        normalizedData: {
          senderHmac,
          accountExternalId,
          occurredAt: '2026-07-29T12:10:00.000Z',
          ...sender('905551112233', 'message-latest'),
          ...encrypted('Program hangi günlerde yapılıyor?', 'message-latest'),
        },
        createdAt: new Date('2026-07-29T12:10:00.000Z'),
        student: null,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        studentId: null,
        channel: 'WHATSAPP',
        dedupeKey: 'message-reading',
        normalizedData: {
          senderHmac,
          accountExternalId,
          occurredAt: '2026-07-29T12:00:00.000Z',
          ...sender('905551112233', 'message-reading'),
          ...encrypted(
            'Birebir meditasyon dersleri hakkında bilgi almak istiyorum.',
            'message-reading',
          ),
        },
        createdAt: new Date('2026-07-29T12:00:00.000Z'),
        student: null,
      },
    ];
    const findMany = vi.fn().mockResolvedValue(events);
    const auditCreate = vi.fn().mockResolvedValue({});
    const controller = new ConversationsController(
      {
        inboxEvent: { findMany },
        auditLog: { create: auditCreate },
      } as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
      } as ApplicationConfig,
      {} as never,
    );

    const result = await controller.inbox({
      admin: { id: '20000000-0000-4000-8000-000000000001' },
    } as never);

    expect(result.items).toEqual([
      expect.objectContaining({
        channel: 'WHATSAPP',
        contact: '905551112233',
        content: 'Program hangi günlerde yapılıyor?',
        inboundCount: 2,
        readingInquiry: true,
      }),
    ]);
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});
