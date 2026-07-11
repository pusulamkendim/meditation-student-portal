import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_TOKEN, type Clock } from '@meditation/core';
import { NotificationChannel } from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';
import {
  ADMIN_EMAIL_ADAPTER,
  type AdminEmailAdapter,
  type AdminEmailMessage,
} from './admin-email.adapter.js';

@Injectable()
export class AdminNotificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ADMIN_EMAIL_ADAPTER) private readonly email: AdminEmailAdapter,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async sendEmail(
    message: AdminEmailMessage,
    recipientHmac: string,
    deliveryKey: string,
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.upsert({
      where: { deliveryKey },
      create: {
        deliveryKey,
        channel: NotificationChannel.EMAIL,
        eventType: message.eventType,
        recipientHmac,
        status: 'PENDING',
        attempts: 0,
      },
      update: {},
    });

    if (delivery.status === 'SENT') return;

    const staleBefore = new Date(this.clock.now().getTime() - 5 * 60 * 1000);
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        errorCode: null,
      },
    });

    // Another worker owns this delivery, or it was completed after the initial read.
    if (claimed.count === 0) return;

    try {
      const result = await this.email.send(message);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', providerMessageId: result.providerMessageId },
      });
    } catch (error) {
      try {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            errorCode: error instanceof Error ? error.name : 'UnknownError',
          },
        });
      } catch (trackingError) {
        throw new AggregateError(
          [error, trackingError],
          'Email send and delivery tracking failed.',
        );
      }
      throw error;
    }
  }
}
