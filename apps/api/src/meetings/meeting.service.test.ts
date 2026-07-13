import { MeetingStatus, SubscriptionStatus } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import { MeetingService, meetingCreditDelta } from './meeting.service.js';

const now = new Date('2026-07-13T07:00:00.000Z');

function createMeetingService(meetingSeries: Array<{ id: string }> = []) {
  const subscription = {
    id: '10000000-0000-4000-8000-000000000001',
    studentId: '10000000-0000-4000-8000-000000000002',
    status: SubscriptionStatus.ACTIVE,
    endExclusive: new Date('2026-08-13T00:00:00.000Z'),
    meetingSeries,
    student: {
      id: '10000000-0000-4000-8000-000000000002',
      timezone: 'Europe/Istanbul',
      fullNameEncrypted: null,
      fullNameKeyId: null,
    },
  };
  const meetings = Array.from({ length: 4 }, (_, index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    occurrenceNumber: index + 1,
    startsAt: new Date(Date.UTC(2026, 6, 14 + index * 7, 7)),
    endsAt: new Date(Date.UTC(2026, 6, 14 + index * 7, 8)),
    status: MeetingStatus.SCHEDULED,
    version: 1,
  }));
  const series = {
    id: '30000000-0000-4000-8000-000000000001',
    studentId: subscription.studentId,
    subscriptionPeriodId: subscription.id,
    timezone: subscription.student.timezone,
    recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
    googleSeriesId: null,
    version: 1,
    meetUrlEncrypted: null,
    meetUrlKeyId: null,
    conferenceStatus: 'PENDING',
    student: subscription.student,
    meetings,
  };
  const tx = {
    subscriptionPeriod: { findUnique: vi.fn().mockResolvedValue(subscription) },
    meetingSeries: { create: vi.fn().mockResolvedValue(series) },
    meetingCreditEvent: {
      findFirst: vi.fn().mockResolvedValue({ id: 'existing-package-grant' }),
      create: vi.fn(),
    },
    meetingScheduleEvent: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
  const config = {
    NODE_ENV: 'test',
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ primary: Buffer.alloc(32).toString('base64') }),
    ACTIVE_DATA_KEY_ID: 'primary',
  };
  return {
    service: new MeetingService(prisma as never, { now: () => now } as never, config as never),
    tx,
  };
}

describe('meeting credit ledger rules', () => {
  it('consumes one credit for completed/no-show and reverses corrections', () => {
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.COMPLETED)).toBe(-1);
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.NO_SHOW)).toBe(-1);
    expect(meetingCreditDelta(MeetingStatus.COMPLETED, MeetingStatus.SCHEDULED)).toBe(1);
    expect(meetingCreditDelta(MeetingStatus.NO_SHOW, MeetingStatus.COMPLETED)).toBe(0);
    expect(meetingCreditDelta(MeetingStatus.SCHEDULED, MeetingStatus.CANCELLED)).toBe(0);
  });
});

describe('MeetingService.createSeries', () => {
  it('creates four meetings when the subscription relation is an empty list', async () => {
    const { service, tx } = createMeetingService();

    await expect(
      service.createSeries(
        '10000000-0000-4000-8000-000000000001',
        new Date('2026-07-14T07:00:00.000Z'),
        '40000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toMatchObject({ meetings: expect.arrayContaining([expect.any(Object)]) });

    expect(tx.meetingSeries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meetings: {
            create: expect.arrayContaining([expect.objectContaining({ occurrenceNumber: 1 })]),
          },
        }),
      }),
    );
  });

  it('rejects a subscription that already has a series', async () => {
    const { service, tx } = createMeetingService([{ id: 'existing-series' }]);

    await expect(
      service.createSeries(
        '10000000-0000-4000-8000-000000000001',
        new Date('2026-07-14T07:00:00.000Z'),
        '40000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toThrow('already has a meeting series');
    expect(tx.meetingSeries.create).not.toHaveBeenCalled();
  });
});
