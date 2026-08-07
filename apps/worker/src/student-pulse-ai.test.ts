import { randomBytes } from 'node:crypto';

import { FakeClock, FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import { StudentPulseAiProcessor } from './student-pulse-ai.js';

vi.mock('./llm-budget.js', () => ({
  reserveBudget: vi.fn().mockResolvedValue({}),
  settleBudget: vi.fn().mockResolvedValue({ count: 1 }),
  releaseBudget: vi.fn().mockResolvedValue({ count: 1 }),
}));

describe('StudentPulseAiProcessor', () => {
  it('stores one daily non-clinical pulse from the last seven full days', async () => {
    const clock = new FakeClock('2026-08-06T06:00:00.000Z');
    const key = randomBytes(32);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const reflection = encryption.encrypt(
      'Bugün daha sakindim, düşünceler geldiğinde nefese geri dönebildim.',
      'practice:session-1:reflection',
    );
    const createInsight = vi.fn().mockResolvedValue({});
    const createUsage = vi.fn().mockResolvedValue({});
    const generateJson = vi.fn().mockResolvedValue({
      output: {
        tone: 'POSITIVE',
        confidence: 0.84,
        summary: 'Pratikte sakinlik ve geri dönme becerisi öne çıkıyor.',
        strengths: ['Dikkat dağıldığında pratiğe geri dönebiliyor.'],
        challenges: [],
        coachTopics: ['Sürekliliği koruma'],
        suggestedAction: 'KEEP',
        safetyConcern: false,
      },
      providerRequestId: 'provider-1',
      inputTokens: 120,
      outputTokens: 60,
      totalTokens: 180,
    });
    const prisma = {
      studentPulseInsight: { findUnique: vi.fn().mockResolvedValue(null) },
      student: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'student-1',
          status: 'ACTIVE',
          fullNameEncrypted: null,
          fullNameKeyId: null,
          phoneEncrypted: null,
          phoneKeyId: null,
        }),
      },
      featureFlagConfig: {
        findUnique: vi.fn().mockResolvedValue({
          key: 'llm.student-pulse.enabled',
          enabled: true,
          rolloutPercentage: 100,
          scope: 'GLOBAL',
          subjectIds: [],
        }),
      },
      llmTaskConfig: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          enabled: true,
          promptVersionId: 'prompt-1',
          promptVersion: { content: 'Return a student pulse as JSON.' },
          primaryModel: {
            id: 'model-1',
            providerId: 'provider-1',
            providerModelId: 'gemini-test',
            outputTokenLimit: 2048,
            status: 'ACTIVE',
            provider: { status: 'ENABLED', adapterId: 'gemini' },
            priceVersions: [],
          },
        }),
      },
      consent: {
        findMany: vi.fn().mockResolvedValue([
          { scope: 'AGENT_REPLY_AI', status: 'GRANTED' },
          { scope: 'REFLECTION_STORAGE', status: 'GRANTED' },
        ]),
      },
      practiceSession: {
        findMany: vi.fn().mockResolvedValue([
          { serviceDate: new Date('2026-08-04T00:00:00.000Z'), status: 'COMPLETED' },
          { serviceDate: new Date('2026-07-28T00:00:00.000Z'), status: 'MISSED' },
        ]),
      },
      practiceReflection: {
        findMany: vi.fn().mockResolvedValue([
          {
            contentEncrypted: new Uint8Array(reflection.ciphertext),
            contentKeyId: reflection.keyId,
            practiceSession: {
              id: 'session-1',
              serviceDate: new Date('2026-08-04T00:00:00.000Z'),
            },
          },
        ]),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          studentPulseInsight: { create: createInsight },
          llmUsageLog: { create: createUsage },
        }),
      ),
      llmBudgetReservation: { updateMany: vi.fn() },
      llmUsageLog: {
        findFirst: vi.fn().mockResolvedValue({ attempt: 1 }),
        create: vi.fn(),
      },
    };
    const config = {
      DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
      ACTIVE_DATA_KEY_ID: 'test',
      GEMINI_API_KEY: 'gemini-key',
    } as ApplicationConfig;
    const processor = new StudentPulseAiProcessor(
      prisma as never,
      config,
      clock,
      () => ({ generateJson }) as never,
    );

    await expect(processor.processStudent('student-1')).resolves.toBe('processed');

    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSchema: 'student-pulse',
        maxOutputTokens: 700,
        systemPrompt: expect.stringContaining('"suggestedAction": "KEEP" | "SIMPLIFY" | "DISCUSS"'),
      }),
    );
    expect(createInsight).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-1',
        tone: 'POSITIVE',
        suggestedAction: 'KEEP',
        reflectionCount: 1,
      }),
    });
    expect(createUsage).toHaveBeenCalledWith({
      data: expect.objectContaining({ task: 'STUDENT_PULSE', attempt: 2, totalTokens: 180 }),
    });
  });

  it('does not call the model twice for the same student and service day', async () => {
    const key = randomBytes(32);
    const generateJson = vi.fn();
    const processor = new StudentPulseAiProcessor(
      {
        studentPulseInsight: { findUnique: vi.fn().mockResolvedValue({ id: 'existing' }) },
      } as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
        GEMINI_API_KEY: 'gemini-key',
      } as ApplicationConfig,
      new FakeClock('2026-08-06T06:00:00.000Z'),
      () => ({ generateJson }) as never,
    );

    await expect(processor.processStudent('student-1')).resolves.toBe('ignored');
    expect(generateJson).not.toHaveBeenCalled();
  });
});
