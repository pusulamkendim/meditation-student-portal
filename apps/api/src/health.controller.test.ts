import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports liveness and readiness', async () => {
    const controller = new HealthController({
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as never);

    expect(controller.live()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { config: 'ok', database: 'ok' },
    });
  });
});
