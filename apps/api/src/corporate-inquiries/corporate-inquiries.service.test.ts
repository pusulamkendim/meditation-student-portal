import { randomBytes } from 'node:crypto';

import { FakeClock, FieldEncryption } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../database/prisma.service.js';
import {
  CorporateInquiriesService,
  CorporateInquiryRateLimitError,
} from './corporate-inquiries.service.js';

function setup({ ipCount = 0, emailCount = 0 } = {}) {
  const key = randomBytes(32);
  const created: Record<string, unknown>[] = [];
  const outbox: Record<string, unknown>[] = [];
  const tx = {
    corporateInquiry: { create: vi.fn(async ({ data }) => created.push(data)) },
    outboxEvent: { createMany: vi.fn(async ({ data }) => outbox.push(...data)) },
  };
  const prisma = {
    corporateInquiry: {
      count: vi.fn().mockResolvedValueOnce(ipCount).mockResolvedValueOnce(emailCount),
    },
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
  const config = {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
    ACTIVE_DATA_KEY_ID: 'test',
    LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
  };
  return {
    created,
    outbox,
    encryption: new FieldEncryption(new Map([['test', key]]), 'test'),
    service: new CorporateInquiriesService(
      prisma as unknown as PrismaService,
      config as never,
      new FakeClock('2026-09-04T12:00:00.000Z'),
    ),
  };
}

describe('CorporateInquiriesService', () => {
  it('encrypts personal fields and writes both outbox events in the transaction', async () => {
    const { service, created, outbox, encryption } = setup();
    const result = await service.create(
      {
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        email: 'IK@Example.com',
        company: 'Örnek AŞ',
        note: 'Sekiz çalışan için bilgi istiyoruz.',
      },
      '203.0.113.10',
    );
    const row = created[0] as Record<string, unknown>;
    expect(row.firstNameEncrypted).toBeInstanceOf(Uint8Array);
    expect(row).not.toHaveProperty('firstName');
    expect(
      encryption.decrypt(
        {
          ciphertext: Buffer.from(row.emailEncrypted as Uint8Array),
          keyId: row.emailKeyId as string,
        },
        `corporate-inquiry:${result.id}:email`,
      ),
    ).toBe('ik@example.com');
    expect(outbox.map((event) => event.topic)).toEqual([
      'admin.notifications',
      'corporate.inquiry-email',
    ]);
  });

  it('rejects the sixth request from the same IP in an hour', async () => {
    const { service } = setup({ ipCount: 5 });
    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          email: 'a@example.com',
          company: 'Firma',
          note: 'Yeterince uzun bir not.',
        },
        '203.0.113.10',
      ),
    ).rejects.toBeInstanceOf(CorporateInquiryRateLimitError);
  });
});
