import { z } from 'zod';
import { agentReplyOutputSchema, type AgentReplyOutput, type LlmModelCandidate } from './llm.js';

export interface LlmGenerateInput {
  model: LlmModelCandidate;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  operationId: string;
}

export interface LlmGenerateResult {
  output: AgentReplyOutput;
  providerRequestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()) })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional(),
});

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'TRANSIENT' | 'PERMANENT' | 'INVALID_OUTPUT',
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export class GeminiPaidAdapter {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('Gemini API key is required.');
  }

  async generateStructured(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.providerModelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-operation-id': input.operationId },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: input.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!response.ok) {
      const status = response.status;
      throw new LlmProviderError(
        `Gemini request failed with HTTP ${status}.`,
        status >= 500 || status === 429 ? 'TRANSIENT' : 'PERMANENT',
      );
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new LlmProviderError('Gemini response shape is invalid.', 'INVALID_OUTPUT');
    const text = parsed.data.candidates?.[0]?.content?.parts
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) throw new LlmProviderError('Gemini returned no text.', 'INVALID_OUTPUT');
    let json: unknown;
    try {
      json = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new LlmProviderError('Gemini returned invalid JSON.', 'INVALID_OUTPUT');
    }
    const output = agentReplyOutputSchema.safeParse(json);
    if (!output.success)
      throw new LlmProviderError('Gemini output failed schema validation.', 'INVALID_OUTPUT');
    const usage = parsed.data.usageMetadata;
    return {
      output: output.data,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens:
        usage?.totalTokenCount ??
        (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
    };
  }
}
