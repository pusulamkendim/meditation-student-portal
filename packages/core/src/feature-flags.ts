export const featureFlagKeys = [
  'channels.whatsapp.enabled',
  'channels.telegram.enabled',
  'llm.agent-reply.enabled',
  'knowledge.ingestion.enabled',
  'knowledge.rag.enabled',
  'llm.reflection-tagging.enabled',
  'llm.weekly-summary.enabled',
  'messaging.proactive.enabled',
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlagScope = 'GLOBAL' | 'CHANNEL' | 'COHORT' | 'STUDENT';

export interface FeatureFlagRule {
  key: FeatureFlagKey;
  enabled: boolean;
  rolloutPercentage: number;
  scope: FeatureFlagScope;
  subjectIds?: readonly string[];
}

export function isFeatureEnabled(rule: FeatureFlagRule, stableSubjectId: string): boolean {
  if (!rule.enabled || rule.rolloutPercentage <= 0) return false;
  if (rule.subjectIds?.length && !rule.subjectIds.includes(stableSubjectId)) return false;
  if (rule.rolloutPercentage >= 100) return true;

  return stableBucket(`${rule.key}:${stableSubjectId}`) < rule.rolloutPercentage;
}

function stableBucket(input: string): number {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}
