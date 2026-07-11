import { FakeClock } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import { registerSmokeQueue, smokeQueueName } from './queue-runtime.js';

describe('worker queue runtime', () => {
  it('registers and processes the M0 smoke queue', async () => {
    let handler:
      ((jobs: Array<{ id: string; data: { requestedAt: string } }>) => Promise<void>) | undefined;
    const queue = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      work: vi.fn(async (_name: string, registered: typeof handler) => {
        handler = registered;
        return 'worker-1';
      }),
      send: vi.fn().mockResolvedValue('job-1'),
    };
    const logger = { info: vi.fn() };
    const clock = new FakeClock('2026-07-10T18:00:00.000Z');

    await registerSmokeQueue(queue as never, clock, logger, true);
    await handler?.([{ id: 'job-1', data: { requestedAt: '2026-07-10T18:00:00.000Z' } }]);

    expect(queue.createQueue).toHaveBeenCalledWith(smokeQueueName);
    expect(queue.send).toHaveBeenCalledWith(smokeQueueName, {
      requestedAt: '2026-07-10T18:00:00.000Z',
    });
    expect(logger.info).toHaveBeenCalledOnce();
  });
});
