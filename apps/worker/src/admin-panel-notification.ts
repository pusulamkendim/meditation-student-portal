import { createHash } from 'node:crypto';

import { NotificationChannel, PrismaClient } from '@meditation/database';

const adminPanelRecipient = createHash('sha256').update('admin-panel').digest('hex');

export class AdminPanelNotificationProcessor {
  constructor(private readonly prisma: PrismaClient) {}

  async process(outboxEventId: string): Promise<'processed' | 'ignored'> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
    if (!event || event.topic !== 'admin.notifications') return 'ignored';
    const handoff =
      event.aggregateType === 'Handoff'
        ? await this.prisma.handoff.findUnique({ where: { id: event.aggregateId } })
        : undefined;
    const status = handoff?.status === 'RESOLVED' ? 'RESOLVED' : 'SENT';

    await this.prisma.notificationDelivery.upsert({
      where: { deliveryKey: `admin-panel:${event.id}` },
      create: {
        deliveryKey: `admin-panel:${event.id}`,
        channel: NotificationChannel.ADMIN_PANEL,
        eventType: event.eventType,
        recipientHmac: adminPanelRecipient,
        providerMessageId: event.aggregateId,
        status,
        attempts: 1,
      },
      update: { status },
    });
    return 'processed';
  }
}
