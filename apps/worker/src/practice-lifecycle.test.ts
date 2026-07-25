import { randomBytes } from 'node:crypto';
import { FakeClock, FieldEncryption } from '@meditation/core';
import { PracticeSessionStatus, type PrismaClient } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';
import { createPracticeLifecycleIntent } from './practice-lifecycle.js';

function fixture() {
  const studentId = '10000000-0000-4000-8000-000000000002';
  const activeKeyId = 'test-v1';
  const dataKey = randomBytes(32);
  const encryption = new FieldEncryption(new Map([[activeKeyId, dataKey]]), activeKeyId);
  const encryptedName = encryption.encrypt('Dilge Sağtaş', `student:${studentId}:name`);
  const config = {
    LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ [activeKeyId]: dataKey.toString('base64') }),
    ACTIVE_DATA_KEY_ID: activeKeyId,
  };
  const session = {
    id: '10000000-0000-4000-8000-000000000001',
    studentId,
    practicePlanId: '10000000-0000-4000-8000-000000000003',
    practiceSlotId: '10000000-0000-4000-8000-000000000004',
    serviceDate: new Date('2026-07-01T00:00:00Z'),
    startAt: new Date('2026-07-01T05:00:00Z'),
    durationMinutes: 15,
    status: PracticeSessionStatus.SCHEDULED,
    version: 1,
    student: {
      preferredLocale: 'tr-TR',
      curriculumStage: 'WEEK_1',
      timezone: 'Europe/Istanbul',
      fullNameEncrypted: new Uint8Array(encryptedName.ciphertext),
      fullNameKeyId: encryptedName.keyId,
      defaultChannelIdentity: {
        id: '10000000-0000-4000-8000-000000000005',
        channelAccount: { type: 'WHATSAPP' },
      },
    },
    practiceSlot: { slotKey: 'MORNING' },
    practicePlan: { status: 'ACTIVE', subscriptionPeriod: { status: 'ACTIVE' } },
  };
  const occurrenceCreate = vi.fn(async ({ data }) => ({
    id: '10000000-0000-4000-8000-000000000006',
    ...data,
  }));
  const intentCreate = vi.fn(async ({ data }) => ({
    id: '10000000-0000-4000-8000-000000000007',
    ...data,
  }));
  const outboxCreate = vi.fn(async ({ data }) => data);
  const tx = {
    practiceSession: {
      findUniqueOrThrow: vi.fn(async () => session),
      updateMany: vi.fn(async ({ data }) => {
        session.status = data.status;
        session.version += 1;
        return { count: 1 };
      }),
    },
    standardMessageVersion: {
      findMany: vi.fn(async () => [
        {
          id: '10000000-0000-4000-8000-000000000008',
          content: 'Merhaba{{studentDisplayName}}, {{startsAtText}} {{durationText}}',
          placeholders: ['studentDisplayName', 'startsAtText', 'durationText'],
          effectiveAt: new Date('2026-06-01T00:00:00Z'),
          variant: {
            locale: 'tr-TR',
            curriculumStage: null,
            slot: null,
            priority: 0,
            requiresStudentName: true,
            providerBinding: {
              status: 'APPROVED',
              templateName: 'practice_reminder',
              providerLocale: 'tr',
            },
          },
        },
      ]),
    },
    systemEventOccurrence: { create: occurrenceCreate },
    messageIntent: { create: intentCreate },
    outboxEvent: { create: outboxCreate },
  };
  const prisma = {
    $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaClient;
  return { prisma, session, config, occurrenceCreate, intentCreate, outboxCreate };
}

describe('practice lifecycle', () => {
  it('atomically creates the reminder intent and outbox only once per session version', async () => {
    const value = fixture();
    const clock = new FakeClock('2026-07-01T04:50:00Z');
    await expect(
      createPracticeLifecycleIntent(
        value.prisma,
        clock,
        value.config,
        value.session.id,
        PracticeSessionStatus.SCHEDULED,
        1,
        'PRACTICE_REMINDER',
      ),
    ).resolves.toBe(true);
    expect(value.session.status).toBe(PracticeSessionStatus.REMINDED);
    expect(value.occurrenceCreate).toHaveBeenCalledOnce();
    expect(value.intentCreate).toHaveBeenCalledOnce();
    expect(value.outboxCreate).toHaveBeenCalledOnce();
    expect(value.intentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            rendered: expect.stringContaining('Merhaba Dilge'),
            providerTemplateParameters: [' Dilge', '1.07.2026 08:00', '15 dakika'],
          }),
        }),
      }),
    );
    await expect(
      createPracticeLifecycleIntent(
        value.prisma,
        clock,
        value.config,
        value.session.id,
        PracticeSessionStatus.SCHEDULED,
        1,
        'PRACTICE_REMINDER',
      ),
    ).resolves.toBe(false);
    expect(value.intentCreate).toHaveBeenCalledOnce();
  });
});
