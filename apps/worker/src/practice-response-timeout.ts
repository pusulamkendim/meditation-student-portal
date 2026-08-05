import type { Clock } from '@meditation/core';
import { PracticeSessionStatus, type PrismaClient } from '@meditation/database';

export const PRACTICE_RESPONSE_TIMEOUT_MS = 48 * 60 * 60 * 1000;

export async function expireStalePracticeResponses(
  prisma: PrismaClient,
  clock: Clock,
): Promise<number> {
  const threshold = new Date(clock.now().getTime() - PRACTICE_RESPONSE_TIMEOUT_MS);
  const result = await prisma.practiceSession.updateMany({
    where: {
      status: PracticeSessionStatus.AWAITING_RESPONSE,
      updatedAt: { lt: threshold },
    },
    data: {
      status: PracticeSessionStatus.MISSED,
      version: { increment: 1 },
    },
  });
  return result.count;
}
