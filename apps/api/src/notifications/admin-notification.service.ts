import { Inject, Injectable } from '@nestjs/common';
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
    private readonly prisma: PrismaService,
    @Inject(ADMIN_EMAIL_ADAPTER) private readonly email: AdminEmailAdapter,
  ) {}

  async sendEmail(message: AdminEmailMessage, recipientHmac: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        channel: NotificationChannel.EMAIL,
        eventType: message.eventType,
        recipientHmac,
        status: 'PENDING',
        attempts: 1,
      },
    });
    try {
      const result = await this.email.send(message);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', providerMessageId: result.providerMessageId },
      });
    } catch (error) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', errorCode: error instanceof Error ? error.name : 'UnknownError' },
      });
      throw error;
    }
  }
}
