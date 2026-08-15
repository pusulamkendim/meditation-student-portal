import { randomUUID } from 'node:crypto';
import { FakeClock } from '@meditation/core';
import {
  PrismaClient,
  RegistrationStep,
  StudentStatus,
  SubscriptionRenewalStatus,
  SubscriptionStatus,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '@meditation/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentService } from './payment.service.js';
import { SubscriptionPackageService } from './subscription-package.service.js';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';

describe.runIf(runDatabaseTests)('payment approval flow', () => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://meditation:meditation@localhost:5433/meditation?schema=public';
  const clock = new FakeClock('2026-07-13T09:00:00.000Z');
  let prisma: PrismaClient;
  let service: PaymentService;
  let subscriptionPackages: SubscriptionPackageService;
  let studentId: string;
  let adminId: string;
  let accountId: string;
  let currentSubscriptionId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
    service = new PaymentService(prisma as never, clock);
    subscriptionPackages = new SubscriptionPackageService(prisma as never, clock);
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
    await prisma.practiceSession.deleteMany({ where: { studentId } });
    await prisma.practicePlan.deleteMany({ where: { studentId } });
    await prisma.subscriptionRenewal.deleteMany({ where: { studentId } });
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
    currentSubscriptionId = subscription.id;
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

  it('aligns a channel-reported renewal, carries the practice plan and grants four credits', async () => {
    const source = await prisma.subscriptionPeriod.findUniqueOrThrow({
      where: { id: currentSubscriptionId },
    });
    const sourcePlan = await prisma.practicePlan.create({
      data: {
        studentId,
        subscriptionPeriodId: source.id,
        status: 'ACTIVE',
        revision: 1,
        effectiveFrom: source.startDate,
        activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
        slots: {
          create: {
            slotKey: 'MORNING',
            localTime: '08:00',
            durationMinutes: 15,
          },
        },
      },
      include: { slots: true },
    });
    const sourceSession = await prisma.practiceSession.create({
      data: {
        studentId,
        practicePlanId: sourcePlan.id,
        practiceSlotId: sourcePlan.slots[0]!.id,
        serviceDate: new Date('2026-08-08T00:00:00.000Z'),
        startAt: new Date('2026-08-08T05:00:00.000Z'),
        durationMinutes: 15,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        studentId,
        amountMinor: 400000,
        referenceCode: `RENEWAL-${randomUUID()}`,
        reportedAt: clock.now(),
      },
    });
    const renewal = await prisma.subscriptionRenewal.create({
      data: {
        studentId,
        sourceSubscriptionPeriodId: source.id,
        paymentId: payment.id,
        status: SubscriptionRenewalStatus.PAYMENT_REPORTED,
        reminderQueuedAt: clock.now(),
        choiceRecordedAt: clock.now(),
      },
    });

    const subscription = await service.approve(
      payment.id,
      adminId,
      new Date('2026-08-07T00:00:00.000Z'),
    );

    expect(subscription.status).toBe(SubscriptionStatus.SCHEDULED);
    expect(subscription.startDate.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    expect(subscription.endExclusive.toISOString()).toBe('2026-09-04T00:00:00.000Z');
    const alignedSource = await prisma.subscriptionPeriod.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(alignedSource.endExclusive.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    const suppressedSourceSession = await prisma.practiceSession.findUniqueOrThrow({
      where: { id: sourceSession.id },
    });
    expect(suppressedSourceSession.status).toBe('SUPPRESSED');
    expect(suppressedSourceSession.cancellationReason).toBe('SUBSCRIPTION_RENEWED_EARLY');
    const carriedPlan = await prisma.practicePlan.findFirstOrThrow({
      where: { subscriptionPeriodId: subscription.id },
      include: { slots: true, sessions: true },
    });
    expect(carriedPlan.status).toBe('DRAFT');
    expect(carriedPlan.activeWeekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(carriedPlan.slots).toHaveLength(1);
    expect(carriedPlan.slots[0]).toMatchObject({
      slotKey: 'MORNING',
      localTime: '08:00',
      durationMinutes: 15,
    });
    expect(carriedPlan.sessions.length).toBeGreaterThan(20);
    expect(
      carriedPlan.sessions.every(
        (session) =>
          session.serviceDate >= subscription.startDate &&
          session.serviceDate < subscription.endExclusive,
      ),
    ).toBe(true);
    const updatedRenewal = await prisma.subscriptionRenewal.findUniqueOrThrow({
      where: { id: renewal.id },
    });
    expect(updatedRenewal.status).toBe(SubscriptionRenewalStatus.COMPLETED);
    const credit = await prisma.meetingCreditEvent.aggregate({
      where: { subscriptionPeriodId: subscription.id },
      _sum: { delta: true },
    });
    expect(credit._sum.delta).toBe(4);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(student.status).toBe(StudentStatus.ACTIVE);
    const intent = await prisma.messageIntent.findUniqueOrThrow({
      where: { idempotencyKey: `payment-approved:${payment.id}` },
    });
    const rendered = (intent.payload as { rendered: string }).rendered;
    expect(rendered).toContain('7 Ağu 2026');
    expect(rendered).toContain('3 Eyl 2026');
    await expect(
      prisma.systemEventOccurrence.count({
        where: {
          studentId,
          eventKey: { in: ['PRACTICE_PLAN_CONFIRMED', 'PRACTICE_PLAN_UPDATED'] },
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.messageIntent.count({
        where: {
          studentId,
          OR: [
            { payload: { path: ['eventKey'], equals: 'PRACTICE_PLAN_CONFIRMED' } },
            { payload: { path: ['eventKey'], equals: 'PRACTICE_PLAN_UPDATED' } },
          ],
        },
      }),
    ).resolves.toBe(0);
  });

  it('creates a manual 28-day package after the planned period without sending plan messages', async () => {
    const source = await prisma.subscriptionPeriod.findFirstOrThrow({
      where: { studentId, status: SubscriptionStatus.SCHEDULED },
      orderBy: { endExclusive: 'desc' },
    });
    const messageCountBefore = await prisma.messageIntent.count({ where: { studentId } });
    const paymentCountBefore = await prisma.payment.count({ where: { studentId } });

    const result = await subscriptionPackages.createForStudent(studentId, adminId);

    expect(result.subscription).toMatchObject({
      status: SubscriptionStatus.SCHEDULED,
      startDate: source.endExclusive,
      paymentId: result.payment.id,
    });
    expect(result.subscription.endExclusive.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(result.copiedPracticePlanId).toBeTruthy();
    const carriedPlan = await prisma.practicePlan.findUniqueOrThrow({
      where: { id: result.copiedPracticePlanId! },
      include: { slots: true, sessions: true },
    });
    expect(carriedPlan.status).toBe('DRAFT');
    expect(carriedPlan.slots).toHaveLength(1);
    expect(carriedPlan.sessions.length).toBeGreaterThan(20);
    expect(
      carriedPlan.sessions.every(
        (session) =>
          session.serviceDate >= result.subscription.startDate &&
          session.serviceDate < result.subscription.endExclusive,
      ),
    ).toBe(true);
    const credit = await prisma.meetingCreditEvent.aggregate({
      where: { subscriptionPeriodId: result.subscription.id },
      _sum: { delta: true },
    });
    expect(credit._sum.delta).toBe(4);
    await expect(prisma.messageIntent.count({ where: { studentId } })).resolves.toBe(
      messageCountBefore,
    );
    await expect(prisma.payment.count({ where: { studentId } })).resolves.toBe(
      paymentCountBefore + 1,
    );
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: result.payment.id },
    });
    expect(payment).toMatchObject({
      studentId,
      status: 'APPROVED',
      amountMinor: 400_000n,
      currency: 'TRY',
      approvedByAdminUserId: adminId,
    });
    expect(payment.approvedAt).toEqual(clock.now());
    expect(payment.referenceCode).toMatch(/^ADMIN-[A-F0-9]{12}$/);
  });
});
