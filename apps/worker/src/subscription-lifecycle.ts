import type { Clock } from '@meditation/core';
import { PrismaClient, StudentStatus, SubscriptionStatus } from '@meditation/database';
export async function reconcileSubscriptions(prisma: PrismaClient, clock: Clock): Promise<void> {
  const now = clock.now();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.$transaction(async (tx) => {
    for (const item of await tx.subscriptionPeriod.findMany({
      where: { status: SubscriptionStatus.SCHEDULED, startDate: { lte: today } },
    })) {
      const claimed = await tx.subscriptionPeriod.updateMany({
        where: { id: item.id, status: SubscriptionStatus.SCHEDULED, version: item.version },
        data: { status: SubscriptionStatus.ACTIVE, version: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      await tx.student.update({
        where: { id: item.studentId },
        data: { status: StudentStatus.ACTIVE, version: { increment: 1 } },
      });
    }
    for (const item of await tx.subscriptionPeriod.findMany({
      where: { status: SubscriptionStatus.ACTIVE, endExclusive: { lte: today } },
    })) {
      const claimed = await tx.subscriptionPeriod.updateMany({
        where: { id: item.id, status: SubscriptionStatus.ACTIVE, version: item.version },
        data: { status: SubscriptionStatus.EXPIRED, version: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      const replacement = await tx.subscriptionPeriod.findFirst({
        where: {
          studentId: item.studentId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
          endExclusive: { gt: today },
        },
      });
      if (!replacement)
        await tx.student.update({
          where: { id: item.studentId },
          data: { status: StudentStatus.INACTIVE, version: { increment: 1 } },
        });
    }
  });
}
