import { describe, expect, it, vi } from 'vitest';

import {
  configureResponsiveQueue,
  OUTBOX_POLL_INTERVAL_MS,
  RESPONSIVE_WORK_OPTIONS,
} from './responsive-queue.js';

describe('responsive queue configuration', () => {
  it('keeps latency-sensitive queues notification-driven with a polling fallback', async () => {
    const queue = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      updateQueue: vi.fn().mockResolvedValue(undefined),
    };

    await configureResponsiveQueue(queue, 'practice.response');

    expect(queue.createQueue).toHaveBeenCalledWith('practice.response', { notify: true });
    expect(queue.updateQueue).toHaveBeenCalledWith('practice.response', { notify: true });
    expect(OUTBOX_POLL_INTERVAL_MS).toBe(1_000);
    expect(RESPONSIVE_WORK_OPTIONS.pollingIntervalSeconds).toBe(0.5);
  });
});
