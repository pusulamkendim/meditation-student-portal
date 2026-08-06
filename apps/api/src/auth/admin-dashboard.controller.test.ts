import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { FakeClock, FieldEncryption } from '@meditation/core';

import { AdminDashboardController } from './admin-dashboard.controller.js';
import type { PrismaService } from '../database/prisma.service.js';

describe('AdminDashboardController', () => {
  it('excludes test profiles and calculates the current seven-day student pulse', async () => {
    const clock = new FakeClock('2026-08-05T12:00:00.000Z');
    const encryption = new FieldEncryption(new Map([['test', randomBytes(32)]]), 'test');
    const realId = '11111111-1111-4111-8111-111111111111';
    const testId = '22222222-2222-4222-8222-222222222222';
    const realName = encryption.encrypt('Duygu Bulut', `student:${realId}:name`);
    const testName = encryption.encrypt('Smoke TestUser', `student:${testId}:name`);
    const session = (date: string, status: 'COMPLETED' | 'SKIPPED' | 'MISSED') => ({
      serviceDate: new Date(`${date}T00:00:00.000Z`),
      status,
      reflection: status === 'COMPLETED' ? { id: `reflection-${date}` } : null,
      practiceSlot: { slotKey: 'MORNING' },
    });
    const prisma = {
      student: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: realId,
            fullNameEncrypted: new Uint8Array(realName.ciphertext),
            fullNameKeyId: realName.keyId,
            curriculumStage: 'WEEK_1',
            defaultChannelIdentity: {
              lastInboundAt: new Date('2026-08-05T10:00:00.000Z'),
              channelAccount: { type: 'TELEGRAM' },
            },
            practiceSessions: [
              session('2026-08-03', 'COMPLETED'),
              session('2026-08-04', 'MISSED'),
              session('2026-08-05', 'SKIPPED'),
              session('2026-07-29', 'COMPLETED'),
            ],
            practicePlans: [
              {
                slots: [
                  { slotKey: 'MORNING', localTime: '09:00', durationMinutes: 20 },
                  { slotKey: 'EVENING', localTime: '21:00', durationMinutes: 20 },
                ],
              },
            ],
            handoffs: [],
          },
          {
            id: testId,
            fullNameEncrypted: new Uint8Array(testName.ciphertext),
            fullNameKeyId: testName.keyId,
            curriculumStage: 'WEEK_1',
            defaultChannelIdentity: null,
            practiceSessions: [session('2026-08-05', 'COMPLETED')],
            practicePlans: [],
            handoffs: [],
          },
        ]),
      },
      payment: { count: vi.fn().mockResolvedValue(0) },
      inboxEvent: { findMany: vi.fn().mockResolvedValue([]) },
      messageIntent: { findMany: vi.fn().mockResolvedValue([]) },
      handoff: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyMeeting: { findMany: vi.fn().mockResolvedValue([]) },
      readingAssignment: { groupBy: vi.fn().mockResolvedValue([]) },
      readingPublicVisit: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { viewCount: null, pdfDownloadCount: null, whatsappClickCount: null },
          _count: { _all: 0 },
        }),
      },
      meditationPublicVisit: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            viewCount: null,
            startCount: null,
            completionCount: null,
            ctaClickCount: null,
          },
          _count: { _all: 0 },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const controller = new AdminDashboardController(
      prisma as unknown as PrismaService,
      clock,
      encryption,
    );

    const result = await controller.dashboard({ admin: { id: 'admin-id' } } as never);

    expect(result.counts.activeStudents).toBe(1);
    expect(result.practice).toMatchObject({
      completed: 1,
      skipped: 1,
      missed: 1,
      completionRate: 33.3,
      responseRate: 66.7,
      reflectionRate: 100,
    });
    expect(result.studentPulse).toHaveLength(1);
    expect(result.studentPulse[0]).toMatchObject({
      id: realId,
      fullName: 'Duygu Bulut',
      recommendation: 'Son 7 günlük yanıtlara göre programı tek seansa indirmeyi değerlendirin.',
    });
  });
});
