import {
  featureFlagKeys,
  type FeatureFlagKey,
  type FeatureFlagRule,
  type FeatureFlagScope,
} from '@meditation/core';
import type { PrismaClient } from '@prisma/client';

const knownKeys = new Set<string>(featureFlagKeys);
const knownScopes = new Set<FeatureFlagScope>(['GLOBAL', 'CHANNEL', 'COHORT', 'STUDENT']);

export async function loadFeatureFlags(
  prisma: Pick<PrismaClient, 'featureFlagConfig'>,
  now: Date,
): Promise<Map<FeatureFlagKey, FeatureFlagRule>> {
  const configs = await prisma.featureFlagConfig.findMany({
    where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  const rules = new Map<FeatureFlagKey, FeatureFlagRule>();
  for (const config of configs) {
    if (!knownKeys.has(config.key) || !knownScopes.has(config.scope as FeatureFlagScope)) continue;
    const subjectIds = Array.isArray(config.subjectIds)
      ? config.subjectIds.filter((value): value is string => typeof value === 'string')
      : undefined;
    rules.set(config.key as FeatureFlagKey, {
      key: config.key as FeatureFlagKey,
      enabled: config.enabled,
      rolloutPercentage: config.rolloutPercentage,
      scope: config.scope as FeatureFlagScope,
      subjectIds,
    });
  }
  return rules;
}
