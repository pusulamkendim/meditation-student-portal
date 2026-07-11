import { randomUUID } from 'node:crypto';

import { PrismaClient, StudentStatus, SubscriptionStatus } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';
const prisma = new PrismaClient();

describe.runIf(runDatabaseTests)('PostgreSQL data invariants', () => {
  afterAll(async () => prisma.$disconnect());

  it('rejects overlapping active subscription periods', async () => {
    const student = await prisma.student.create({ data: { status: StudentStatus.ACTIVE } });
    try {
      await prisma.subscriptionPeriod.create({
        data: {
          studentId: student.id,
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date('2026-07-01'),
          endExclusive: new Date('2026-08-01'),
        },
      });
      await expect(
        prisma.subscriptionPeriod.create({
          data: {
            studentId: student.id,
            status: SubscriptionStatus.SCHEDULED,
            startDate: new Date('2026-07-15'),
            endExclusive: new Date('2026-08-15'),
          },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.subscriptionPeriod.deleteMany({ where: { studentId: student.id } });
      await prisma.student.delete({ where: { id: student.id } });
    }
  });

  it('rolls back aggregate and outbox writes together', async () => {
    const studentId = randomUUID();
    const outboxId = randomUUID();
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.student.create({ data: { id: studentId } });
        await transaction.outboxEvent.create({
          data: {
            id: outboxId,
            topic: 'student.events',
            aggregateType: 'Student',
            aggregateId: studentId,
            eventType: 'StudentCreated',
            payload: { studentId },
          },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    await expect(prisma.student.count({ where: { id: studentId } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { id: outboxId } })).resolves.toBe(0);
  });
});
