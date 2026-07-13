import type { Clock } from '@meditation/core';
import type { PrismaClient } from '@meditation/database';

export type ResolvedConversationContext = {
  eventKey: string;
  entityType?: string;
  entityId?: string;
  sourceMessageId: string;
  method: 'EXPLICIT_REPLY' | 'RECENT_EVENT';
  variables: Record<string, unknown>;
  expiresAt: string;
};

export class ConversationContextResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
  ) {}

  async resolve(input: {
    inboxEventId: string;
    inboundMessageId: string;
    studentId: string;
    channelIdentityId: string;
    repliedToExternalMessageId?: string;
  }): Promise<ResolvedConversationContext | null> {
    const now = this.clock.now();
    const explicit = input.repliedToExternalMessageId
      ? await this.prisma.message.findFirst({
          where: {
            channelIdentityId: input.channelIdentityId,
            direction: 'OUTBOUND',
            externalMessageId: input.repliedToExternalMessageId,
            messageIntentId: { not: null },
            occurredAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000), lte: now },
          },
          include: { messageIntent: true },
        })
      : null;
    const recent = input.repliedToExternalMessageId
      ? null
      : await this.prisma.message.findFirst({
        where: {
          studentId: input.studentId,
          direction: 'OUTBOUND',
          messageIntentId: { not: null },
          occurredAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000), lte: now },
        },
        orderBy: { occurredAt: 'desc' },
        include: { messageIntent: true },
        });
    const source = explicit ?? recent;
    const payload = source?.messageIntent?.payload as Record<string, unknown> | undefined;
    const eventKey = typeof payload?.eventKey === 'string' ? payload.eventKey : undefined;
    if (!source || !eventKey) {
      await this.persist(input.inboxEventId, null, 'NONE', now);
      return null;
    }
    const eventPayload = payload!;
    const entity = [
      ['PracticeSession', eventPayload.practiceSessionId],
      ['WeeklyMeeting', eventPayload.meetingId],
      ['MeetingSeries', eventPayload.meetingSeriesId],
    ].find(([, id]) => typeof id === 'string');
    const expiresAt = explicit
      ? new Date(Math.max(source.messageIntent!.expiresAt.getTime(), now.getTime() + 60 * 60_000))
      : new Date(source.occurredAt.getTime() + 24 * 60 * 60_000);
    const resolved: ResolvedConversationContext = {
      eventKey,
      entityType: entity?.[0] as string | undefined,
      entityId: entity?.[1] as string | undefined,
      sourceMessageId: source.id,
      method: explicit ? 'EXPLICIT_REPLY' : 'RECENT_EVENT',
      variables: Object.fromEntries(
        Object.entries(eventPayload).filter(
          ([key, value]) =>
            typeof value === 'string' &&
            (/Text$/.test(key) || /^(eventKey|practiceSessionId|meetingId|meetingSeriesId)$/.test(key)),
        ),
      ),
      expiresAt: expiresAt.toISOString(),
    };
    await this.prisma.$transaction([
      this.prisma.conversationContextResolution.upsert({
        where: { inboxEventId: input.inboxEventId },
        create: {
          inboxEventId: input.inboxEventId,
          sourceMessageId: source.id,
          eventKey,
          entityType: resolved.entityType,
          entityId: resolved.entityId,
          resolutionMethod: resolved.method,
          expiresAt,
          resolvedAt: now,
        },
        update: {},
      }),
      this.prisma.message.update({
        where: { id: input.inboundMessageId },
        data: { replyToMessageId: source.id },
      }),
    ]);
    return resolved;
  }

  private async persist(inboxEventId: string, sourceMessageId: string | null, method: string, now: Date) {
    await this.prisma.conversationContextResolution.upsert({
      where: { inboxEventId },
      create: { inboxEventId, sourceMessageId, resolutionMethod: method, resolvedAt: now },
      update: {},
    });
  }
}

export function sectionForEvent(eventKey: string): 'PRACTICE' | 'MEETINGS' | 'PAYMENT' | 'MEMBERSHIP' | null {
  if (eventKey.startsWith('PRACTICE_')) return 'PRACTICE';
  if (eventKey.startsWith('MEETING_') || eventKey === 'MEET_LINK_UNAVAILABLE') return 'MEETINGS';
  if (eventKey.startsWith('PAYMENT_')) return 'PAYMENT';
  if (eventKey.startsWith('SUBSCRIPTION_')) return 'MEMBERSHIP';
  return null;
}
