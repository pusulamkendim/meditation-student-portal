import { describe, expect, it } from 'vitest';

import { FakeClock } from './clock.js';
import { loadApplicationConfig } from './config.js';

describe('FakeClock', () => {
  it('advances time without waiting for wall clock time', () => {
    const clock = new FakeClock('2026-07-10T06:00:00.000Z');

    clock.advanceBy(10 * 60 * 1000);

    expect(clock.now().toISOString()).toBe('2026-07-10T06:10:00.000Z');
  });

  it('rejects fake time outside the test environment', () => {
    expect(() =>
      loadApplicationConfig({
        DATABASE_URL: 'postgresql://meditation:meditation@localhost:5432/meditation',
        NODE_ENV: 'production',
        CLOCK_MODE: 'fake',
      }),
    ).toThrow('CLOCK_MODE=fake is allowed only in the test environment.');
  });
});
