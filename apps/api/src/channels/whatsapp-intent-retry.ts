import { MessageIntentStatus, type Prisma } from '@meditation/database';

const retryDelayMs = 30_000;

export async function requeueSuppressedWhatsAppIntents(
  transaction: Prisma.TransactionClient,
  channelIdentityIds: string[],
  inboundAt: Date,
): Promise<number> {
  if (!channelIdentityIds.length) return 0;
  const candidates = await transaction.messageIntent.findMany({
    where: {
      channelIdentityId: { in: channelIdentityIds },
      status: MessageIntentStatus.SUPPRESSED,
      suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
      dueAt: { lte: inboundAt },
      expiresAt: { gt: inboundAt },
    },
    orderBy: { dueAt: 'asc' },
    take: 20,
    select: { id: true },
  });
  let requeued = 0;
  for (const candidate of candidates) {
    const changed = await transaction.messageIntent.updateMany({
      where: {
        id: candidate.id,
        status: MessageIntentStatus.SUPPRESSED,
        suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
      },
      data: {
        status: MessageIntentStatus.PENDING,
        suppressionReason: null,
      },
    });
    if (changed.count !== 1) continue;
    await transaction.outboxEvent.create({
      data: {
        topic: 'message.intents',
        aggregateType: 'MessageIntent',
        aggregateId: candidate.id,
        eventType: 'MessageIntentRetryRequested',
        payload: { intentId: candidate.id },
        availableAt: new Date(inboundAt.getTime() + retryDelayMs),
      },
    });
    requeued += 1;
  }
  return requeued;
}
