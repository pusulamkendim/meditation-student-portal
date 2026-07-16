import { createHash } from 'node:crypto';
import { z } from 'zod';

export const knowledgeStageSchema = z.enum([
  'GENERAL',
  'WEEK_1',
  'WEEK_2',
  'WEEK_3',
  'WEEK_4',
  'INTERMEDIATE',
  'ADVANCED',
]);
export type KnowledgeStage = z.infer<typeof knowledgeStageSchema>;

export const knowledgeDocumentStatusSchema = z.enum([
  'UPLOADED',
  'QUARANTINED',
  'SCANNING',
  'PARSING',
  'CHUNKING',
  'EMBEDDING',
  'READY',
  'PUBLISHED',
  'ARCHIVED',
  'FAILED',
]);
export type KnowledgeDocumentStatus = z.infer<typeof knowledgeDocumentStatusSchema>;

export interface KnowledgeChunkInput {
  titlePath: string;
  content: string;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function contentHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Deterministic paragraph chunker. Character boundaries are stored for audit/re-indexing. */
export function chunkKnowledgeText(
  text: string,
  options: { targetTokens?: number; overlapTokens?: number } = {},
): KnowledgeChunkInput[] {
  const target = options.targetTokens ?? 750;
  const overlap = options.overlapTokens ?? 120;
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const chunks: KnowledgeChunkInput[] = [];
  let current = '';
  let start = 0;
  let cursor = 0;
  let titlePath = '';
  const flush = (end: number) => {
    const content = current.trim();
    if (!content) return;
    chunks.push({
      titlePath,
      content,
      startChar: start,
      endChar: end,
      tokenCount: estimateTokens(content),
    });
  };
  for (const paragraph of paragraphs) {
    const raw = paragraph.trim();
    const paragraphStart = text.indexOf(paragraph, cursor);
    cursor = paragraphStart + paragraph.length;
    if (!raw) continue;
    if (/^#{1,6}\s+/.test(raw)) titlePath = raw.replace(/^#{1,6}\s+/, '').slice(0, 240);
    const candidate = current ? `${current}\n\n${raw}` : raw;
    if (current && estimateTokens(candidate) > target) {
      flush(paragraphStart);
      const tail = current.slice(Math.max(0, current.length - overlap * 4));
      current = tail ? `${tail}\n\n${raw}` : raw;
      start = Math.max(0, paragraphStart - tail.length);
    } else {
      if (!current) start = paragraphStart;
      current = candidate;
    }
  }
  flush(text.length);
  return chunks;
}

export const ragAnswerOutputSchema = z.object({
  answer: z.string().min(1).max(2000),
  supported: z.boolean(),
  sourceChunkIds: z.array(z.string().uuid()).max(6),
  handoffRequired: z.boolean(),
  reasonCode: z.string().max(120).optional(),
});
export type RagAnswerOutput = z.infer<typeof ragAnswerOutputSchema>;

export const ragDefaults = {
  topK: 20,
  finalChunks: 3,
  minScore: 0.55,
  maxContextChars: 6_000,
  vectorWeight: 0.78,
  keywordWeight: 0.22,
  maxChunksPerDocument: 3,
} as const;

export function containsPromptInjection(text: string): boolean {
  return /(?:ignore|disregard|bypass)\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions|rules)|reveal\s+(?:the\s+)?system\s+prompt|you\s+are\s+now\s+(?:the|an)\s+/i.test(
    text,
  );
}
