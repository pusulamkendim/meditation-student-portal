import { createHash } from 'node:crypto';
import { z } from 'zod';

export const llmTaskSchema = z.enum([
  'INBOUND_INTENT',
  'AGENT_REPLY',
  'REFLECTION_TAGGING',
  'WEEKLY_SUMMARY',
  'KNOWLEDGE_EMBEDDING',
  'RAG_QUERY_REWRITE',
  'RAG_RERANK',
]);
export type LlmTask = z.infer<typeof llmTaskSchema>;

export const studentContextSectionSchema = z.enum([
  'PRACTICE',
  'MEETINGS',
  'MEMBERSHIP',
  'PAYMENT',
  'ACCOUNT',
]);
export type StudentContextSection = z.infer<typeof studentContextSectionSchema>;

export const studentContextRangeSchema = z.enum(['CURRENT_PACKAGE', 'LAST_30_DAYS', 'ALL_PAGED']);
export type StudentContextRange = z.infer<typeof studentContextRangeSchema>;

export const getStudentContextInputSchema = z.object({
  sections: z.array(studentContextSectionSchema).min(1).max(5),
  range: studentContextRangeSchema.default('CURRENT_PACKAGE'),
  cursor: z.string().max(512).optional(),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type GetStudentContextInput = z.infer<typeof getStudentContextInputSchema>;

export const agentReplyOutputSchema = z.object({
  action: z.enum([
    'ANSWER',
    'SMALL_TALK',
    'PRACTICE_COMPLETE',
    'PRACTICE_SKIP',
    'PRACTICE_REFLECTION',
    'CHANGE_REQUEST',
    'SAFETY',
    'HANDOFF',
  ]),
  confidence: z.number().int().min(0).max(100),
  answer: z.string().min(1).max(2000),
  usedSections: z.array(studentContextSectionSchema),
  asOf: z.string().datetime(),
  evidenceRecordHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  handoffRequired: z.boolean(),
  reasonCode: z.string().max(120).optional(),
  sourceChunkIds: z.array(z.string().uuid()).max(6).default([]),
  supported: z.boolean().default(true),
  reflectionTags: z
    .array(
      z.object({
        tag: z.enum([
          'CALM',
          'RESTLESSNESS',
          'SLEEPINESS',
          'FOCUS_DIFFICULTY',
          'EMOTIONAL_INTENSITY',
          'BODY_SENSATION',
          'POSITIVE_SHIFT',
          'PRACTICE_BARRIER',
          'SAFETY_CONCERN',
        ]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3)
    .default([]),
});
export type AgentReplyOutput = z.infer<typeof agentReplyOutputSchema>;

export const inboundIntentOutputSchema = z.object({
  domain: z.enum([
    'REGISTRATION',
    'PRACTICE',
    'MEETING',
    'PAYMENT',
    'MEMBERSHIP',
    'ACCOUNT',
    'KNOWLEDGE',
    'GENERAL',
    'SAFETY',
  ]),
  action: z.enum([
    'QUERY',
    'COMPLETE',
    'SKIP',
    'REFLECT',
    'CHANGE',
    'CONFIRM',
    'DECLINE',
    'SMALL_TALK',
    'HANDOFF',
    'UNKNOWN',
  ]),
  confidence: z.number().int().min(0).max(100),
  source: z.enum(['REPLY', 'EVENT', 'HISTORY', 'CURRENT']),
});
export type InboundIntentOutput = z.infer<typeof inboundIntentOutputSchema>;

export const reflectionTagOutputSchema = z.object({
  tags: z
    .array(
      z.object({
        tag: z.enum([
          'CALM',
          'RESTLESSNESS',
          'SLEEPINESS',
          'FOCUS_DIFFICULTY',
          'EMOTIONAL_INTENSITY',
          'BODY_SENSATION',
          'POSITIVE_SHIFT',
          'PRACTICE_BARRIER',
          'SAFETY_CONCERN',
        ]),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(6),
  handoffRequired: z.boolean().default(false),
});
export type ReflectionTagOutput = z.infer<typeof reflectionTagOutputSchema>;

export const weeklySummaryOutputSchema = z.object({
  summary: z.string().min(1).max(4000),
  highlights: z.array(z.string().min(1).max(500)).max(8),
  handoffRequired: z.boolean().default(false),
});
export type WeeklySummaryOutput = z.infer<typeof weeklySummaryOutputSchema>;

export interface LlmModelCandidate {
  id: string;
  providerId: string;
  providerModelId: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LlmTaskResolution {
  task: LlmTask;
  requested: LlmModelCandidate;
  fallback?: LlmModelCandidate;
}

export function resolveLlmModels(input: {
  task: LlmTask;
  taskPrimary?: LlmModelCandidate;
  globalDefault?: LlmModelCandidate;
  taskFallback?: LlmModelCandidate;
}): LlmTaskResolution | null {
  const requested = input.taskPrimary ?? input.globalDefault;
  if (!requested || requested.status !== 'ACTIVE') return null;
  const fallback =
    input.taskFallback?.status === 'ACTIVE' && input.taskFallback.id !== requested.id
      ? input.taskFallback
      : undefined;
  return { task: input.task, requested, fallback };
}

export interface PseudonymizedText {
  value: string;
  version: string;
  maskedCategories: string[];
}

export function pseudonymizeForLlm(
  text: string,
  replacements: Array<{ value: string; category: string }>,
  version = 'pii-v1',
): PseudonymizedText {
  let value = text;
  const maskedCategories = new Set<string>();
  for (const replacement of replacements) {
    if (!replacement.value) continue;
    const escaped = replacement.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'gi');
    if (pattern.test(value)) {
      value = value.replace(pattern, `[${replacement.category}]`);
      maskedCategories.add(replacement.category);
    }
  }
  value = value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\+?\d[\d ()-]{8,}\d)\b/g, '[PHONE]');
  if (value.includes('[EMAIL]')) maskedCategories.add('EMAIL');
  if (value.includes('[PHONE]')) maskedCategories.add('PHONE');
  return { value, version, maskedCategories: [...maskedCategories].sort() };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateEvidence(
  output: AgentReplyOutput,
  availableRecordHashes: readonly string[],
): AgentReplyOutput {
  const available = new Set(availableRecordHashes);
  if (output.evidenceRecordHashes.some((hash) => !available.has(hash))) {
    throw new Error('LLM evidence validation failed.');
  }
  return output;
}
