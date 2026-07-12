import { describe, expect, it } from 'vitest';
import {
  agentReplyOutputSchema,
  pseudonymizeForLlm,
  resolveLlmModels,
  validateEvidence,
} from './llm.js';

const active = (id: string) => ({
  id,
  providerId: 'provider',
  providerModelId: id,
  status: 'ACTIVE' as const,
});

describe('llm contracts', () => {
  it('resolves task primary before global and fallback', () => {
    const result = resolveLlmModels({
      task: 'AGENT_REPLY',
      taskPrimary: active('task'),
      globalDefault: active('global'),
      taskFallback: active('fallback'),
    });
    expect(result?.requested.id).toBe('task');
    expect(result?.fallback?.id).toBe('fallback');
  });

  it('masks known and detected PII', () => {
    const result = pseudonymizeForLlm('Ayşe, +90 542 807 84 29 ve ayse@example.com', [
      { value: 'Ayşe', category: 'STUDENT' },
    ]);
    expect(result.value).toContain('[STUDENT]');
    expect(result.value).toContain('[PHONE]');
    expect(result.value).toContain('[EMAIL]');
  });

  it('rejects evidence not returned by context', () => {
    const output = agentReplyOutputSchema.parse({
      answer: 'Programın 08:00.',
      usedSections: ['PRACTICE'],
      asOf: '2026-07-12T10:00:00.000Z',
      evidenceRecordHashes: ['a'.repeat(64)],
      handoffRequired: false,
    });
    expect(() => validateEvidence(output, [])).toThrow('evidence');
  });
});
