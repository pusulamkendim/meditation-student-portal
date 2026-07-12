import { randomBytes } from 'node:crypto';
import { FakeClock } from '@meditation/core';
import { PracticeSessionStatus, type PrismaClient } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';
import { createPracticeLifecycleIntent } from './practice-lifecycle.js';

function fixture() {
  const session = {
    id: '10000000-0000-4000-8000-000000000001',
    studentId: '10000000-0000-4000-8000-000000000002',
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
          content: '{{startsAtText}} {{durationText}}',
          placeholders: ['startsAtText', 'durationText'],
          effectiveAt: new Date('2026-06-01T00:00:00Z'),
          variant: {
            locale: 'tr-TR',
            curriculumStage: null,
            slot: null,
            priority: 0,
            requiresStudentName: false,
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
  return { prisma, session, occurrenceCreate, intentCreate, outboxCreate };
}

describe('practice lifecycle', () => {
  it('atomically creates the reminder intent and outbox only once per session version', async () => {
    const value = fixture();
    const clock = new FakeClock('2026-07-01T04:50:00Z');
    const config = { LOOKUP_HMAC_KEY: randomBytes(32).toString('base64') };
    await expect(
      createPracticeLifecycleIntent(
        value.prisma,
        clock,
        config,
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
    await expect(
      createPracticeLifecycleIntent(
        value.prisma,
        clock,
        config,
        value.session.id,
        PracticeSessionStatus.SCHEDULED,
        1,
        'PRACTICE_REMINDER',
      ),
    ).resolves.toBe(false);
    expect(value.intentCreate).toHaveBeenCalledOnce();
  });
});
