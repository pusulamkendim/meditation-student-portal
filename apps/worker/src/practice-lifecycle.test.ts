import { randomBytes } from 'node:crypto';
import { buildWhatsAppTemplateDefinition, FakeClock, FieldEncryption } from '@meditation/core';
import { PracticeSessionStatus, type PrismaClient } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';
import { createPracticeLifecycleIntent, processPracticeLifecycle } from './practice-lifecycle.js';

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
    ADMIN_ORIGIN: 'https://portal.example.test',
  };
  const session = {
    id: '10000000-0000-4000-8000-000000000001',
    studentId,
    practicePlanId: '10000000-0000-4000-8000-000000000003',
    practiceSlotId: '10000000-0000-4000-8000-000000000004',
    serviceDate: new Date('2026-07-01T00:00:00Z'),
    startAt: new Date('2026-07-01T05:00:00Z'),
    durationMinutes: 15,
    status: PracticeSessionStatus.SCHEDULED as PracticeSessionStatus,
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
  const accessLinkUpsert = vi.fn(async ({ create, update }) => ({ ...create, ...update }));
  const tx = {
    practiceSession: {
      findUniqueOrThrow: vi.fn(async () => session),
      updateMany: vi.fn(async ({ data }) => {
        session.status = data.status;
        session.version += 1;
        return { count: 1 };
      }),
    },
    practiceAccessLink: { upsert: accessLinkUpsert },
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
              contentFingerprint: buildWhatsAppTemplateDefinition(
                'PRACTICE_REMINDER',
                'Merhaba{{studentDisplayName}}, {{startsAtText}} {{durationText}}',
                'tr-TR',
              ).contentFingerprint,
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
  return {
    prisma,
    session,
    config,
    tx,
    occurrenceCreate,
    intentCreate,
    outboxCreate,
    accessLinkUpsert,
  };
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
    expect(value.occurrenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variables: expect.objectContaining({
            practiceUrl: expect.stringMatching(
              /^https:\/\/portal\.example\.test\/m#[A-Za-z0-9_-]{22}$/u,
            ),
          }),
        }),
      }),
    );
    expect(value.accessLinkUpsert).toHaveBeenCalledOnce();
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

  it('creates a check-in for a named student without adding an unsupported name variable', async () => {
    const value = fixture();
    value.session.status = PracticeSessionStatus.REMINDED;
    value.session.version = 2;
    value.tx.standardMessageVersion.findMany.mockResolvedValueOnce([
      {
        id: '10000000-0000-4000-8000-000000000009',
        content: 'Pratiğin nasıl geçti? Planlanan süre {{durationText}}.',
        placeholders: ['durationText'],
        effectiveAt: new Date('2026-06-01T00:00:00Z'),
        variant: {
          locale: 'tr-TR',
          curriculumStage: null,
          slot: null,
          priority: 0,
          requiresStudentName: false,
          providerBinding: {
            status: 'APPROVED',
            templateName: 'practice_checkin',
            providerLocale: 'tr',
            contentFingerprint: buildWhatsAppTemplateDefinition(
              'PRACTICE_CHECKIN',
              'Pratiğin nasıl geçti? Planlanan süre {{durationText}}.',
              'tr-TR',
            ).contentFingerprint,
          },
        },
      },
    ] as never);

    await expect(
      createPracticeLifecycleIntent(
        value.prisma,
        new FakeClock('2026-07-01T05:30:00Z'),
        value.config,
        value.session.id,
        PracticeSessionStatus.REMINDED,
        2,
        'PRACTICE_CHECKIN',
      ),
    ).resolves.toBe(true);
    expect(value.occurrenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ variables: { durationText: '15 dakika' } }),
      }),
    );
    expect(value.intentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            providerTemplateParameters: ['15 dakika'],
          }),
        }),
      }),
    );
  });

  it('does not mark awaiting practices as missed when the local day closes', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: '10000000-0000-4000-8000-000000000010',
          status: PracticeSessionStatus.AWAITING_RESPONSE,
          version: 2,
          serviceDate: new Date('2026-07-01T00:00:00Z'),
          student: { timezone: 'Europe/Istanbul' },
        },
      ]);
    const updateMany = vi.fn();
    const prisma = {
      practiceSession: { findMany, updateMany },
    } as unknown as PrismaClient;
    const clock = new FakeClock('2026-07-02T00:30:00Z');

    await processPracticeLifecycle(prisma, clock, fixture().config as never);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
