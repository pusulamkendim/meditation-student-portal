import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK_TOKEN, FieldEncryption, type ApplicationConfig, type Clock } from '@meditation/core';
import { AuditActorType, PracticePlanStatus, PracticeSessionStatus } from '@meditation/database';
import { randomUUID } from 'node:crypto';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

const planStatuses = [
  PracticePlanStatus.ACTIVE,
  PracticePlanStatus.PAUSED,
  PracticePlanStatus.DRAFT,
] as const;

const pendingPracticeStatuses: readonly PracticeSessionStatus[] = [
  PracticeSessionStatus.SCHEDULED,
  PracticeSessionStatus.REMINDED,
  PracticeSessionStatus.AWAITING_RESPONSE,
] as const;

type PracticeStatusCounts = {
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
  cancelled: number;
};

type Journey = {
  key: string;
  label: string;
  completedMeetingCount: number;
  source: 'AUTO' | 'ADMIN';
};

@Injectable()
export class StudentAdminService {
  private readonly encryption: FieldEncryption;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID) {
      throw new Error('Student data encryption keys are required.');
    }
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async list(adminId?: string) {
    const students = await this.prisma.student.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        subscriptions: {
          orderBy: { startDate: 'desc' },
          take: 1,
          include: { creditEvents: true },
        },
        defaultChannelIdentity: { include: { channelAccount: true } },
        practiceSessions: {
          where: {
            OR: [
              { cancellationReason: null },
              { cancellationReason: { not: 'PLAN_SUPERSEDED' } },
            ],
          },
          orderBy: { startAt: 'desc' },
          take: 24,
          select: { status: true, startAt: true },
        },
        meetingSeries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            meetings: {
              orderBy: { occurrenceNumber: 'asc' },
              select: { status: true, startsAt: true },
            },
          },
        },
      },
    });

    const studentIds = students.map((student) => student.id);
    const [practiceGroups, meetingGroups] = await Promise.all([
      studentIds.length
        ? this.prisma.practiceSession.groupBy({
            by: ['studentId', 'status'],
            where: { studentId: { in: studentIds } },
            _count: { _all: true },
          })
        : [],
      studentIds.length
        ? this.prisma.weeklyMeeting.findMany({
            where: { meetingSeries: { studentId: { in: studentIds } } },
            select: { status: true, meetingSeries: { select: { studentId: true } } },
          })
        : [],
    ]);

    const countsByStudent = new Map<string, PracticeStatusCounts>();
    for (const group of practiceGroups) {
      const counts = countsByStudent.get(group.studentId) ?? emptyPracticeCounts();
      const count = group._count._all;
      if (group.status === PracticeSessionStatus.COMPLETED) counts.completed += count;
      else if (group.status === PracticeSessionStatus.MISSED) counts.missed += count;
      else if (group.status === PracticeSessionStatus.SKIPPED) counts.skipped += count;
      else if (pendingPracticeStatuses.includes(group.status)) counts.pending += count;
      else if (group.status === PracticeSessionStatus.CANCELLED) counts.cancelled += count;
      countsByStudent.set(group.studentId, counts);
    }

    const meetingsByStudent = new Map<string, number>();
    for (const meeting of meetingGroups) {
      if (meeting.status === 'COMPLETED') {
        meetingsByStudent.set(
          meeting.meetingSeries.studentId,
          (meetingsByStudent.get(meeting.meetingSeries.studentId) ?? 0) + 1,
        );
      }
    }

    const items = students.map((student) => {
      const practice = countsByStudent.get(student.id) ?? emptyPracticeCounts();
      const completedMeetings = meetingsByStudent.get(student.id) ?? 0;
      const journey = this.journey(
        student.curriculumStage,
        student.curriculumStageSource,
        completedMeetings,
      );
      const nextPractice = student.practiceSessions
        .filter(
          (session) =>
            pendingPracticeStatuses.includes(session.status) && session.startAt >= this.clock.now(),
        )
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
      const nextMeeting = student.meetingSeries[0]?.meetings
        .filter((meeting) => meeting.status === 'SCHEDULED' && meeting.startsAt >= this.clock.now())
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      return {
        id: student.id,
        fullName: this.decryptName(student.id, student.fullNameEncrypted, student.fullNameKeyId),
        status: student.status,
        registrationStep: student.registrationStep,
        preferredLocale: student.preferredLocale,
        timezone: student.timezone,
        curriculumStage: student.curriculumStage,
        curriculumStageSource: student.curriculumStageSource,
        journey,
        createdAt: student.createdAt.toISOString(),
        channel: this.presentChannel(student.defaultChannelIdentity),
        subscription: student.subscriptions[0]
          ? presentSubscription(student.subscriptions[0])
          : undefined,
        practice: {
          ...practice,
          complianceRate: complianceRate(practice),
          nextStartAt: nextPractice?.startAt.toISOString(),
        },
        nextMeetingAt: nextMeeting?.startsAt.toISOString(),
      };
    });

    if (adminId) {
      await Promise.allSettled(
        students.map((student) =>
          this.auditRead(adminId, student.id, 'STUDENT_LIST_SENSITIVE_READ'),
        ),
      );
    }
    return { items };
  }

  async detail(studentId: string, adminId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        subscriptions: { orderBy: { startDate: 'desc' }, include: { creditEvents: true } },
        defaultChannelIdentity: { include: { channelAccount: true } },
        channelIdentities: { include: { channelAccount: true }, orderBy: { createdAt: 'asc' } },
        consents: { orderBy: { occurredAt: 'desc' } },
        payments: { orderBy: { reportedAt: 'desc' }, include: { subscription: true } },
        messagingPreference: true,
        practicePlans: {
          where: { status: { in: [...planStatuses] } },
          orderBy: { revision: 'desc' },
          take: 1,
          include: { slots: { orderBy: { slotKey: 'asc' } } },
        },
        practiceSessions: {
          orderBy: { startAt: 'desc' },
          take: 120,
          include: { practiceSlot: true, reflection: { include: { tags: true } } },
        },
        meetingSeries: {
          orderBy: { createdAt: 'desc' },
          include: {
            meetings: { orderBy: { occurrenceNumber: 'asc' } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found.');

    const practiceGroups = await this.prisma.practiceSession.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { _all: true },
    });
    const allMeetings = student.meetingSeries.flatMap((series) => series.meetings);
    const completedMeetingCount = allMeetings.filter(
      (meeting) => meeting.status === 'COMPLETED',
    ).length;
    const journey = this.journey(
      student.curriculumStage,
      student.curriculumStageSource,
      completedMeetingCount,
    );
    const practiceCounts = practiceGroups.reduce(
      (counts, group) => incrementPracticeCount(counts, group.status, group._count._all),
      emptyPracticeCounts(),
    );
    const nextPractice = student.practiceSessions
      .filter(
        (session) =>
          pendingPracticeStatuses.includes(session.status) && session.startAt >= this.clock.now(),
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    const nextMeeting = allMeetings
      .filter((meeting) => meeting.status === 'SCHEDULED' && meeting.startsAt >= this.clock.now())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

    if (adminId) await this.auditRead(adminId, student.id, 'STUDENT_SENSITIVE_READ');
    return {
      id: student.id,
      fullName: this.decryptName(student.id, student.fullNameEncrypted, student.fullNameKeyId),
      status: student.status,
      registrationStep: student.registrationStep,
      timezone: student.timezone,
      preferredLocale: student.preferredLocale,
      curriculumStage: student.curriculumStage,
      curriculumStageSource: student.curriculumStageSource,
      journey,
      version: student.version,
      createdAt: student.createdAt.toISOString(),
      channel: student.defaultChannelIdentity
        ? this.presentChannel(student.defaultChannelIdentity)
        : undefined,
      channels: student.channelIdentities.map((identity) => ({
        ...this.presentChannel(identity),
        isDefault: identity.id === student.defaultChannelIdentityId,
      })),
      messagingPreference: student.messagingPreference
        ? {
            proactiveEnabled: student.messagingPreference.proactiveEnabled,
            pausedAt: student.messagingPreference.pausedAt?.toISOString(),
            pauseReason: student.messagingPreference.pauseReason,
          }
        : undefined,
      subscriptions: student.subscriptions.map(presentSubscription),
      consents: student.consents.map((consent) => ({
        scope: consent.scope,
        status: consent.status,
        textVersion: consent.textVersion,
        channel: consent.channel,
        occurredAt: consent.occurredAt.toISOString(),
      })),
      payments: student.payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        referenceCode: payment.referenceCode,
        amountMinor: payment.amountMinor.toString(),
        currency: payment.currency,
        reportedAt: payment.reportedAt.toISOString(),
        approvedAt: payment.approvedAt?.toISOString(),
        reviewNote: payment.reviewNote,
        subscriptionId: payment.subscription?.id,
      })),
      practicePlan: student.practicePlans[0]
        ? {
            id: student.practicePlans[0].id,
            subscriptionId: student.practicePlans[0].subscriptionPeriodId,
            status: student.practicePlans[0].status,
            revision: student.practicePlans[0].revision,
            effectiveFrom: student.practicePlans[0].effectiveFrom.toISOString(),
            effectiveUntil: student.practicePlans[0].effectiveUntil?.toISOString(),
            slots: student.practicePlans[0].slots.map((slot) => ({
              id: slot.id,
              slotKey: slot.slotKey,
              localTime: slot.localTime,
              durationMinutes: slot.durationMinutes,
              active: slot.active,
            })),
          }
        : undefined,
      practice: {
        ...practiceCounts,
        complianceRate: complianceRate(practiceCounts),
        nextStartAt: nextPractice?.startAt.toISOString(),
        sessions: student.practiceSessions.map((session) => ({
          id: session.id,
          serviceDate: session.serviceDate.toISOString(),
          startAt: session.startAt.toISOString(),
          durationMinutes: session.durationMinutes,
          status: session.status,
          version: session.version,
          slot: session.practiceSlot?.slotKey,
          localTime: formatLocalTime(session.startAt, student.timezone),
          cancellationReason: session.cancellationReason,
          reflection: session.reflection
            ? {
                content: this.decryptReflection(
                  session.id,
                  session.reflection.contentEncrypted,
                  session.reflection.contentKeyId,
                ),
                createdAt: session.reflection.createdAt.toISOString(),
                tags: session.reflection.tags.map((tag) => ({
                  tag: tag.tag,
                  confidence: tag.confidence,
                })),
              }
            : undefined,
        })),
      },
      meetings: student.meetingSeries.flatMap((series) =>
        series.meetings.map((meeting) => ({
          id: meeting.id,
          seriesId: series.id,
          subscriptionId: series.subscriptionPeriodId,
          occurrenceNumber: meeting.occurrenceNumber,
          startsAt: meeting.startsAt.toISOString(),
          endsAt: meeting.endsAt.toISOString(),
          status: meeting.status,
          version: meeting.version,
          timezone: series.timezone,
          conferenceStatus: series.conferenceStatus,
          calendarSyncStatus: meeting.calendarSyncStatus,
          meetUrl: this.decryptMeetUrl(series.id, series.meetUrlEncrypted, series.meetUrlKeyId),
        })),
      ),
      nextMeetingAt: nextMeeting?.startsAt.toISOString(),
      completedMeetingCount,
    };
  }

  private journey(
    curriculumStage: string,
    curriculumStageSource: string,
    completedMeetingCount: number,
  ): Journey {
    return deriveStudentJourney(curriculumStage, curriculumStageSource, completedMeetingCount);
  }

  private presentChannel(
    identity:
      | {
          id: string;
          channelAccountId: string;
          externalUserEncrypted: Uint8Array;
          externalUserKeyId: string;
          status: string;
          verifiedAt: Date | null;
          lastInboundAt: Date | null;
          channelAccount: { type: string; displayName: string };
        }
      | null
      | undefined,
  ) {
    if (!identity) return undefined;
    let identifier: string | undefined;
    try {
      identifier = this.encryption.decrypt(
        {
          ciphertext: Buffer.from(identity.externalUserEncrypted),
          keyId: identity.externalUserKeyId,
        },
        `channel:${identity.channelAccountId}`,
      );
    } catch {
      identifier = undefined;
    }
    return {
      id: identity.id,
      type: identity.channelAccount.type,
      displayName: identity.channelAccount.displayName,
      identifier,
      status: identity.status,
      verifiedAt: identity.verifiedAt?.toISOString(),
      lastInboundAt: identity.lastInboundAt?.toISOString(),
    };
  }

  private decryptName(studentId: string, encrypted: Uint8Array | null, keyId: string | null) {
    if (!encrypted || !keyId) return undefined;
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `student:${studentId}:name`,
      );
    } catch {
      return undefined;
    }
  }

  private decryptReflection(sessionId: string, encrypted: Uint8Array, keyId: string) {
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `practice:${sessionId}:reflection`,
      );
    } catch {
      return undefined;
    }
  }

  private decryptMeetUrl(seriesId: string, encrypted: Uint8Array | null, keyId: string | null) {
    if (!encrypted || !keyId) return undefined;
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `meeting-series:${seriesId}:meet-url`,
      );
    } catch {
      return undefined;
    }
  }

  private async auditRead(adminId: string, studentId: string, action: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action,
          entityType: 'Student',
          entityId: studentId,
          safeDiff: { fields: ['fullName', 'channelIdentifier', 'practiceReflection'] },
          reason: 'Student detail read in admin portal',
          requestId: randomUUID(),
          correlationId: randomUUID(),
        },
      });
    } catch {
      // A read audit must not make an otherwise authorized admin view unavailable.
    }
  }
}

export function deriveStudentJourney(
  curriculumStage: string,
  curriculumStageSource: string,
  completedMeetingCount: number,
): Journey {
  if (curriculumStageSource === 'ADMIN') {
    return {
      key: curriculumStage,
      label: stageLabel(curriculumStage),
      completedMeetingCount,
      source: 'ADMIN',
    };
  }
  if (completedMeetingCount === 0)
    return { key: 'WEEK_0', label: '0. Hafta', completedMeetingCount, source: 'AUTO' };
  if (completedMeetingCount <= 4) {
    return {
      key: `WEEK_${completedMeetingCount}`,
      label: `${completedMeetingCount}. Hafta`,
      completedMeetingCount,
      source: 'AUTO',
    };
  }
  return { key: 'INTERMEDIATE', label: 'Intermediate', completedMeetingCount, source: 'AUTO' };
}

function emptyPracticeCounts(): PracticeStatusCounts {
  return { completed: 0, missed: 0, skipped: 0, pending: 0, cancelled: 0 };
}

function incrementPracticeCount(
  counts: PracticeStatusCounts,
  status: PracticeSessionStatus,
  amount = 1,
): PracticeStatusCounts {
  if (status === PracticeSessionStatus.COMPLETED) counts.completed += amount;
  else if (status === PracticeSessionStatus.MISSED) counts.missed += amount;
  else if (status === PracticeSessionStatus.SKIPPED) counts.skipped += amount;
  else if (pendingPracticeStatuses.includes(status)) counts.pending += amount;
  else if (status === PracticeSessionStatus.CANCELLED) counts.cancelled += amount;
  return counts;
}

function complianceRate(counts: PracticeStatusCounts): number {
  const total = counts.completed + counts.missed + counts.skipped;
  return total === 0 ? 0 : Math.round((counts.completed / total) * 100);
}

function formatLocalTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

function stageLabel(stage: string): string {
  return (
    (
      {
        WEEK_1: '1. Hafta',
        WEEK_2: '2. Hafta',
        WEEK_3: '3. Hafta',
        WEEK_4: '4. Hafta',
        INTERMEDIATE: 'Intermediate',
        ADVANCED: 'Advanced',
      } as Record<string, string>
    )[stage] ?? stage
  );
}

function presentSubscription(subscription: {
  id: string;
  status: string;
  startDate: Date;
  endExclusive: Date;
  priceMinor: bigint;
  currency: string;
  creditEvents: Array<{ delta: number }>;
}) {
  return {
    id: subscription.id,
    status: subscription.status,
    startDate: subscription.startDate.toISOString(),
    endExclusive: subscription.endExclusive.toISOString(),
    priceMinor: subscription.priceMinor.toString(),
    currency: subscription.currency,
    credits: subscription.creditEvents.reduce((sum, event) => sum + event.delta, 0),
  };
}
