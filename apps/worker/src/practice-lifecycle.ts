import { randomBytes } from 'node:crypto';
import {
  endOfLocalServiceDate,
  LookupHmac,
  practiceTiming,
  renderMessageTemplate,
  resolveMessageVariant,
  type ApplicationConfig,
  type Clock,
  type SystemEventKey,
} from '@meditation/core';
import {
  MessageIntentStatus,
  PracticePlanStatus,
  PracticeSessionStatus,
  PrismaClient,
  ProviderTemplateStatus,
  StandardMessageVersionStatus,
  SubscriptionStatus,
} from '@meditation/database';

type LifecycleEvent = 'PRACTICE_REMINDER' | 'PRACTICE_CHECKIN';
type PracticeLifecycleConfig = Pick<ApplicationConfig, 'LOOKUP_HMAC_KEY'>;

function timingVariables(
  eventKey: LifecycleEvent,
  session: { startAt: Date; durationMinutes: number },
  timezone: string,
): Record<string, string> {
  const durationText = `${session.durationMinutes} dakika`;
  if (eventKey === 'PRACTICE_CHECKIN') return { durationText };
  return {
    durationText,
    startsAtText: new Intl.DateTimeFormat('tr-TR', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(session.startAt),
  };
}

export async function createPracticeLifecycleIntent(
  prisma: PrismaClient,
  clock: Clock,
  config: PracticeLifecycleConfig,
  sessionId: string,
  expectedStatus: PracticeSessionStatus,
  expectedVersion: number,
  eventKey: LifecycleEvent,
): Promise<boolean> {
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const session = await tx.practiceSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        student: { include: { defaultChannelIdentity: { include: { channelAccount: true } } } },
        practiceSlot: true,
        practicePlan: { include: { subscriptionPeriod: true } },
      },
    });
    if (session.status !== expectedStatus || session.version !== expectedVersion) return false;
    if (
      session.practicePlan.status !== PracticePlanStatus.ACTIVE ||
      session.practicePlan.subscriptionPeriod.status !== SubscriptionStatus.ACTIVE ||
      !session.student.defaultChannelIdentity
    )
      return false;

    const versions = await tx.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: now },
        variant: {
          channel: session.student.defaultChannelIdentity.channelAccount.type,
          standardMessage: { eventKey, audience: 'STUDENT' },
        },
      },
      include: { variant: { include: { providerBinding: true } } },
    });
    const variant = resolveMessageVariant(
      versions.map((version) => ({
        ...version,
        locale: version.variant.locale,
        stage: version.variant.curriculumStage,
        slot: version.variant.slot,
        priority: version.variant.priority,
        requiresStudentName: version.variant.requiresStudentName,
        effectiveAt: version.effectiveAt!,
      })),
      {
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        slot: session.practiceSlot?.slotKey,
        hasStudentName: false,
      },
    );
    if (!variant) return false;

    const variables = timingVariables(eventKey, session, session.student.timezone);
    const rendered = renderMessageTemplate(eventKey as SystemEventKey, variant.content, variables);
    const timing = practiceTiming(session.startAt, session.durationMinutes);
    const dueAt = eventKey === 'PRACTICE_REMINDER' ? timing.reminderDueAt : timing.checkinDueAt;
    const expiresAt =
      eventKey === 'PRACTICE_REMINDER'
        ? session.startAt
        : endOfLocalServiceDate(session.serviceDate, session.student.timezone);
    const nonce = randomBytes(24).toString('base64url');
    if (!config.LOOKUP_HMAC_KEY) throw new Error('LOOKUP_HMAC_KEY is required.');
    const nonceHmac = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64')).digest(nonce);
    const nextVersion = session.version + 1;
    const changed = await tx.practiceSession.updateMany({
      where: { id: session.id, status: expectedStatus, version: expectedVersion },
      data: {
        status:
          eventKey === 'PRACTICE_REMINDER'
            ? PracticeSessionStatus.REMINDED
            : PracticeSessionStatus.AWAITING_RESPONSE,
        replyNonceHmac: eventKey === 'PRACTICE_CHECKIN' ? nonceHmac : undefined,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) return false;

    const suffix = eventKey === 'PRACTICE_REMINDER' ? 'reminder' : 'checkin';
    const eventIdempotencyKey = `practice:${session.id}:${suffix}:v${nextVersion}`;
    const occurrence = await tx.systemEventOccurrence.create({
      data: {
        eventKey,
        studentId: session.studentId,
        idempotencyKey: eventIdempotencyKey,
        variables,
        occurredAt: now,
      },
    });
    const binding = variant.variant.providerBinding;
    const approvedBinding =
      binding?.status === ProviderTemplateStatus.APPROVED ? binding : undefined;
    const intent = await tx.messageIntent.create({
      data: {
        studentId: session.studentId,
        channelIdentityId: session.student.defaultChannelIdentity.id,
        category: eventKey,
        status: MessageIntentStatus.PENDING,
        idempotencyKey: `system-event:${occurrence.id}`,
        dueAt,
        expiresAt,
        aggregateVersion: nextVersion,
        payload: {
          eventKey,
          practiceSessionId: session.id,
          standardMessageVersionId: variant.id,
          rendered,
          locale: variant.variant.locale,
          replyNonce: eventKey === 'PRACTICE_CHECKIN' ? nonce : undefined,
          quickReplies:
            eventKey === 'PRACTICE_CHECKIN'
              ? [
                  {
                    id: `practice:${session.id}:${nonce}:COMPLETED`,
                    title: 'Yaptım',
                  },
                  {
                    id: `practice:${session.id}:${nonce}:SKIPPED`,
                    title: 'Bugün yapamadım',
                  },
                ]
              : undefined,
          providerTemplateName: approvedBinding?.templateName,
          providerTemplateLocale: approvedBinding?.providerLocale,
          providerTemplateParameters: approvedBinding
            ? (variant.placeholders as string[]).map((key) => String(variables[key] ?? ''))
            : undefined,
        },
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
    return true;
  });
}

export async function processPracticeLifecycle(
  prisma: PrismaClient,
  clock: Clock,
  config: ApplicationConfig,
): Promise<void> {
  const now = clock.now();
  const upcoming = await prisma.practiceSession.findMany({
    where: {
      status: PracticeSessionStatus.SCHEDULED,
      startAt: { lte: new Date(now.getTime() + 10 * 60_000), gt: now },
    },
    orderBy: { startAt: 'asc' },
    take: 200,
  });
  for (const session of upcoming)
    await createPracticeLifecycleIntent(
      prisma,
      clock,
      config,
      session.id,
      PracticeSessionStatus.SCHEDULED,
      session.version,
      'PRACTICE_REMINDER',
    );

  const ready = await prisma.practiceSession.findMany({
    where: {
      status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
      startAt: { lte: now },
    },
    orderBy: { startAt: 'asc' },
    take: 200,
  });
  for (const session of ready) {
    if (practiceTiming(session.startAt, session.durationMinutes).checkinDueAt > now) continue;
    await createPracticeLifecycleIntent(
      prisma,
      clock,
      config,
      session.id,
      session.status,
      session.version,
      'PRACTICE_CHECKIN',
    );
  }

  const awaiting = await prisma.practiceSession.findMany({
    where: { status: PracticeSessionStatus.AWAITING_RESPONSE },
    include: { student: { select: { timezone: true } } },
    orderBy: { startAt: 'asc' },
    take: 200,
  });
  for (const session of awaiting) {
    if (endOfLocalServiceDate(session.serviceDate, session.student.timezone) > now) continue;
    await prisma.practiceSession.updateMany({
      where: {
        id: session.id,
        status: PracticeSessionStatus.AWAITING_RESPONSE,
        version: session.version,
      },
      data: { status: PracticeSessionStatus.MISSED, version: { increment: 1 } },
    });
  }
}
