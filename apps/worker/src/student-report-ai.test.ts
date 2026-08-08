import { randomBytes } from 'node:crypto';

import { FakeClock, FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import { StudentReportAiProcessor } from './student-report-ai.js';

vi.mock('./llm-budget.js', () => ({
  reserveBudget: vi.fn().mockResolvedValue({}),
  settleBudget: vi.fn().mockResolvedValue({ count: 1 }),
  releaseBudget: vi.fn().mockResolvedValue({ count: 1 }),
}));

describe('StudentReportAiProcessor', () => {
  it('stores an evidence-backed draft and preserves the selected reflection verbatim', async () => {
    const key = randomBytes(32);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const reflectionId = '00000000-0000-4000-8000-000000000001';
    const reflectionText = 'Sabah oturduğumda nefesime daha kolay dönebildim.';
    const reflection = encryption.encrypt(reflectionText, 'practice:session-1:reflection');
    const updateReport = vi.fn().mockResolvedValue({ count: 1 });
    const createUsage = vi.fn().mockResolvedValue({});
    const generateJson = vi.fn().mockResolvedValue({
      output: {
        subtitle: 'Yumuşak bir ritim kurduğun hafta.',
        featuredReflectionId: reflectionId,
        gentleObservation: {
          text: 'Sabah pratiklerinde geri dönme becerin öne çıkıyor.',
          evidenceRefs: [`reflection:${reflectionId}`],
        },
        supportPoint: {
          text: 'Ritmi birlikte ve acele etmeden sürdürebiliriz.',
          evidenceRefs: ['invented:evidence'],
        },
        weeklyEvaluation: {
          text: 'Bu hafta pratiğin içinde yeniden başlama deneyimi belirginleşti.',
          evidenceRefs: ['practice:summary'],
        },
        internal: { confidence: 0.84, insufficientEvidence: false, safetyConcern: false },
      },
      providerRequestId: 'provider-request',
      inputTokens: 180,
      outputTokens: 90,
      totalTokens: 270,
    });
    const prisma = {
      studentReportCard: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'report-1',
          studentId: 'student-1',
          periodStart: new Date('2026-07-31T00:00:00.000Z'),
          periodEndExclusive: new Date('2026-08-07T00:00:00.000Z'),
          status: 'DRAFT',
          aiStatus: 'PENDING',
          operationId: 'student-report-operation',
          version: 1,
          snapshot: { evidenceIds: ['practice:summary'], pulse: null },
          student: { id: 'student-1', fullNameEncrypted: null, fullNameKeyId: null },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      featureFlagConfig: {
        findUnique: vi.fn().mockResolvedValue({
          key: 'llm.student-report.enabled',
          enabled: true,
          rolloutPercentage: 100,
          scope: 'GLOBAL',
          subjectIds: [],
        }),
      },
      llmTaskConfig: {
        findUnique: vi.fn().mockResolvedValue({
          enabled: true,
          promptVersionId: 'prompt-1',
          promptVersion: { content: 'Return a student report as JSON.' },
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
      practiceReflection: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: reflectionId,
            contentEncrypted: new Uint8Array(reflection.ciphertext),
            contentKeyId: reflection.keyId,
            practiceSession: {
              id: 'session-1',
              serviceDate: new Date('2026-08-04T00:00:00.000Z'),
              practiceSlot: { slotKey: 'MORNING' },
              meditationType: { title: 'Anapanasati' },
            },
          },
        ]),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          studentReportCard: { updateMany: updateReport },
          llmUsageLog: { create: createUsage },
        }),
      ),
      llmBudgetReservation: { updateMany: vi.fn() },
    };
    const processor = new StudentReportAiProcessor(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
        GEMINI_API_KEY: 'gemini-key',
      } as ApplicationConfig,
      new FakeClock('2026-08-07T08:00:00.000Z'),
      () => ({ generateJson }) as never,
    );

    await expect(processor.process('report-1', 'student-report-operation')).resolves.toBe(
      'processed',
    );
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSchema: 'student-report',
        temperature: 0.15,
        systemPrompt: expect.stringContaining(
          '"featuredReflectionId": UUID string from reflectionCandidates or null',
        ),
      }),
    );
    const update = updateReport.mock.calls[0]?.[0] as {
      data: { contentEncrypted: Uint8Array; contentKeyId: string; featuredReflectionId: string };
    };
    const saved = JSON.parse(
      encryption.decrypt(
        { ciphertext: Buffer.from(update.data.contentEncrypted), keyId: update.data.contentKeyId },
        'student-report:report-1:v2',
      ),
    ) as {
      featuredReflectionQuote: string;
      supportPoint: { evidenceRefs: string[] };
    };
    expect(saved.featuredReflectionQuote).toBe(reflectionText);
    expect(saved.supportPoint.evidenceRefs).toEqual(['practice:summary']);
    expect(update.data.featuredReflectionId).toBe(reflectionId);
    expect(createUsage).toHaveBeenCalledWith({
      data: expect.objectContaining({ task: 'STUDENT_REPORT', totalTokens: 270 }),
    });
  });
});
