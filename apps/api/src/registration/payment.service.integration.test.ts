import { randomUUID } from 'node:crypto';
import { FakeClock } from '@meditation/core';
import {
  PrismaClient,
  RegistrationStep,
  StudentStatus,
  SubscriptionStatus,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '@meditation/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentService } from './payment.service.js';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';

describe.runIf(runDatabaseTests)('payment approval flow', () => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://meditation:meditation@localhost:5433/meditation?schema=public';
  const clock = new FakeClock('2026-07-13T09:00:00.000Z');
  let prisma: PrismaClient;
  let service: PaymentService;
  let studentId: string;
  let adminId: string;
  let accountId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
    service = new PaymentService(prisma as never, clock);
    const account = await prisma.channelAccount.create({
      data: {
        type: 'TELEGRAM',
        externalId: `payment-test-${randomUUID()}`,
        displayName: 'Payment test',
      },
    });
    accountId = account.id;
    const student = await prisma.student.create({
      data: {
        status: StudentStatus.PAYMENT_PENDING,
        registrationStep: RegistrationStep.PAYMENT_REVIEW,
      },
    });
    studentId = student.id;
    const identity = await prisma.studentChannelIdentity.create({
      data: {
        studentId,
        channelAccountId: account.id,
        externalUserEncrypted: Buffer.from('test'),
        externalUserKeyId: 'test',
        externalUserHmac: randomUUID(),
        status: 'ACTIVE',
      },
    });
    await prisma.student.update({
      where: { id: studentId },
      data: { defaultChannelIdentityId: identity.id, version: { increment: 1 } },
    });
    const admin = await prisma.adminUser.create({
      data: {
        email: `payment-${randomUUID()}@example.com`,
        passwordHash: 'not-used',
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    const intents = await prisma.messageIntent.findMany({
      where: { studentId },
      select: { id: true },
    });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: intents.map((intent) => intent.id) } },
    });
    await prisma.systemEventOccurrence.deleteMany({ where: { studentId } });
    await prisma.messageIntent.deleteMany({ where: { studentId } });
    await prisma.meetingCreditEvent.deleteMany({
      where: { subscriptionPeriod: { studentId } },
    });
    await prisma.subscriptionPeriod.deleteMany({ where: { studentId } });
    await prisma.payment.deleteMany({ where: { studentId } });
    await prisma.student.delete({ where: { id: studentId } });
    await prisma.channelAccount.delete({ where: { id: accountId } });
    await prisma.adminUser.delete({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('activates the student, grants four meetings and queues the approval message', async () => {
    const payment = await prisma.payment.create({
      data: {
        studentId,
        amountMinor: 400000,
        referenceCode: `TEST-${randomUUID()}`,
        reportedAt: clock.now(),
      },
    });

    const subscription = await service.approve(payment.id, adminId);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(student.status).toBe(StudentStatus.ACTIVE);
    expect(student.registrationStep).toBe(RegistrationStep.COMPLETE);
    const credit = await prisma.meetingCreditEvent.aggregate({
      where: { subscriptionPeriodId: subscription.id },
      _sum: { delta: true },
    });
    expect(credit._sum.delta).toBe(4);
    const intent = await prisma.messageIntent.findUniqueOrThrow({
      where: { idempotencyKey: `payment-approved:${payment.id}` },
    });
    expect(intent.category).toBe('PAYMENT_APPROVED');
    expect((intent.payload as { rendered: string }).rendered).toContain('Ödemen onaylandı');
  });
});
