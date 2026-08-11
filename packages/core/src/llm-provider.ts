import { z } from 'zod';
import {
  agentReplyOutputSchema,
  inboundIntentOutputSchema,
  type AgentReplyOutput,
  type LlmModelCandidate,
  reflectionTagOutputSchema,
  studentReportOutputSchema,
  studentPulseOutputSchema,
  weeklySummaryOutputSchema,
} from './llm.js';

export interface LlmGenerateInput {
  model: LlmModelCandidate;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  operationId: string;
  temperature?: number;
}

export interface LlmGenerateResult {
  output: AgentReplyOutput;
  providerRequestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StructuredGenerateInput extends LlmGenerateInput {
  outputSchema?:
    | 'agent-reply'
    | 'inbound-intent'
    | 'reflection-tags'
    | 'weekly-summary'
    | 'student-pulse'
    | 'student-report';
}

export interface StructuredGenerateResult<T> {
  output: T;
  providerRequestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface EmbeddingResult {
  values: number[];
  providerRequestId?: string;
  inputTokens: number;
}

export interface AudioTranscriptionResult {
  text: string;
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

const evidenceSectionJsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    evidenceRefs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 },
  },
  required: ['text', 'evidenceRefs'],
  additionalProperties: false,
} as const;

const structuredOutputJsonSchemas = {
  'student-pulse': {
    type: 'object',
    properties: {
      tone: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      summary: { type: 'string' },
      strengths: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      challenges: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      coachTopics: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      suggestedAction: { type: 'string', enum: ['KEEP', 'SIMPLIFY', 'DISCUSS'] },
      safetyConcern: { type: 'boolean' },
    },
    required: [
      'tone',
      'confidence',
      'summary',
      'strengths',
      'challenges',
      'coachTopics',
      'suggestedAction',
      'safetyConcern',
    ],
    additionalProperties: false,
  },
  'student-report': {
    type: 'object',
    properties: {
      subtitle: { type: 'string' },
      featuredReflectionId: { type: ['string', 'null'] },
      gentleObservation: evidenceSectionJsonSchema,
      supportPoint: evidenceSectionJsonSchema,
      weeklyEvaluation: evidenceSectionJsonSchema,
      internal: {
        type: 'object',
        properties: {
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          insufficientEvidence: { type: 'boolean' },
          safetyConcern: { type: 'boolean' },
        },
        required: ['confidence', 'insufficientEvidence', 'safetyConcern'],
        additionalProperties: false,
      },
    },
    required: [
      'subtitle',
      'featuredReflectionId',
      'gentleObservation',
      'supportPoint',
      'weeklyEvaluation',
      'internal',
    ],
    additionalProperties: false,
  },
} as const;

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
    return this.generateJson({ ...input, outputSchema: 'agent-reply' });
  }

  async transcribeAudio(input: {
    model: LlmModelCandidate;
    operationId: string;
    prompt: string;
    audio: Buffer;
    mimeType: string;
    maxOutputTokens?: number;
  }): Promise<AudioTranscriptionResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.providerModelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-operation-id': input.operationId },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: input.prompt },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.audio.toString('base64'),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: input.maxOutputTokens ?? 2048,
        },
      }),
    });
    if (!response.ok) {
      const status = response.status;
      throw new LlmProviderError(
        `Gemini audio transcription failed with HTTP ${status}.`,
        status >= 500 || status === 429 ? 'TRANSIENT' : 'PERMANENT',
      );
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new LlmProviderError(
        'Gemini transcription response shape is invalid.',
        'INVALID_OUTPUT',
      );
    const text = parsed.data.candidates?.[0]?.content?.parts
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text)
      throw new LlmProviderError('Gemini returned an empty transcription.', 'INVALID_OUTPUT');
    const usage = parsed.data.usageMetadata;
    return {
      text,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens:
        usage?.totalTokenCount ??
        (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
    };
  }

  async generateJson<T = AgentReplyOutput>(
    input: StructuredGenerateInput,
  ): Promise<StructuredGenerateResult<T>> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.providerModelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-operation-id': input.operationId },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxOutputTokens,
          responseMimeType: 'application/json',
          ...(input.outputSchema === 'student-pulse' || input.outputSchema === 'student-report'
            ? { responseJsonSchema: structuredOutputJsonSchemas[input.outputSchema] }
            : {}),
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
    const output =
      input.outputSchema === 'inbound-intent'
        ? inboundIntentOutputSchema.safeParse(json)
        : input.outputSchema === 'reflection-tags'
          ? reflectionTagOutputSchema.safeParse(json)
          : input.outputSchema === 'weekly-summary'
            ? weeklySummaryOutputSchema.safeParse(json)
            : input.outputSchema === 'student-pulse'
              ? studentPulseOutputSchema.safeParse(json)
              : input.outputSchema === 'student-report'
                ? studentReportOutputSchema.safeParse(json)
                : agentReplyOutputSchema.safeParse(json);
    if (!output.success)
      throw new LlmProviderError('Gemini output failed schema validation.', 'INVALID_OUTPUT');
    const usage = parsed.data.usageMetadata;
    return {
      output: output.data as T,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens:
        usage?.totalTokenCount ??
        (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0),
    };
  }

  async embedContent(input: {
    model: LlmModelCandidate;
    operationId: string;
    content: string;
    outputDimensionality?: number;
  }): Promise<EmbeddingResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model.providerModelId)}:embedContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-operation-id': input.operationId },
      body: JSON.stringify({
        model: `models/${input.model.providerModelId}`,
        content: { parts: [{ text: input.content }] },
        outputDimensionality: input.outputDimensionality ?? 768,
      }),
    });
    if (!response.ok) {
      const status = response.status;
      throw new LlmProviderError(
        `Gemini embedding request failed with HTTP ${status}.`,
        status >= 500 || status === 429 ? 'TRANSIENT' : 'PERMANENT',
      );
    }
    const parsed = z
      .object({
        embedding: z.object({ values: z.array(z.number()) }),
        usageMetadata: z.object({ promptTokenCount: z.number().optional() }).optional(),
      })
      .safeParse(await response.json());
    if (
      !parsed.success ||
      parsed.data.embedding.values.length !== (input.outputDimensionality ?? 768)
    )
      throw new LlmProviderError('Gemini embedding response shape is invalid.', 'INVALID_OUTPUT');
    return {
      values: parsed.data.embedding.values,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      inputTokens:
        parsed.data.usageMetadata?.promptTokenCount ?? Math.ceil(input.content.length / 4),
    };
  }
}
