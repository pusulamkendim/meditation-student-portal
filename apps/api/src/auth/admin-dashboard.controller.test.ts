import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';
import { FakeClock, FieldEncryption } from '@meditation/core';

import {
  AdminDashboardController,
  calculateNonCompletionStreak,
} from './admin-dashboard.controller.js';
import type { PrismaService } from '../database/prisma.service.js';

describe('AdminDashboardController', () => {
  it('clears the warning streak as soon as the latest concluded practice is completed', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    expect(
      calculateNonCompletionStreak(
        [
          { startAt: new Date('2026-08-02T09:00:00.000Z'), status: 'MISSED' },
          { startAt: new Date('2026-08-03T09:00:00.000Z'), status: 'SKIPPED' },
          { startAt: new Date('2026-08-04T09:00:00.000Z'), status: 'MISSED' },
          { startAt: new Date('2026-08-05T09:00:00.000Z'), status: 'COMPLETED' },
          { startAt: new Date('2026-08-05T21:00:00.000Z'), status: 'AWAITING_RESPONSE' },
        ],
        now,
      ),
    ).toBe(0);
  });

  it('excludes test profiles and calculates the current seven-day student pulse', async () => {
    const clock = new FakeClock('2026-08-05T12:00:00.000Z');
    const encryption = new FieldEncryption(new Map([['test', randomBytes(32)]]), 'test');
    const realId = '11111111-1111-4111-8111-111111111111';
    const testId = '22222222-2222-4222-8222-222222222222';
    const realName = encryption.encrypt('Duygu Bulut', `student:${realId}:name`);
    const testName = encryption.encrypt('Smoke TestUser', `student:${testId}:name`);
    const pulse = encryption.encrypt(
      JSON.stringify({
        tone: 'NEUTRAL',
        confidence: 0.8,
        summary: 'Program düzeni dalgalı görünüyor.',
        strengths: ['Pratiğe yanıt veriyor.'],
        challenges: ['Düzenli sürdürmekte zorlanıyor.'],
        coachTopics: ['Programı sadeleştirme'],
        suggestedAction: 'SIMPLIFY',
        safetyConcern: false,
      }),
      `student-pulse:${realId}:2026-08-05`,
    );
    const session = (
      date: string,
      status: 'COMPLETED' | 'SKIPPED' | 'MISSED' | 'AWAITING_RESPONSE',
    ) => ({
      serviceDate: new Date(`${date}T00:00:00.000Z`),
      startAt: new Date(`${date}T09:00:00.000Z`),
      status,
      durationMinutes: 20,
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
              session('2026-07-28', 'COMPLETED'),
              session('2026-08-01', 'AWAITING_RESPONSE'),
              session('2026-08-02', 'COMPLETED'),
              session('2026-08-03', 'SKIPPED'),
              session('2026-08-04', 'MISSED'),
              session('2026-08-04', 'MISSED'),
              session('2026-08-05', 'COMPLETED'),
              session('2026-08-05', 'AWAITING_RESPONSE'),
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
            pulseInsights: [
              {
                periodStart: new Date('2026-07-29T00:00:00.000Z'),
                periodEndExclusive: new Date('2026-08-05T00:00:00.000Z'),
                tone: 'NEUTRAL',
                confidence: 0.8,
                suggestedAction: 'SIMPLIFY',
                safetyConcern: false,
                reflectionCount: 1,
                analysisEncrypted: new Uint8Array(pulse.ciphertext),
                analysisKeyId: pulse.keyId,
                createdAt: new Date('2026-08-05T03:15:00.000Z'),
              },
            ],
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
            pulseInsights: [],
          },
        ]),
      },
      payment: { count: vi.fn().mockResolvedValue(0) },
      inboxEvent: { findMany: vi.fn().mockResolvedValue([]) },
      messageIntent: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      handoff: { findMany: vi.fn().mockResolvedValue([]) },
      weeklyMeeting: { findMany: vi.fn().mockResolvedValue([]) },
      corporateInquiry: { count: vi.fn().mockResolvedValue(0) },
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
      missed: 2,
      pending: 1,
      completedMinutes: 20,
      completionRate: 25,
      responseRate: 50,
      reflectionRate: 100,
      previous: { completedMinutes: 20 },
    });
    expect(result.studentPulse).toHaveLength(1);
    expect(result.studentPulse[0]).toMatchObject({
      id: realId,
      fullName: 'Duygu Bulut',
      nonCompletionStreak: 0,
      recommendation: 'Son 7 günlük yanıtlara göre programı tek seansa indirmeyi değerlendirin.',
      insight: {
        tone: 'NEUTRAL',
        summary: 'Program düzeni dalgalı görünüyor.',
        coachTopics: ['Programı sadeleştirme'],
      },
    });
    expect(result.dailyCheckIns).toMatchObject({
      responded: 1,
      reflections: 1,
      unanswered: 1,
      students: [
        {
          studentId: realId,
          fullName: 'Duygu Bulut',
          responded: 1,
          reflections: 1,
          unanswered: 1,
        },
      ],
    });
    expect(prisma.messageIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: {
            gte: new Date('2026-08-04T21:00:00.000Z'),
            lt: new Date('2026-08-05T21:00:00.000Z'),
          },
        }),
      }),
    );
    expect(prisma.weeklyMeeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startsAt: {
            gte: new Date('2026-08-04T21:00:00.000Z'),
            lt: new Date('2026-08-05T21:00:00.000Z'),
          },
        },
      }),
    );
  });
});
