import { AuditActorType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { UnitOfWork } from './unit-of-work.js';

describe('UnitOfWork', () => {
  it('writes the aggregate, audit and outbox through the same transaction client', async () => {
    const transaction = {
      student: {
        update: vi.fn().mockResolvedValue({ id: '10000000-0000-0000-0000-000000000001' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    };
    const unitOfWork = new UnitOfWork(prisma as never);

    await unitOfWork.run(async ({ prisma: client, audit, enqueue }) => {
      await client.student.update({
        where: { id: '10000000-0000-0000-0000-000000000001' },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });
      await audit({
        actorType: AuditActorType.ADMIN,
        action: 'student.activate',
        entityType: 'Student',
        entityId: '10000000-0000-0000-0000-000000000001',
        requestId: 'request-1',
        correlationId: 'correlation-1',
      });
      await enqueue({
        topic: 'student.events',
        aggregateType: 'Student',
        aggregateId: '10000000-0000-0000-0000-000000000001',
        eventType: 'StudentActivated',
        payload: { studentId: '10000000-0000-0000-0000-000000000001' },
      });
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.student.update).toHaveBeenCalledOnce();
    expect(transaction.auditLog.create).toHaveBeenCalledOnce();
    expect(transaction.outboxEvent.create).toHaveBeenCalledOnce();
  });
});
