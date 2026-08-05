import { FakeClock } from '@meditation/core';
import { PracticeSessionStatus } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import {
  expireStalePracticeResponses,
  PRACTICE_RESPONSE_TIMEOUT_MS,
} from './practice-response-timeout.js';

describe('practice response timeout', () => {
  it('marks only sessions that have awaited a response for more than 48 hours as missed', async () => {
    const now = new Date('2026-08-05T12:00:00.000Z');
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = { practiceSession: { updateMany } };

    await expect(expireStalePracticeResponses(prisma as never, new FakeClock(now))).resolves.toBe(
      3,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: PracticeSessionStatus.AWAITING_RESPONSE,
        updatedAt: { lt: new Date(now.getTime() - PRACTICE_RESPONSE_TIMEOUT_MS) },
      },
      data: {
        status: PracticeSessionStatus.MISSED,
        version: { increment: 1 },
      },
    });
  });
});
