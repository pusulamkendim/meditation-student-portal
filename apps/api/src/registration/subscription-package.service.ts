import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CLOCK_TOKEN, type Clock } from '@meditation/core';
import {
  AuditActorType,
  PaymentStatus,
  RegistrationStep,
  StudentStatus,
  SubscriptionStatus,
} from '@meditation/database';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import {
  addSubscriptionDays,
  alignRenewalBoundary,
  carryPracticePlanToRenewal,
} from './subscription-renewal-period.js';

const packagePriceMinor = 400_000n;

function utcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class SubscriptionPackageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async createForStudent(studentId: string, adminId: string, requestedStart?: Date) {
    const now = this.clock.now();
    const today = utcDate(now);

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { id: studentId } });
      if (!student) throw new NotFoundException('Student not found.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
      const source = await tx.subscriptionPeriod.findFirst({
        where: {
          studentId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
        },
        orderBy: [{ endExclusive: 'desc' }, { createdAt: 'desc' }],
      });
      const start = requestedStart ? utcDate(requestedStart) : (source?.endExclusive ?? today);
      if (start < today) throw new BadRequestException('Paket başlangıcı bugünden önce olamaz.');

      let sourcePlan = source
        ? await alignRenewalBoundary(tx, { source, start, today, adminId })
        : undefined;
      sourcePlan ??=
        (await tx.practicePlan.findFirst({
          where: { studentId },
          orderBy: { revision: 'desc' },
          include: {
            slots: {
              include: {
                meditationType: {
                  select: { id: true, title: true, audioRevision: true, guidanceMode: true },
                },
              },
            },
          },
        })) ?? undefined;

      const endExclusive = addSubscriptionDays(start);
      const overlap = await tx.subscriptionPeriod.findFirst({
        where: {
          id: source ? { not: source.id } : undefined,
          studentId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
          startDate: { lt: endExclusive },
          endExclusive: { gt: start },
        },
        select: { id: true },
      });
      if (overlap) throw new ConflictException('Yeni dönem başka bir üyelik dönemiyle çakışıyor.');

      const payment = await tx.payment.create({
        data: {
          studentId,
          status: PaymentStatus.APPROVED,
          amountMinor: packagePriceMinor,
          currency: 'TRY',
          referenceCode: `ADMIN-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
          reviewNote: 'Admin panelinden yeni paket oluşturulurken onaylandı.',
          reportedAt: now,
          approvedAt: now,
          approvedByAdminUserId: adminId,
        },
      });
      const subscription = await tx.subscriptionPeriod.create({
        data: {
          studentId,
          paymentId: payment.id,
          status: start > today ? SubscriptionStatus.SCHEDULED : SubscriptionStatus.ACTIVE,
          startDate: start,
          endExclusive,
          priceMinor: packagePriceMinor,
          currency: 'TRY',
        },
      });
      const copiedPracticePlanId = await carryPracticePlanToRenewal(tx, {
        sourcePlan,
        subscription,
        today,
      });

      await tx.meetingCreditEvent.create({
        data: {
          subscriptionPeriodId: subscription.id,
          delta: 4,
          reason: 'PACKAGE_GRANT',
          idempotencyKey: `subscription:${subscription.id}:meeting-credit:grant`,
        },
      });
      if (source) {
        await tx.subscriptionRenewal.updateMany({
          where: { sourceSubscriptionPeriodId: source.id, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED', version: { increment: 1 } },
        });
      }

      const coveringSubscription = await tx.subscriptionPeriod.findFirst({
        where: {
          studentId,
          status: SubscriptionStatus.ACTIVE,
          startDate: { lte: today },
          endExclusive: { gt: today },
        },
        select: { id: true },
      });
      await tx.student.update({
        where: { id: studentId },
        data: {
          status: coveringSubscription ? StudentStatus.ACTIVE : StudentStatus.INACTIVE,
          registrationStep: RegistrationStep.COMPLETE,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: 'SUBSCRIPTION_PACKAGE_CREATED',
          entityType: 'SubscriptionPeriod',
          entityId: subscription.id,
          reason: 'Yeni paket admin panelinden oluşturuldu.',
          safeDiff: {
            sourceSubscriptionPeriodId: source?.id ?? null,
            startDate: start.toISOString(),
            endExclusive: endExclusive.toISOString(),
            durationDays: 28,
            meetingCredits: 4,
            paymentId: payment.id,
            copiedPracticePlanId: copiedPracticePlanId ?? null,
          },
          requestId: randomUUID(),
          correlationId: `subscription-package-${subscription.id}`,
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'student.events',
          aggregateType: 'SubscriptionPeriod',
          aggregateId: subscription.id,
          eventType:
            subscription.status === SubscriptionStatus.SCHEDULED
              ? 'SUBSCRIPTION_SCHEDULED'
              : 'STUDENT_ACTIVATED',
          payload: { subscriptionId: subscription.id, studentId },
        },
      });

      return { subscription, payment, copiedPracticePlanId };
    });
  }
}
