import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  generateMeetingOccurrences,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  CalendarDiscrepancyStatus,
  CalendarSyncStatus,
  ConferenceStatus,
  MeetingScheduleAction,
  MeetingStatus,
  SubscriptionStatus,
  type Prisma,
} from '@meditation/database';
import { randomUUID } from 'node:crypto';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

type Transaction = Prisma.TransactionClient;
type MeetingStatusValue = keyof typeof MeetingStatus;
type StudentRecord = {
  id: string;
  fullNameEncrypted: Uint8Array | null;
  fullNameKeyId: string | null;
};
type SeriesRecord = {
  id: string;
  studentId: string;
  subscriptionPeriodId: string;
  timezone: string;
  recurrenceRule: string;
  googleSeriesId: string | null;
  version: number;
  meetUrlEncrypted: Uint8Array | null;
  meetUrlKeyId: string | null;
  conferenceStatus: string;
  student: StudentRecord;
  meetings?: Array<{
    id: string;
    occurrenceNumber: number;
    startsAt: Date;
    endsAt: Date;
    status: string;
    version: number;
  }>;
};
type SeriesWithMeetings = SeriesRecord & {
  meetings: Array<{
    id: string;
    occurrenceNumber: number;
    startsAt: Date;
    endsAt: Date;
    status: string;
    version: number;
  }>;
};
type MeetingRecord = {
  id: string;
  occurrenceNumber: number;
  startsAt: Date;
  endsAt: Date;
  originalStartsAt: Date | null;
  status: string;
  version: number;
  calendarSyncStatus: string;
  meetingSeries: SeriesRecord;
  summary?: {
    generatedAt: Date;
    plannedPracticeCount: number;
    completedPracticeCount: number;
    skippedPracticeCount: number;
    missedPracticeCount: number;
    completionRate: number;
  } | null;
  coachNotes?: Array<{
    id: string;
    version: number;
    content: string;
    createdByAdminId: string;
    createdAt: Date;
  }>;
  discrepancies?: Array<{ id: string; type: string; status: string; createdAt: Date }>;
};

@Injectable()
export class MeetingService {
  private readonly encryption: FieldEncryption;
  private readonly environment: ApplicationConfig['NODE_ENV'];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
    @Inject(SystemMessageOrchestrator) private readonly messages: SystemMessageOrchestrator,
  ) {
    this.environment = config.NODE_ENV;
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID) {
      throw new Error('Meeting encryption keys are required.');
    }
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async list(options: { status?: MeetingStatusValue; from?: Date; to?: Date } = {}) {
    const meetings = await this.prisma.weeklyMeeting.findMany({
      where: {
        status: options.status,
        startsAt: {
          gte: options.from,
          lte: options.to,
        },
      },
      include: {
        meetingSeries: { include: { student: true, subscriptionPeriod: true } },
        summary: true,
        discrepancies: { where: { status: CalendarDiscrepancyStatus.OPEN }, take: 5 },
      },
      orderBy: { startsAt: 'asc' },
      take: 250,
    });
    return {
      items: meetings.map((meeting) => this.presentMeeting(meeting)),
      connection: await this.connectionStatus(),
    };
  }

  async subscriptions() {
    const subscriptions = await this.prisma.subscriptionPeriod.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
        meetingSeries: { none: {} },
      },
      include: { student: true },
      orderBy: { startDate: 'asc' },
      take: 200,
    });
    return {
      items: subscriptions.map((subscription) => ({
        id: subscription.id,
        studentId: subscription.studentId,
        studentName:
          subscription.student.fullNameEncrypted && subscription.student.fullNameKeyId
            ? this.encryption.decrypt(
                {
                  ciphertext: Buffer.from(subscription.student.fullNameEncrypted),
                  keyId: subscription.student.fullNameKeyId,
                },
                `student:${subscription.studentId}:name`,
              )
            : undefined,
        status: subscription.status,
        timezone: subscription.student.timezone,
        startDate: subscription.startDate.toISOString(),
        endExclusive: subscription.endExclusive.toISOString(),
      })),
    };
  }

  async get(meetingId: string) {
    const meeting = await this.prisma.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: {
        meetingSeries: { include: { student: true, subscriptionPeriod: true } },
        summary: true,
        coachNotes: { orderBy: { version: 'desc' }, take: 20 },
        scheduleEvents: { orderBy: { createdAt: 'desc' }, take: 30 },
        discrepancies: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting not found.');
    return this.presentMeeting(meeting);
  }

  async listSummaryDrafts(meetingId?: string) {
    const drafts = await this.prisma.weeklySummaryDraftVersion.findMany({
      where: meetingId ? { meetingId } : undefined,
      include: { meeting: { include: { meetingSeries: { include: { student: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return drafts.map((draft) => ({
      id: draft.id,
      meetingId: draft.meetingId,
      version: draft.version,
      status: draft.status,
      createdAt: draft.createdAt,
      approvedAt: draft.approvedAt,
      sentAt: draft.sentAt,
      content: this.encryption.decrypt(
        { ciphertext: Buffer.from(draft.contentEncrypted), keyId: draft.contentKeyId },
        `weekly-summary:${draft.meetingId}:v${draft.version}`,
      ),
      studentId: draft.meeting.meetingSeries.studentId,
    }));
  }

  async editSummaryDraft(meetingId: string, content: string, adminId: string) {
    const latest = await this.prisma.weeklySummaryDraftVersion.findFirst({
      where: { meetingId },
      orderBy: { version: 'desc' },
    });
    if (!latest) throw new NotFoundException('Summary draft not found.');
    const version = latest.version + 1;
    const encrypted = this.encryption.encrypt(
      content.trim(),
      `weekly-summary:${meetingId}:v${version}`,
    );
    return this.prisma.weeklySummaryDraftVersion.create({
      data: {
        meetingId,
        version,
        contentEncrypted: new Uint8Array(encrypted.ciphertext),
        contentKeyId: encrypted.keyId,
        status: 'DRAFT',
        createdByAdminId: adminId,
      },
    });
  }

  async approveSummaryDraft(draftId: string, adminId: string) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.weeklySummaryDraftVersion.findUnique({
        where: { id: draftId },
        include: {
          meeting: {
            include: {
              meetingSeries: {
                include: {
                  student: { include: { messagingPreference: true, defaultChannelIdentity: true } },
                  subscriptionPeriod: true,
                },
              },
            },
          },
        },
      });
      if (!draft) throw new NotFoundException('Summary draft not found.');
      if (draft.status !== 'DRAFT')
        throw new BadRequestException('Only draft summaries can be approved.');
      const student = draft.meeting.meetingSeries.student;
      const consent = await tx.consent.findFirst({
        where: { studentId: student.id, scope: 'MESSAGING' },
        orderBy: { occurredAt: 'desc' },
      });
      if (
        consent?.status !== 'GRANTED' ||
        student.status !== 'ACTIVE' ||
        draft.meeting.meetingSeries.subscriptionPeriod.status !== 'ACTIVE' ||
        !student.defaultChannelIdentity ||
        student.defaultChannelIdentity.status !== 'ACTIVE' ||
        student.messagingPreference?.proactiveEnabled === false
      )
        throw new BadRequestException('Summary sharing policy is not satisfied.');
      const content = this.encryption.decrypt(
        { ciphertext: Buffer.from(draft.contentEncrypted), keyId: draft.contentKeyId },
        `weekly-summary:${draft.meetingId}:v${draft.version}`,
      );
      const intent = await tx.messageIntent.create({
        data: {
          studentId: student.id,
          channelIdentityId: student.defaultChannelIdentity.id,
          category: 'WEEKLY_SUMMARY_SHARED',
          status: 'PENDING',
          idempotencyKey: `weekly-summary-share:${draft.id}`,
          dueAt: this.clock.now(),
          expiresAt: new Date(this.clock.now().getTime() + 86_400_000),
          aggregateVersion: student.version,
          payload: { rendered: content, draftId: draft.id },
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: intent.id,
          eventType: 'WeeklySummaryShared',
          payload: { intentId: intent.id },
        },
      });
      await tx.weeklySummaryDraftVersion.update({
        where: { id: draft.id },
        data: { status: 'APPROVED', approvedAt: this.clock.now(), createdByAdminId: adminId },
      });
      return { draftId: draft.id, intentId: intent.id, status: 'APPROVED' };
    });
  }

  async createSeries(subscriptionId: string, firstStartsAt: Date, adminId: string) {
    const now = this.clock.now();
    if (Number.isNaN(firstStartsAt.getTime()))
      throw new BadRequestException('Invalid meeting time.');
    if (firstStartsAt.getTime() <= now.getTime()) {
      throw new BadRequestException('First meeting must be in the future.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const subscription = await tx.subscriptionPeriod.findUnique({
          where: { id: subscriptionId },
          include: { student: true, meetingSeries: true },
        });
        if (!subscription) throw new NotFoundException('Subscription not found.');
        if (
          subscription.status !== SubscriptionStatus.ACTIVE &&
          subscription.status !== SubscriptionStatus.SCHEDULED
        ) {
          throw new BadRequestException(
            'Meeting series requires an active or scheduled subscription.',
          );
        }
        if (subscription.meetingSeries.length > 0)
          throw new ConflictException('Subscription already has a meeting series.');

        const occurrences = generateMeetingOccurrences(
          firstStartsAt,
          subscription.student.timezone,
          60,
          4,
        );
        if (occurrences.some((occurrence) => occurrence.startsAt >= subscription.endExclusive)) {
          throw new BadRequestException('All meetings must fit inside the subscription period.');
        }
        const series = await tx.meetingSeries.create({
          data: {
            studentId: subscription.studentId,
            subscriptionPeriodId: subscription.id,
            timezone: subscription.student.timezone,
            recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
            meetings: {
              create: occurrences.map((occurrence) => ({
                occurrenceNumber: occurrence.occurrenceNumber,
                startsAt: occurrence.startsAt,
                endsAt: occurrence.endsAt,
                originalStartsAt: occurrence.startsAt,
              })),
            },
          },
          include: { meetings: true },
        });
        const existingGrant = await tx.meetingCreditEvent.findFirst({
          where: { subscriptionPeriodId: subscription.id, reason: 'PACKAGE_GRANT' },
        });
        if (!existingGrant) {
          await tx.meetingCreditEvent.create({
            data: {
              subscriptionPeriodId: subscription.id,
              delta: 4,
              reason: 'PACKAGE_GRANT',
              idempotencyKey: `subscription:${subscription.id}:meeting-credit:grant`,
            },
          });
        }
        await tx.meetingScheduleEvent.create({
          data: {
            meetingSeriesId: series.id,
            action: MeetingScheduleAction.CREATED,
            newStartsAt: occurrences[0]!.startsAt,
            reason: 'Meeting series created',
            adminUserId: adminId,
            idempotencyKey: `meeting-series:${series.id}:created:v1`,
          },
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'meeting.calendar-create',
            aggregateType: 'MeetingSeries',
            aggregateId: series.id,
            eventType: 'MeetingSeriesCreated',
            payload: { seriesId: series.id },
          },
        });
        await tx.auditLog.create({
          data: {
            actorType: 'ADMIN',
            actorId: adminId,
            action: 'MEETING_SERIES_CREATED',
            entityType: 'MeetingSeries',
            entityId: series.id,
            safeDiff: { subscriptionId, occurrenceCount: 4, durationMinutes: 60 },
            reason: 'Meeting series created',
            requestId: randomUUID(),
            correlationId: randomUUID(),
          },
        });
        return this.presentSeries(
          { ...series, student: subscription.student },
          subscription.student,
        );
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error;
      if (isUniqueConstraint(error))
        throw new ConflictException('Subscription already has a meeting series.');
      throw error;
    }
  }

  async rescheduleMeeting(
    meetingId: string,
    startsAt: Date,
    expectedVersion: number,
    reason: string,
    adminId: string,
  ) {
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid meeting time.');
    const result = await this.prisma.$transaction(async (tx) => {
      const meeting = await tx.weeklyMeeting.findUnique({
        where: { id: meetingId },
        include: { meetingSeries: { include: { subscriptionPeriod: true } } },
      });
      if (!meeting) throw new NotFoundException('Meeting not found.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${meeting.meetingSeriesId}))`;
      if (meeting.status !== MeetingStatus.SCHEDULED)
        throw new BadRequestException('Only scheduled meetings can be rescheduled.');
      if (
        startsAt <= this.clock.now() ||
        startsAt >= meeting.meetingSeries.subscriptionPeriod.endExclusive
      )
        throw new BadRequestException(
          'Meeting time must be in the future and inside the subscription period.',
        );
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
      const changed = await tx.weeklyMeeting.updateMany({
        where: { id: meetingId, version: expectedVersion, status: MeetingStatus.SCHEDULED },
        data: {
          startsAt,
          endsAt,
          version: { increment: 1 },
          calendarSyncStatus: CalendarSyncStatus.PENDING,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Meeting changed by another admin. Refresh and retry.');
      await tx.meetingSeries.update({
        where: { id: meeting.meetingSeriesId },
        data: { version: { increment: 1 } },
      });
      await tx.meetingScheduleEvent.create({
        data: {
          meetingSeriesId: meeting.meetingSeriesId,
          meetingId,
          action: MeetingScheduleAction.RESCHEDULED,
          previousStartsAt: meeting.startsAt,
          newStartsAt: startsAt,
          reason,
          adminUserId: adminId,
          idempotencyKey: `meeting:${meetingId}:reschedule:v${expectedVersion}`,
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'meeting.calendar-update',
          aggregateType: 'WeeklyMeeting',
          aggregateId: meetingId,
          eventType: 'MeetingRescheduled',
          payload: { meetingId, seriesId: meeting.meetingSeriesId, version: expectedVersion + 1 },
        },
      });
      await this.audit(tx, adminId, 'MEETING_RESCHEDULED', 'WeeklyMeeting', meetingId, reason, {
        previousStartsAt: meeting.startsAt.toISOString(),
        newStartsAt: startsAt.toISOString(),
      });
      return {
        id: meetingId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        version: expectedVersion + 1,
        previousStartsAt: meeting.startsAt.toISOString(),
      };
    });
    await this.notifyMeetingChange(meetingId, 'MEETING_RESCHEDULED', {
      previousStartsAt: result.previousStartsAt,
    });
    return result;
  }

  async rescheduleSeries(
    seriesId: string,
    firstStartsAt: Date,
    expectedVersion: number,
    reason: string,
    adminId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
      const series = await tx.meetingSeries.findUnique({
        where: { id: seriesId },
        include: { meetings: true, student: true, subscriptionPeriod: true },
      });
      if (!series) throw new NotFoundException('Meeting series not found.');
      if (series.version !== expectedVersion)
        throw new ConflictException('Meeting series changed by another admin.');
      if (firstStartsAt <= this.clock.now())
        throw new BadRequestException('First meeting must be in the future.');
      if (series.meetings.some((meeting) => meeting.status !== MeetingStatus.SCHEDULED)) {
        throw new BadRequestException(
          'A series can only be moved before its first terminal occurrence.',
        );
      }
      const occurrences = generateMeetingOccurrences(firstStartsAt, series.timezone, 60, 4);
      if (
        occurrences.some(
          (occurrence) => occurrence.startsAt >= series.subscriptionPeriod.endExclusive,
        )
      )
        throw new BadRequestException('All meetings must fit inside the subscription period.');
      const updated = await tx.meetingSeries.updateMany({
        where: { id: seriesId, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Meeting series changed by another admin.');
      for (const occurrence of occurrences) {
        const meeting = series.meetings.find(
          (item) => item.occurrenceNumber === occurrence.occurrenceNumber,
        )!;
        const changedMeeting = await tx.weeklyMeeting.updateMany({
          where: { id: meeting.id, status: MeetingStatus.SCHEDULED, version: meeting.version },
          data: {
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            version: { increment: 1 },
            calendarSyncStatus: CalendarSyncStatus.PENDING,
          },
        });
        if (changedMeeting.count !== 1)
          throw new ConflictException('Meeting changed by another admin. Refresh and retry.');
        await tx.meetingScheduleEvent.create({
          data: {
            meetingSeriesId: seriesId,
            meetingId: meeting.id,
            action: MeetingScheduleAction.RESCHEDULED,
            previousStartsAt: meeting.startsAt,
            newStartsAt: occurrence.startsAt,
            reason,
            adminUserId: adminId,
            idempotencyKey: `meeting:${meeting.id}:series-reschedule:v${meeting.version}`,
          },
        });
      }
      await tx.outboxEvent.create({
        data: {
          topic: 'meeting.calendar-update',
          aggregateType: 'MeetingSeries',
          aggregateId: seriesId,
          eventType: 'MeetingSeriesRescheduled',
          payload: { seriesId, version: expectedVersion + 1 },
        },
      });
      await this.audit(
        tx,
        adminId,
        'MEETING_SERIES_RESCHEDULED',
        'MeetingSeries',
        seriesId,
        reason,
        { occurrenceCount: 4 },
      );
      return {
        id: seriesId,
        version: expectedVersion + 1,
        meetings: occurrences.map((item) => ({
          ...item,
          startsAt: item.startsAt.toISOString(),
          endsAt: item.endsAt.toISOString(),
        })),
      };
    });
  }

  async setStatus(
    meetingId: string,
    status: MeetingStatusValue,
    expectedVersion: number,
    reason: string,
    adminId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const meeting = await tx.weeklyMeeting.findUnique({
        where: { id: meetingId },
        include: { meetingSeries: true },
      });
      if (!meeting) throw new NotFoundException('Meeting not found.');
      if (meeting.version !== expectedVersion)
        throw new ConflictException('Meeting changed by another admin.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${meeting.meetingSeries.subscriptionPeriodId}))`;
      const delta = meetingCreditDelta(meeting.status, status);
      if (delta < 0) {
        const balance = await this.creditBalance(tx, meeting.meetingSeries.subscriptionPeriodId);
        if (balance + delta < 0)
          throw new BadRequestException('No meeting credit remains for this package.');
      }
      const changed = await tx.weeklyMeeting.updateMany({
        where: { id: meetingId, version: expectedVersion },
        data: { status, version: { increment: 1 }, calendarSyncStatus: CalendarSyncStatus.PENDING },
      });
      if (changed.count !== 1) throw new ConflictException('Meeting changed by another admin.');
      if (delta !== 0) {
        await tx.meetingCreditEvent.create({
          data: {
            subscriptionPeriodId: meeting.meetingSeries.subscriptionPeriodId,
            meetingId,
            delta,
            reason: `STATUS_${meeting.status}_TO_${status}`,
            idempotencyKey: `meeting:${meetingId}:credit:v${expectedVersion}:${status}`,
          },
        });
      }
      await tx.meetingScheduleEvent.create({
        data: {
          meetingSeriesId: meeting.meetingSeriesId,
          meetingId,
          action: MeetingScheduleAction.STATUS_CHANGED,
          previousStatus: meeting.status,
          newStatus: status,
          reason,
          adminUserId: adminId,
          idempotencyKey: `meeting:${meetingId}:status:v${expectedVersion}:${status}`,
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'meeting.calendar-update',
          aggregateType: 'WeeklyMeeting',
          aggregateId: meetingId,
          eventType: 'MeetingStatusChanged',
          payload: { meetingId, seriesId: meeting.meetingSeriesId, status },
        },
      });
      await this.audit(tx, adminId, 'MEETING_STATUS_CHANGED', 'WeeklyMeeting', meetingId, reason, {
        from: meeting.status,
        to: status,
        creditDelta: delta,
      });
      return {
        id: meetingId,
        status,
        version: expectedVersion + 1,
        creditDelta: delta,
        previousStatus: meeting.status,
      };
    });
    const eventKey =
      status === MeetingStatus.CANCELLED
        ? 'MEETING_CANCELLED'
        : status === MeetingStatus.COMPLETED
          ? 'MEETING_COMPLETED'
          : status === MeetingStatus.NO_SHOW
            ? 'MEETING_NO_SHOW'
            : status === MeetingStatus.SCHEDULED &&
                result.previousStatus === MeetingStatus.CANCELLED
              ? 'MEETING_SCHEDULED'
              : undefined;
    if (eventKey) await this.notifyMeetingChange(meetingId, eventKey);
    return result;
  }

  private async notifyMeetingChange(
    meetingId: string,
    eventKey:
      | 'MEETING_SCHEDULED'
      | 'MEETING_RESCHEDULED'
      | 'MEETING_CANCELLED'
      | 'MEETING_COMPLETED'
      | 'MEETING_NO_SHOW',
    context: { previousStartsAt?: string } = {},
  ) {
    const meeting = await this.prisma.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: {
        meetingSeries: {
          include: {
            student: { include: { defaultChannelIdentity: true } },
            meetings: {
              where: { status: MeetingStatus.SCHEDULED },
              orderBy: { startsAt: 'asc' },
            },
          },
        },
      },
    });
    const identity = meeting?.meetingSeries.student.defaultChannelIdentity;
    if (!meeting || !identity || identity.status !== 'ACTIVE') return;
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      timeZone: meeting.meetingSeries.timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const startsAtText = formatter.format(meeting.startsAt);
    const fullName =
      meeting.meetingSeries.student.fullNameEncrypted && meeting.meetingSeries.student.fullNameKeyId
        ? this.encryption.decrypt(
            {
              ciphertext: Buffer.from(meeting.meetingSeries.student.fullNameEncrypted),
              keyId: meeting.meetingSeries.student.fullNameKeyId,
            },
            `student:${meeting.meetingSeries.studentId}:name`,
          )
        : '';
    const studentDisplayName = fullName ? ` ${fullName.trim().split(/\s+/)[0]}` : '';
    let variables: Record<string, string>;
    if (eventKey === 'MEETING_RESCHEDULED' || eventKey === 'MEETING_SCHEDULED') {
      if (
        (eventKey === 'MEETING_RESCHEDULED' && !context.previousStartsAt) ||
        !meeting.meetingSeries.meetUrlEncrypted ||
        !meeting.meetingSeries.meetUrlKeyId
      )
        return;
      const meetUrl = this.encryption.decrypt(
        {
          ciphertext: Buffer.from(meeting.meetingSeries.meetUrlEncrypted),
          keyId: meeting.meetingSeries.meetUrlKeyId,
        },
        `meeting-series:${meeting.meetingSeries.id}:meet-url`,
      );
      variables = {
        ...(eventKey === 'MEETING_RESCHEDULED'
          ? { previousStartsAtText: formatter.format(new Date(context.previousStartsAt!)) }
          : {}),
        startsAtText,
        meetUrl,
        studentDisplayName,
      };
    } else if (eventKey === 'MEETING_COMPLETED') {
      const next = meeting.meetingSeries.meetings.find((item) => item.startsAt > this.clock.now());
      variables = {
        nextMeetingAtText: next ? `Bir sonraki görüşmemiz ${formatter.format(next.startsAt)}.` : '',
      };
    } else {
      variables = { startsAtText };
    }
    try {
      await this.messages.createIntent({
        eventKey,
        studentId: meeting.meetingSeries.studentId,
        channelIdentityId: identity.id,
        idempotencyKey: `meeting:${meeting.id}:${eventKey.toLowerCase()}:v${meeting.version}`,
        locale: meeting.meetingSeries.student.preferredLocale,
        stage: meeting.meetingSeries.student.curriculumStage,
        variables,
      });
    } catch {
      // Missing templates must not roll back an admin meeting change.
    }
  }

  async saveCoachNote(meetingId: string, content: string, adminId: string) {
    if (!content.trim()) throw new BadRequestException('Coach note cannot be empty.');
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.weeklyMeeting.findUnique({ where: { id: meetingId } });
      if (!meeting) throw new NotFoundException('Meeting not found.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${meetingId}))`;
      const latest = await tx.coachNoteVersion.findFirst({
        where: { meetingId },
        orderBy: { version: 'desc' },
      });
      const note = await tx.coachNoteVersion.create({
        data: {
          meetingId,
          version: (latest?.version ?? 0) + 1,
          content: content.trim(),
          createdByAdminId: adminId,
        },
      });
      await this.audit(
        tx,
        adminId,
        'COACH_NOTE_CREATED',
        'WeeklyMeeting',
        meetingId,
        'Coach note updated',
        { version: note.version },
      );
      return note;
    });
  }

  async setMeetOverride(seriesId: string, url: string, adminId: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Meet URL is invalid.');
    }
    if (
      parsed.protocol !== 'https:' &&
      !(this.environment === 'development' || this.environment === 'test')
    )
      throw new BadRequestException('Meet URL must use HTTPS.');
    if (!['https:', 'http:'].includes(parsed.protocol))
      throw new BadRequestException('Meet URL is invalid.');
    return this.prisma.$transaction(async (tx) => {
      const series = await tx.meetingSeries.findUnique({ where: { id: seriesId } });
      if (!series) throw new NotFoundException('Meeting series not found.');
      const encrypted = this.encryption.encrypt(url, `meeting-series:${seriesId}:meet-url`);
      const updated = await tx.meetingSeries.update({
        where: { id: seriesId },
        data: {
          meetUrlEncrypted: new Uint8Array(encrypted.ciphertext),
          meetUrlKeyId: encrypted.keyId,
          conferenceStatus: ConferenceStatus.MANUAL_OVERRIDE,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: adminId,
          action: 'MEET_LINK_OVERRIDDEN',
          entityType: 'MeetingSeries',
          entityId: seriesId,
          safeDiff: { conferenceStatus: ConferenceStatus.MANUAL_OVERRIDE },
          reason: 'Manual Meet link override',
          requestId: randomUUID(),
          correlationId: randomUUID(),
        },
      });
      return { id: updated.id, conferenceStatus: updated.conferenceStatus, meetUrl: url };
    });
  }

  async resolveDiscrepancy(discrepancyId: string, adminId: string) {
    const result = await this.prisma.calendarDiscrepancy.updateMany({
      where: { id: discrepancyId, status: CalendarDiscrepancyStatus.OPEN },
      data: { status: CalendarDiscrepancyStatus.RESOLVED, resolvedAt: this.clock.now() },
    });
    if (result.count !== 1) throw new NotFoundException('Open discrepancy not found.');
    return { id: discrepancyId, status: CalendarDiscrepancyStatus.RESOLVED, resolvedBy: adminId };
  }

  async connectionStatus() {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    return integration
      ? {
          configured: true,
          status: integration.status,
          calendarId: integration.calendarId,
          calendarName: integration.calendarName,
          lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt?.toISOString(),
        }
      : { configured: true, status: 'DISCONNECTED' as const };
  }

  private async creditBalance(tx: Transaction, subscriptionPeriodId: string): Promise<number> {
    const result = await tx.meetingCreditEvent.aggregate({
      where: { subscriptionPeriodId },
      _sum: { delta: true },
    });
    return result._sum.delta ?? 0;
  }

  private presentMeeting(meeting: MeetingRecord) {
    const series = meeting.meetingSeries;
    const meetUrl =
      series.meetUrlEncrypted && series.meetUrlKeyId
        ? this.encryption.decrypt(
            { ciphertext: Buffer.from(series.meetUrlEncrypted), keyId: series.meetUrlKeyId },
            `meeting-series:${series.id}:meet-url`,
          )
        : undefined;
    return {
      id: meeting.id,
      occurrenceNumber: meeting.occurrenceNumber,
      studentId: series.studentId,
      studentName:
        series.student.fullNameEncrypted && series.student.fullNameKeyId
          ? this.encryption.decrypt(
              {
                ciphertext: Buffer.from(series.student.fullNameEncrypted),
                keyId: series.student.fullNameKeyId,
              },
              `student:${series.studentId}:name`,
            )
          : undefined,
      subscriptionPeriodId: series.subscriptionPeriodId,
      startsAt: meeting.startsAt.toISOString(),
      endsAt: meeting.endsAt.toISOString(),
      originalStartsAt: meeting.originalStartsAt?.toISOString(),
      status: meeting.status,
      version: meeting.version,
      calendarSyncStatus: meeting.calendarSyncStatus,
      conferenceStatus: series.conferenceStatus,
      meetUrl,
      series: {
        id: series.id,
        timezone: series.timezone,
        googleSeriesId: series.googleSeriesId,
        version: series.version,
        recurrenceRule: series.recurrenceRule,
      },
      summary: meeting.summary
        ? { ...meeting.summary, generatedAt: meeting.summary.generatedAt.toISOString() }
        : undefined,
      coachNotes:
        meeting.coachNotes?.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })) ??
        [],
      discrepancies:
        meeting.discrepancies?.map((item) => ({
          id: item.id,
          type: item.type,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
        })) ?? [],
    };
  }

  private presentSeries(series: SeriesWithMeetings, student: StudentRecord) {
    return {
      id: series.id,
      subscriptionPeriodId: series.subscriptionPeriodId,
      studentId: series.studentId,
      studentName:
        student.fullNameEncrypted && student.fullNameKeyId
          ? this.encryption.decrypt(
              { ciphertext: Buffer.from(student.fullNameEncrypted), keyId: student.fullNameKeyId },
              `student:${student.id}:name`,
            )
          : undefined,
      timezone: series.timezone,
      recurrenceRule: series.recurrenceRule,
      meetings: series.meetings.map((meeting) => ({
        id: meeting.id,
        occurrenceNumber: meeting.occurrenceNumber,
        startsAt: meeting.startsAt.toISOString(),
        endsAt: meeting.endsAt.toISOString(),
        status: meeting.status,
        version: meeting.version,
      })),
      creditBalance: 4,
    };
  }

  private async audit(
    tx: Transaction,
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    reason: string,
    safeDiff: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        action,
        entityType,
        entityId,
        safeDiff: safeDiff as Prisma.InputJsonValue,
        reason,
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }
}

function consumesCredit(status: MeetingStatus): boolean {
  return status === MeetingStatus.COMPLETED || status === MeetingStatus.NO_SHOW;
}

export function meetingCreditDelta(previous: MeetingStatus, next: MeetingStatus): number {
  return (consumesCredit(next) ? -1 : 0) - (consumesCredit(previous) ? -1 : 0);
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
