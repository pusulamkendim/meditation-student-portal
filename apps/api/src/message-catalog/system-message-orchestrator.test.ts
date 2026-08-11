import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '@meditation/core';
import type { PrismaService } from '../database/prisma.service.js';

import { SystemMessageOrchestrator } from './system-message-orchestrator.js';

describe('SystemMessageOrchestrator', () => {
  it('resolves the message variant for the actual channel identity', async () => {
    const now = new Date('2026-08-11T16:32:00.000Z');
    const findVersions = vi.fn().mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000001',
        content:
          'Pratik programını güncelledim: {{scheduleSummary}}. Bundan sonraki hatırlatmalarını yeni programa göre göndereceğim.',
        placeholders: ['scheduleSummary'],
        effectiveAt: now,
        variant: {
          locale: 'tr-TR',
          curriculumStage: null,
          slot: null,
          priority: 0,
          requiresStudentName: false,
          providerBinding: {
            status: 'APPROVED',
            templateName: 'practice_plan_updated_tr',
            providerLocale: 'tr',
          },
        },
      },
    ]);
    const createIntent = vi.fn().mockResolvedValue({
      id: '20000000-0000-4000-8000-000000000001',
    });
    const transaction = {
      systemEventOccurrence: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000001',
        }),
      },
      studentChannelIdentity: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          studentId: '40000000-0000-4000-8000-000000000001',
          channelAccount: { type: 'WHATSAPP' },
        }),
      },
      standardMessageVersion: { findMany: findVersions },
      student: { findUniqueOrThrow: vi.fn().mockResolvedValue({ version: 3 }) },
      messageIntent: { create: createIntent },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const clock = { now: () => now } as Clock;
    const orchestrator = new SystemMessageOrchestrator(prisma, clock);

    await orchestrator.createIntent({
      eventKey: 'PRACTICE_PLAN_UPDATED',
      studentId: '40000000-0000-4000-8000-000000000001',
      channelIdentityId: '50000000-0000-4000-8000-000000000001',
      idempotencyKey: 'practice-plan-updated:test',
      locale: 'tr-TR',
      variables: { scheduleSummary: 'Pazartesi; sabah 08:00 (10 dk)' },
    });

    expect(findVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          variant: expect.objectContaining({ channel: 'WHATSAPP' }),
        }),
      }),
    );
    expect(createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            providerTemplateName: 'practice_plan_updated_tr',
            providerTemplateLocale: 'tr',
            providerTemplateParameters: ['Pazartesi; sabah 08:00 (10 dk)'],
          }),
        }),
      }),
    );
  });
});
