import { describe, expect, it, vi } from 'vitest';

import { loadFeatureFlags } from './feature-flag.repository.js';

describe('loadFeatureFlags', () => {
  it('loads only code-registered, valid feature flags', async () => {
    const prisma = {
      featureFlagConfig: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: 'knowledge.rag.enabled',
            enabled: true,
            rolloutPercentage: 25,
            scope: 'COHORT',
            subjectIds: ['pilot'],
          },
          {
            key: 'unregistered.flag',
            enabled: true,
            rolloutPercentage: 100,
            scope: 'GLOBAL',
            subjectIds: null,
          },
        ]),
      },
    };

    const flags = await loadFeatureFlags(prisma as never, new Date('2026-07-10T18:00:00.000Z'));

    expect(flags.get('knowledge.rag.enabled')).toEqual({
      key: 'knowledge.rag.enabled',
      enabled: true,
      rolloutPercentage: 25,
      scope: 'COHORT',
      subjectIds: ['pilot'],
    });
    expect(flags.size).toBe(1);
  });
});
