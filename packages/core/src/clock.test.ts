import { describe, expect, it } from 'vitest';

import { FakeClock } from './clock.js';
import { resolveMonorepoEnvPath } from './config.js';

describe('FakeClock', () => {
  it('advances time without waiting for wall clock time', () => {
    const clock = new FakeClock('2026-07-10T06:00:00.000Z');

    clock.advanceBy(10 * 60 * 1000);

    expect(clock.now().toISOString()).toBe('2026-07-10T06:10:00.000Z');
  });

  it('resolves .env from the monorepo root instead of the process directory', () => {
    expect(resolveMonorepoEnvPath('file:///workspace/packages/core/src/config.ts')).toBe(
      '/workspace/.env',
    );
  });
});
