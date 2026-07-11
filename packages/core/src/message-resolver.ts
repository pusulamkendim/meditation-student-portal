import { localeFallbackChain } from './localization.js';

export interface MessageVariantCandidate {
  id: string;
  locale: string;
  stage?: string | null;
  slot?: string | null;
  requiresStudentName?: boolean;
  priority: number;
  effectiveAt: Date;
}

export interface MessageResolutionContext {
  locale: string;
  stage?: string;
  slot?: string;
  hasStudentName?: boolean;
}

function specificity(
  candidate: MessageVariantCandidate,
  context: MessageResolutionContext,
): number {
  if (candidate.requiresStudentName && !context.hasStudentName) return -1;
  let score = 0;
  if (candidate.requiresStudentName && context.hasStudentName) score += 1;
  if (candidate.locale === context.locale) score += 4;
  else if (candidate.locale === context.locale.split('-')[0]) score += 2;
  if (candidate.stage === context.stage) score += 2;
  else if (candidate.stage) return -1;
  if (candidate.slot === context.slot) score += 1;
  else if (candidate.slot) return -1;
  return score;
}

export function resolveMessageVariant<T extends MessageVariantCandidate>(
  candidates: readonly T[],
  context: MessageResolutionContext,
): T | undefined {
  const locales = new Set(localeFallbackChain(context.locale));
  const ranked = candidates
    .filter((candidate) => locales.has(candidate.locale))
    .map((candidate) => ({ candidate, specificity: specificity(candidate, context) }))
    .filter(({ specificity: value }) => value >= 0)
    .sort(
      (left, right) =>
        right.specificity - left.specificity ||
        right.candidate.priority - left.candidate.priority ||
        right.candidate.effectiveAt.getTime() - left.candidate.effectiveAt.getTime() ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
  return ranked[0]?.candidate;
}

export function assertNoPublishedVariantConflict(
  candidates: readonly MessageVariantCandidate[],
  candidate: MessageVariantCandidate,
): void {
  const conflict = candidates.some(
    (current) =>
      current.id !== candidate.id &&
      current.locale === candidate.locale &&
      current.stage === candidate.stage &&
      current.slot === candidate.slot &&
      current.requiresStudentName === candidate.requiresStudentName &&
      current.priority === candidate.priority,
  );
  if (conflict)
    throw new Error('A published variant with the same specificity and priority exists.');
}
