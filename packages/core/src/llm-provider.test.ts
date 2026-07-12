import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiPaidAdapter } from './llm-provider.js';

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
});
