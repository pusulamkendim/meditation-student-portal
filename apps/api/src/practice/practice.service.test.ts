import { describe, expect, it, vi } from 'vitest';
import { PracticeSessionStatus } from '@meditation/database';
import { PracticeService } from './practice.service.js';

const now = new Date('2026-07-13T07:00:00.000Z');
const session = {
  id: '10000000-0000-4000-8000-000000000001',
  studentId: '10000000-0000-4000-8000-000000000002',
  practicePlanId: '10000000-0000-4000-8000-000000000003',
  serviceDate: new Date('2026-07-13T00:00:00.000Z'),
  startAt: new Date('2026-07-13T08:00:00.000Z'),
  durationMinutes: 20,
  status: PracticeSessionStatus.SCHEDULED,
  version: 2,
  student: {
    timezone: 'Europe/Istanbul',
    preferredLocale: 'tr-TR',
    curriculumStage: 'WEEK_1',
    defaultChannelIdentityId: null,
  },
};

function createService(overrides: Record<string, unknown> = {}) {
  const tx = {
    practiceSession: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...session, ...overrides }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    messageIntent: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
  const clock = { now: () => now };
  const messages = { createIntent: vi.fn() };
  const config = {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ primary: Buffer.alloc(32).toString('base64') }),
    ACTIVE_DATA_KEY_ID: 'primary',
    LOOKUP_HMAC_KEY: Buffer.alloc(32).toString('base64'),
  };
  return {
    service: new PracticeService(
      prisma as never,
      clock as never,
      config as never,
      messages as never,
    ),
    tx,
  };
}

describe('PracticeService.reschedule', () => {
  it('moves an upcoming session within the same local day and suppresses old intents', async () => {
    const { service, tx } = createService();
    const startAt = new Date('2026-07-13T10:00:00.000Z');

    await expect(
      service.reschedule(session.id, startAt, session.version, 'Öğrenci talebi', 'admin-1'),
    ).resolves.toMatchObject({ id: session.id, status: PracticeSessionStatus.SCHEDULED });

    expect(tx.practiceSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: session.version }),
        data: expect.objectContaining({ startAt, status: PracticeSessionStatus.SCHEDULED }),
      }),
    );
    expect(tx.messageIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'SUPPRESSED', suppressionReason: 'SESSION_RESCHEDULED' },
      }),
    );
  });

  it('rejects a different local day or stale version before updating', async () => {
    const { service, tx } = createService();
    await expect(
      service.reschedule(
        session.id,
        new Date('2026-07-14T10:00:00.000Z'),
        session.version,
        'Tarih değişikliği',
        'admin-1',
      ),
    ).rejects.toThrow('same local day');
    expect(tx.practiceSession.updateMany).not.toHaveBeenCalled();

    const stale = createService({ version: session.version + 1 });
    await expect(
      stale.service.reschedule(
        session.id,
        new Date('2026-07-13T10:00:00.000Z'),
        session.version,
        'Çakışma',
        'admin-1',
      ),
    ).rejects.toThrow('state conflict');
  });
});
