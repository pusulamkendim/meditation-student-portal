import { Inject, Injectable } from '@nestjs/common';
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

function addMonth(date: Date): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
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
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = requestedStart && requestedStart > today ? requestedStart : today;
    const end = addMonth(start);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
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
      const activatedStudent = await tx.student.update({
        where: { id: payment.studentId },
        data: {
          status: start > today ? StudentStatus.INACTIVE : StudentStatus.ACTIVE,
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
          subscriptionEndsAtText: this.formatDate(end),
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
}
