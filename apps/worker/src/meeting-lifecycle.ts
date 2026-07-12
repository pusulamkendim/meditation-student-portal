import {
  FieldEncryption,
  renderMessageTemplate,
  resolveMessageVariant,
  type ApplicationConfig,
  type Clock,
  type SystemEventKey,
} from '@meditation/core';
import {
  ConferenceStatus,
  MessageIntentStatus,
  PrismaClient,
  ProviderTemplateStatus,
  StandardMessageVersionStatus,
  SubscriptionStatus,
  type Prisma,
} from '@meditation/database';

type ReminderEvent = 'MEETING_REMINDER_24H' | 'MEETING_REMINDER_1H';
type MeetingLifecycleConfig = Pick<
  ApplicationConfig,
  'DATA_ENCRYPTION_KEYS_JSON' | 'ACTIVE_DATA_KEY_ID'
>;

export async function createMeetingIntent(
  prisma: PrismaClient,
  clock: Clock,
  config: MeetingLifecycleConfig,
  meetingId: string,
  eventKey: ReminderEvent | 'MEETING_SCHEDULED',
  idempotencyKey: string,
): Promise<boolean> {
  const encryption = createEncryption(config);
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: {
        meetingSeries: {
          include: {
            student: { include: { defaultChannelIdentity: { include: { channelAccount: true } } } },
            subscriptionPeriod: true,
          },
        },
      },
    });
    if (!meeting || meeting.status !== 'SCHEDULED') return false;
    if (meeting.meetingSeries.subscriptionPeriod.status !== SubscriptionStatus.ACTIVE) return false;
    const identity = meeting.meetingSeries.student.defaultChannelIdentity;
    if (!identity || identity.status !== 'ACTIVE') return false;
    if (
      meeting.meetingSeries.conferenceStatus !== ConferenceStatus.READY &&
      meeting.meetingSeries.conferenceStatus !== ConferenceStatus.MANUAL_OVERRIDE
    )
      return false;
    if (!meeting.meetingSeries.meetUrlEncrypted || !meeting.meetingSeries.meetUrlKeyId)
      return false;
    const meetUrl = encryption.decrypt(
      {
        ciphertext: Buffer.from(meeting.meetingSeries.meetUrlEncrypted),
        keyId: meeting.meetingSeries.meetUrlKeyId,
      },
      `meeting-series:${meeting.meetingSeries.id}:meet-url`,
    );
    const versions = await tx.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: now },
        variant: {
          channel: identity.channelAccount.type,
          standardMessage: { eventKey, audience: 'STUDENT' },
        },
      },
      include: { variant: { include: { providerBinding: true } } },
    });
    const studentDisplayName =
      meeting.meetingSeries.student.fullNameEncrypted && meeting.meetingSeries.student.fullNameKeyId
        ? encryption.decrypt(
            {
              ciphertext: Buffer.from(meeting.meetingSeries.student.fullNameEncrypted),
              keyId: meeting.meetingSeries.student.fullNameKeyId,
            },
            `student:${meeting.meetingSeries.studentId}:name`,
          )
        : undefined;
    if (eventKey === 'MEETING_SCHEDULED' && !studentDisplayName) return false;
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
        locale: meeting.meetingSeries.student.preferredLocale,
        stage: meeting.meetingSeries.student.curriculumStage,
        hasStudentName: Boolean(studentDisplayName),
      },
    );
    if (!variant) return false;
    const variables: Record<string, string> = {
      startsAtText: new Intl.DateTimeFormat('tr-TR', {
        timeZone: meeting.meetingSeries.timezone,
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(meeting.startsAt),
      meetUrl,
      ...(eventKey === 'MEETING_SCHEDULED' && studentDisplayName ? { studentDisplayName } : {}),
    };
    const rendered = renderMessageTemplate(eventKey as SystemEventKey, variant.content, variables);
    const binding = variant.variant.providerBinding;
    const approvedBinding =
      binding?.status === ProviderTemplateStatus.APPROVED ? binding : undefined;
    const occurrence = await tx.systemEventOccurrence.upsert({
      where: { idempotencyKey },
      create: {
        eventKey,
        studentId: meeting.meetingSeries.studentId,
        idempotencyKey,
        variables: variables as Prisma.InputJsonValue,
        occurredAt: now,
      },
      update: {},
    });
    const intent = await tx.messageIntent.upsert({
      where: { idempotencyKey: `system-event:${occurrence.id}` },
      create: {
        studentId: meeting.meetingSeries.studentId,
        channelIdentityId: identity.id,
        category: 'SYSTEM_STANDARD_MESSAGE',
        status: MessageIntentStatus.PENDING,
        idempotencyKey: `system-event:${occurrence.id}`,
        dueAt: now,
        expiresAt: meeting.startsAt,
        aggregateVersion: meeting.version,
        payload: {
          eventKey,
          meetingId: meeting.id,
          standardMessageVersionId: variant.id,
          rendered,
          locale: variant.variant.locale,
          providerTemplateName: approvedBinding?.templateName,
          providerTemplateLocale: approvedBinding?.providerLocale,
          providerTemplateParameters: approvedBinding
            ? (variant.placeholders as string[]).map((key) => String(variables[key] ?? ''))
            : undefined,
        },
      },
      update: {},
    });
    const existingOutbox = await tx.outboxEvent.findFirst({
      where: {
        topic: 'message.intents',
        aggregateId: intent.id,
        eventType: 'MessageIntentCreated',
      },
    });
    if (!existingOutbox) {
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
    const aiOutbox = await tx.outboxEvent.findFirst({
      where: {
        topic: 'llm.weekly-summary',
        aggregateId: meetingId,
        eventType: 'WeeklySummaryAiRequested',
      },
    });
    if (!aiOutbox) {
      await tx.outboxEvent.create({
        data: {
          topic: 'llm.weekly-summary',
          aggregateType: 'WeeklyMeeting',
          aggregateId: meetingId,
          eventType: 'WeeklySummaryAiRequested',
          payload: { meetingId },
        },
      });
    }
    return true;
  });
}

export async function createMeetingSummary(
  prisma: PrismaClient,
  clock: Clock,
  meetingId: string,
): Promise<boolean> {
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const meeting = await tx.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: { meetingSeries: true },
    });
    if (!meeting) return false;
    const existing = await tx.weeklySummary.findUnique({ where: { meetingId } });
    if (existing) return false;
    const weekStart = new Date(meeting.startsAt.getTime() - 7 * 86_400_000);
    const sessions = await tx.practiceSession.findMany({
      where: {
        studentId: meeting.meetingSeries.studentId,
        startAt: { gte: weekStart, lt: meeting.startsAt },
      },
      select: { status: true },
    });
    const planned = sessions.length;
    const completed = sessions.filter((item) => item.status === 'COMPLETED').length;
    const skipped = sessions.filter((item) => item.status === 'SKIPPED').length;
    const missed = sessions.filter((item) => item.status === 'MISSED').length;
    await tx.weeklySummary.create({
      data: {
        meetingId,
        plannedPracticeCount: planned,
        completedPracticeCount: completed,
        skippedPracticeCount: skipped,
        missedPracticeCount: missed,
        completionRate: planned ? completed / planned : 0,
        highlights: {
          weekStart: weekStart.toISOString(),
          weekEnd: meeting.startsAt.toISOString(),
          privacy: 'deterministic-counts-only',
        },
        generatedAt: now,
      },
    });
    const summaryOccurrence = await tx.systemEventOccurrence.upsert({
      where: { idempotencyKey: `meeting:${meetingId}:summary:3h` },
      create: {
        eventKey: 'ADMIN_WEEKLY_SUMMARY_READY',
        studentId: meeting.meetingSeries.studentId,
        idempotencyKey: `meeting:${meetingId}:summary:3h`,
        variables: {
          studentReference: `M-${meeting.meetingSeries.id.slice(0, 8).toUpperCase()}`,
          weekRangeText: `${weekStart.toISOString()} - ${meeting.startsAt.toISOString()}`,
          summaryUrl: `/meetings/${meetingId}`,
        },
        occurredAt: now,
      },
      update: {},
    });
    const existingOutbox = await tx.outboxEvent.findFirst({
      where: {
        topic: 'admin.notifications',
        aggregateId: meetingId,
        eventType: 'WeeklySummaryReady',
      },
    });
    if (!existingOutbox) {
      await tx.outboxEvent.create({
        data: {
          topic: 'admin.notifications',
          aggregateType: 'WeeklyMeeting',
          aggregateId: meetingId,
          eventType: 'WeeklySummaryReady',
          payload: { occurrenceId: summaryOccurrence.id, meetingId },
        },
      });
    }
    return true;
  });
}

export async function processMeetingLifecycle(
  prisma: PrismaClient,
  clock: Clock,
  config: MeetingLifecycleConfig,
): Promise<void> {
  const now = clock.now();
  const meetings = await prisma.weeklyMeeting.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { gt: now, lte: new Date(now.getTime() + 25 * 60 * 60_000) },
    },
    select: { id: true, startsAt: true, version: true },
    orderBy: { startsAt: 'asc' },
    take: 250,
  });
  for (const meeting of meetings) {
    if (isReminderDue(now, meeting.startsAt, 24 * 60 * 60_000)) {
      await createMeetingIntent(
        prisma,
        clock,
        config,
        meeting.id,
        'MEETING_REMINDER_24H',
        `meeting:${meeting.id}:reminder:24h:v${meeting.version}`,
      );
    }
    if (isReminderDue(now, meeting.startsAt, 60 * 60_000)) {
      await createMeetingIntent(
        prisma,
        clock,
        config,
        meeting.id,
        'MEETING_REMINDER_1H',
        `meeting:${meeting.id}:reminder:1h:v${meeting.version}`,
      );
    }
    if (isReminderDue(now, meeting.startsAt, 3 * 60 * 60_000)) {
      await createMeetingSummary(prisma, clock, meeting.id);
    }
  }
}

export async function processMeetingReminder(
  prisma: PrismaClient,
  clock: Clock,
  config: MeetingLifecycleConfig,
  leadTimeMs: number,
  eventKey: ReminderEvent,
): Promise<void> {
  const now = clock.now();
  const meetings = await prisma.weeklyMeeting.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { gt: now, lte: new Date(now.getTime() + leadTimeMs) },
    },
    select: { id: true, startsAt: true, version: true },
    orderBy: { startsAt: 'asc' },
    take: 250,
  });
  const suffix = eventKey === 'MEETING_REMINDER_24H' ? '24h' : '1h';
  for (const meeting of meetings) {
    if (!isReminderDue(now, meeting.startsAt, leadTimeMs)) continue;
    await createMeetingIntent(
      prisma,
      clock,
      config,
      meeting.id,
      eventKey,
      `meeting:${meeting.id}:reminder:${suffix}:v${meeting.version}`,
    );
  }
}

export async function processMeetingSummaries(prisma: PrismaClient, clock: Clock): Promise<void> {
  const now = clock.now();
  const meetings = await prisma.weeklyMeeting.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { gt: now, lte: new Date(now.getTime() + 3 * 60 * 60_000) },
    },
    select: { id: true },
    orderBy: { startsAt: 'asc' },
    take: 250,
  });
  for (const meeting of meetings) await createMeetingSummary(prisma, clock, meeting.id);
}

export function isReminderDue(now: Date, startsAt: Date, leadTimeMs: number): boolean {
  const remaining = startsAt.getTime() - now.getTime();
  return remaining > 0 && remaining <= leadTimeMs;
}

function createEncryption(config: MeetingLifecycleConfig): FieldEncryption {
  if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
    throw new Error('Worker encryption keys are required.');
  const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
  return new FieldEncryption(
    new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
    config.ACTIVE_DATA_KEY_ID,
  );
}
