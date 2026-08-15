import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  getDefaultRegistrationMessage,
  renderMessageTemplate,
  resolveMessageVariant,
  type Clock,
} from '@meditation/core';
import {
  MessageIntentStatus,
  PaymentStatus,
  RegistrationStep,
  StudentStatus,
  SubscriptionStatus,
  StandardMessageVersionStatus,
} from '@meditation/database';
import { PrismaService } from '../database/prisma.service.js';
import {
  addSubscriptionDays,
  alignRenewalBoundary,
  carryPracticePlanToRenewal,
} from './subscription-renewal-period.js';

function utcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}
  actionRequired(paymentId: string, note: string) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.ACTION_REQUIRED, reviewNote: note, version: { increment: 1 } },
    });
  }
  async approve(paymentId: string, adminId: string, requestedStart?: Date) {
    const now = this.clock.now();
    const today = utcDate(now);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: {
          renewal: { include: { sourceSubscriptionPeriod: true } },
        },
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.studentId}))`;
      if (
        !new Set<PaymentStatus>([
          PaymentStatus.REPORTED,
          PaymentStatus.UNDER_REVIEW,
          PaymentStatus.ACTION_REQUIRED,
        ]).has(payment.status)
      )
        throw new Error('Payment cannot be approved in its current state.');
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, version: payment.version, status: payment.status },
        data: { status: PaymentStatus.UNDER_REVIEW, version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new Error('Payment approval conflict.');
      const requestedServiceDate = requestedStart ? utcDate(requestedStart) : undefined;
      const start = payment.renewal
        ? (requestedServiceDate ?? payment.renewal.sourceSubscriptionPeriod.endExclusive)
        : (requestedServiceDate ?? today);
      if (start < today) throw new BadRequestException('Paket başlangıcı bugünden önce olamaz.');
      const end = addSubscriptionDays(start);
      let sourcePlan;
      if (payment.renewal) {
        sourcePlan = await alignRenewalBoundary(tx, {
          source: payment.renewal.sourceSubscriptionPeriod,
          start,
          today,
          adminId,
        });
        const overlap = await tx.subscriptionPeriod.findFirst({
          where: {
            id: { not: payment.renewal.sourceSubscriptionPeriodId },
            studentId: payment.studentId,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
            startDate: { lt: end },
            endExclusive: { gt: start },
          },
          select: { id: true },
        });
        if (overlap)
          throw new ConflictException('Yeni dönem başka bir üyelik dönemiyle çakışıyor.');
      }
      const subscription = await tx.subscriptionPeriod.create({
        data: {
          studentId: payment.studentId,
          paymentId,
          status: start > today ? SubscriptionStatus.SCHEDULED : SubscriptionStatus.ACTIVE,
          startDate: start,
          endExclusive: end,
          priceMinor: payment.amountMinor,
          currency: payment.currency,
        },
      });
      if (payment.renewal) {
        await carryPracticePlanToRenewal(tx, { sourcePlan, subscription, today });
      }
      await tx.meetingCreditEvent.create({
        data: {
          subscriptionPeriodId: subscription.id,
          delta: 4,
          reason: 'PACKAGE_GRANT',
          idempotencyKey: `subscription:${subscription.id}:meeting-credit:grant`,
        },
      });
      await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.UNDER_REVIEW, version: payment.version + 1 },
        data: {
          status: PaymentStatus.APPROVED,
          approvedAt: now,
          approvedByAdminUserId: adminId,
          version: { increment: 1 },
        },
      });
      if (payment.renewal) {
        const completed = await tx.subscriptionRenewal.updateMany({
          where: {
            id: payment.renewal.id,
            paymentId: payment.id,
            version: payment.renewal.version,
          },
          data: { status: 'COMPLETED', version: { increment: 1 } },
        });
        if (completed.count !== 1) throw new Error('Subscription renewal completion conflict.');
      }
      const coveringSubscription = await tx.subscriptionPeriod.findFirst({
        where: {
          studentId: payment.studentId,
          status: SubscriptionStatus.ACTIVE,
          startDate: { lte: today },
          endExclusive: { gt: today },
        },
        select: { id: true },
      });
      const activatedStudent = await tx.student.update({
        where: { id: payment.studentId },
        data: {
          status:
            start.getTime() <= today.getTime() || coveringSubscription
              ? StudentStatus.ACTIVE
              : StudentStatus.INACTIVE,
          registrationStep: RegistrationStep.COMPLETE,
          version: { increment: 1 },
        },
      });
      const identity = await tx.studentChannelIdentity.findFirst({
        where: { studentId: payment.studentId, status: 'ACTIVE' },
        include: { channelAccount: true },
        orderBy: [{ id: 'asc' }],
      });
      if (identity) {
        const variables = {
          amountText: '4.000 TL',
          subscriptionStartsAtText: this.formatDate(start),
          subscriptionEndsAtText: this.formatInclusiveEndDate(end),
        };
        const versions = await tx.standardMessageVersion.findMany({
          where: {
            status: StandardMessageVersionStatus.PUBLISHED,
            effectiveAt: { lte: now },
            variant: {
              channel: identity.channelAccount.type,
              standardMessage: { eventKey: 'PAYMENT_APPROVED', audience: 'STUDENT' },
            },
          },
          include: { variant: true },
        });
        const selected = resolveMessageVariant(
          versions.map((version) => ({
            ...version,
            locale: version.variant.locale,
            stage: version.variant.curriculumStage,
            slot: version.variant.slot,
            priority: version.variant.priority,
            requiresStudentName: version.variant.requiresStudentName,
            effectiveAt: version.effectiveAt!,
          })),
          { locale: activatedStudent.preferredLocale, hasStudentName: false },
        );
        const template = selected?.content ?? getDefaultRegistrationMessage('PAYMENT_APPROVED');
        if (!template) throw new Error('Default payment approval message is unavailable.');
        const intent = await tx.messageIntent.create({
          data: {
            studentId: payment.studentId,
            channelIdentityId: identity.id,
            category: 'PAYMENT_APPROVED',
            status: MessageIntentStatus.PENDING,
            idempotencyKey: `payment-approved:${payment.id}`,
            dueAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
            aggregateVersion: activatedStudent.version,
            payload: {
              rendered: renderMessageTemplate('PAYMENT_APPROVED', template, variables),
              eventKey: 'PAYMENT_APPROVED',
            },
          },
        });
        await tx.systemEventOccurrence.create({
          data: {
            eventKey: 'PAYMENT_APPROVED',
            studentId: payment.studentId,
            idempotencyKey: `payment-approved:${payment.id}:event`,
            variables,
            occurredAt: now,
          },
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'message.intents',
            aggregateType: 'MessageIntent',
            aggregateId: intent.id,
            eventType: 'MessageIntentCreated',
            payload: { intentId: intent.id },
          },
        });
      }
      await tx.outboxEvent.create({
        data: {
          topic: 'student.events',
          aggregateType: 'SubscriptionPeriod',
          aggregateId: subscription.id,
          eventType: start > today ? 'SUBSCRIPTION_SCHEDULED' : 'STUDENT_ACTIVATED',
          payload: { subscriptionId: subscription.id, studentId: payment.studentId },
        },
      });
      return subscription;
    });
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeZone: 'Europe/Istanbul',
    }).format(value);
  }

  private formatInclusiveEndDate(endExclusive: Date): string {
    const inclusiveEnd = new Date(endExclusive);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
    return this.formatDate(inclusiveEnd);
  }
}
