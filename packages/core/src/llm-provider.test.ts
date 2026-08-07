import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiPaidAdapter } from './llm-provider.js';
import type { StudentPulseOutput, StudentReportOutput } from './llm.js';

afterEach(() => vi.unstubAllGlobals());

describe('GeminiPaidAdapter', () => {
  it('parses structured output and usage metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          action: 'ANSWER',
                          confidence: 99,
                          answer: '08:00',
                          usedSections: ['PRACTICE'],
                          asOf: '2026-07-12T10:00:00.000Z',
                          evidenceRecordHashes: [],
                          handoffRequired: false,
                        }),
                      },
                    ],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
            }),
            { status: 200, headers: { 'x-request-id': 'test-request' } },
          ),
      ),
    );
    const result = await new GeminiPaidAdapter('test-key').generateStructured({
      model: {
        id: 'model',
        providerId: 'provider',
        providerModelId: 'gemini-test',
        status: 'ACTIVE',
      },
      systemPrompt: 'system',
      userPrompt: 'user',
      maxOutputTokens: 128,
      operationId: 'operation',
    });
    expect(result.output.answer).toBe('08:00');
    expect(result.totalTokens).toBe(14);
    expect(result.providerRequestId).toBe('test-request');
  });

  it('classifies provider throttling as transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );
    await expect(
      new GeminiPaidAdapter('test-key').generateStructured({
        model: {
          id: 'model',
          providerId: 'provider',
          providerModelId: 'gemini-test',
          status: 'ACTIVE',
        },
        systemPrompt: 'system',
        userPrompt: 'user',
        maxOutputTokens: 128,
        operationId: 'operation',
      }),
    ).rejects.toMatchObject({ code: 'TRANSIENT' });
  });

  it('validates student pulse structured output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          tone: 'NEUTRAL',
                          confidence: 0.78,
                          summary: 'Pratik deneyimi dengeli ilerliyor.',
                          strengths: ['Duyumları fark ediyor.'],
                          challenges: ['Dikkat zaman zaman dağılıyor.'],
                          coachTopics: ['Dikkati geri getirme'],
                          suggestedAction: 'KEEP',
                          safetyConcern: false,
                        }),
                      },
                    ],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15 },
            }),
            { status: 200 },
          ),
      ),
    );

    const result = await new GeminiPaidAdapter('test-key').generateJson<StudentPulseOutput>({
      model: {
        id: 'model',
        providerId: 'provider',
        providerModelId: 'gemini-test',
        status: 'ACTIVE',
      },
      systemPrompt: 'system',
      userPrompt: 'user',
      maxOutputTokens: 700,
      operationId: 'student-pulse-operation',
      outputSchema: 'student-pulse',
    });

    expect(result.output).toMatchObject({ tone: 'NEUTRAL', suggestedAction: 'KEEP' });
    expect(result.totalTokens).toBe(35);
  });

  it('validates evidence-backed student report output', async () => {
    const output = {
      subtitle: 'Sakin ve düzenli geçen bir hafta.',
      featuredReflectionId: null,
      gentleObservation: {
        text: 'Sabah pratiklerinde devamlılık görülüyor.',
        evidenceRefs: ['practice:summary'],
      },
      supportPoint: {
        text: 'Akşam düzenini birlikte değerlendirebiliriz.',
        evidenceRefs: ['practice:comparison'],
      },
      weeklyEvaluation: { text: 'Bu hafta ritmini korudun.', evidenceRefs: ['practice:summary'] },
      internal: { confidence: 0.82, insufficientEvidence: false, safetyConcern: false },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
              usageMetadata: { promptTokenCount: 24, candidatesTokenCount: 20 },
            }),
            { status: 200 },
          ),
      ),
    );

    const result = await new GeminiPaidAdapter('test-key').generateJson<StudentReportOutput>({
      model: {
        id: 'model',
        providerId: 'provider',
        providerModelId: 'gemini-test',
        status: 'ACTIVE',
      },
      systemPrompt: 'system',
      userPrompt: 'user',
      maxOutputTokens: 1200,
      operationId: 'student-report-operation',
      outputSchema: 'student-report',
    });

    expect(result.output.gentleObservation.evidenceRefs).toEqual(['practice:summary']);
    expect(result.totalTokens).toBe(44);
  });
});
