import { randomUUID } from 'node:crypto';

import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  type Clock,
  FieldEncryption,
  humanizePracticeResponsePayload,
  type StudentPulseOutput,
} from '@meditation/core';
import type { FastifyRequest } from 'fastify';

import { PrismaService } from '../database/prisma.service.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { FIELD_ENCRYPTION } from './auth.constants.js';

const dayMilliseconds = 86_400_000;
function serviceDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function isTestProfile(name: string | undefined) {
  return name?.toLocaleLowerCase('tr-TR').includes('test') ?? false;
}

@Controller('v1/admin/dashboard')
@UseGuards(AdminSessionGuard)
export class AdminDashboardController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(FIELD_ENCRYPTION) private readonly encryption: FieldEncryption,
  ) {}

  @Get()
  async dashboard(@Req() request: FastifyRequest) {
    const now = this.clock.now();
    const today = serviceDate(now);
    const lastSevenStart = new Date(today.getTime() - 7 * dayMilliseconds);
    const previousSevenStart = new Date(today.getTime() - 14 * dayMilliseconds);
    const recentThreshold = new Date(now.getTime() - dayMilliseconds);

    const [students, paymentReviewCount, inboxEvents, failedIntents, openHandoffs, meetings] =
      await Promise.all([
        this.prisma.student.findMany({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fullNameEncrypted: true,
            fullNameKeyId: true,
            curriculumStage: true,
            defaultChannelIdentity: {
              select: {
                lastInboundAt: true,
                channelAccount: { select: { type: true } },
              },
            },
            practiceSessions: {
              where: {
                serviceDate: { gte: previousSevenStart, lt: today },
                status: { in: ['COMPLETED', 'SKIPPED', 'MISSED', 'AWAITING_RESPONSE'] },
              },
              orderBy: { serviceDate: 'asc' },
              select: {
                serviceDate: true,
                status: true,
                durationMinutes: true,
                reflection: { select: { id: true } },
                practiceSlot: { select: { slotKey: true } },
              },
            },
            practicePlans: {
              where: { status: 'ACTIVE' },
              take: 1,
              orderBy: { revision: 'desc' },
              select: {
                slots: {
                  where: { active: true },
                  orderBy: { slotKey: 'asc' },
                  select: { slotKey: true, localTime: true, durationMinutes: true },
                },
              },
            },
            handoffs: { where: { status: 'OPEN' }, select: { id: true } },
            pulseInsights: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                periodStart: true,
                periodEndExclusive: true,
                tone: true,
                confidence: true,
                suggestedAction: true,
                safetyConcern: true,
                reflectionCount: true,
                analysisEncrypted: true,
                analysisKeyId: true,
                createdAt: true,
              },
            },
          },
        }),
        this.prisma.payment.count({ where: { status: 'REPORTED' } }),
        this.prisma.inboxEvent.findMany({
          where: { eventType: 'MESSAGE_RECEIVED', createdAt: { gte: recentThreshold } },
          take: 12,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            studentId: true,
            channel: true,
            dedupeKey: true,
            normalizedData: true,
            createdAt: true,
            student: { select: { fullNameEncrypted: true, fullNameKeyId: true } },
          },
        }),
        this.prisma.messageIntent.findMany({
          where: {
            OR: [
              { status: { in: ['FAILED', 'DELIVERY_UNKNOWN'] } },
              {
                status: 'SUPPRESSED',
                suppressionReason: {
                  in: [
                    'WHATSAPP_TEMPLATE_REQUIRED',
                    'STUDENT_INACTIVE',
                    'PROACTIVE_MESSAGING_PAUSED',
                  ],
                },
              },
            ],
          },
          take: 8,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            studentId: true,
            category: true,
            status: true,
            suppressionReason: true,
            payload: true,
            updatedAt: true,
            channelIdentity: { select: { channelAccount: { select: { type: true } } } },
            student: { select: { fullNameEncrypted: true, fullNameKeyId: true } },
          },
        }),
        this.prisma.handoff.findMany({
          where: { status: 'OPEN' },
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            studentId: true,
            reason: true,
            createdAt: true,
            student: { select: { fullNameEncrypted: true, fullNameKeyId: true } },
          },
        }),
        this.prisma.weeklyMeeting.findMany({
          where: { startsAt: { gte: now, lt: new Date(now.getTime() + dayMilliseconds) } },
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            meetingSeries: {
              select: {
                student: { select: { id: true, fullNameEncrypted: true, fullNameKeyId: true } },
              },
            },
          },
        }),
      ]);

    const namedStudents = students.map((student) => ({
      ...student,
      fullName: this.decryptName(student.id, student.fullNameEncrypted, student.fullNameKeyId),
    }));
    const realStudents = namedStudents.filter((student) => !isTestProfile(student.fullName));
    const daily = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(lastSevenStart.getTime() + index * dayMilliseconds);
      return {
        date: date.toISOString().slice(0, 10),
        completed: 0,
        skipped: 0,
        missed: 0,
        pending: 0,
      };
    });
    const dailyByDate = new Map(daily.map((item) => [item.date, item]));

    let completed = 0;
    let skipped = 0;
    let missed = 0;
    let pending = 0;
    let reflections = 0;
    let completedMinutes = 0;
    let previousCompleted = 0;
    let previousSkipped = 0;
    let previousMissed = 0;
    let previousReflections = 0;
    let previousCompletedMinutes = 0;
    let previousOutcomeCount = 0;
    const slotMetrics = new Map<string, { completed: number; total: number }>();

    const studentPulse = realStudents.map((student) => {
      const current = student.practiceSessions.filter(
        (session) => session.serviceDate >= lastSevenStart,
      );
      const previous = student.practiceSessions.filter(
        (session) => session.serviceDate < lastSevenStart,
      );
      const currentCompleted = current.filter((session) => session.status === 'COMPLETED').length;
      const currentSkipped = current.filter((session) => session.status === 'SKIPPED').length;
      const currentMissed = current.filter((session) => session.status === 'MISSED').length;
      const currentPending = current.filter(
        (session) => session.status === 'AWAITING_RESPONSE',
      ).length;
      const currentReflections = current.filter((session) => session.reflection).length;
      const currentCompletedMinutes = current
        .filter((session) => session.status === 'COMPLETED')
        .reduce((total, session) => total + session.durationMinutes, 0);
      const previousCompletedForStudent = previous.filter(
        (session) => session.status === 'COMPLETED',
      ).length;
      const previousSkippedForStudent = previous.filter(
        (session) => session.status === 'SKIPPED',
      ).length;
      const previousMissedForStudent = previous.filter(
        (session) => session.status === 'MISSED',
      ).length;
      const previousReflectionsForStudent = previous.filter((session) => session.reflection).length;
      const previousCompletedMinutesForStudent = previous
        .filter((session) => session.status === 'COMPLETED')
        .reduce((total, session) => total + session.durationMinutes, 0);

      completed += currentCompleted;
      skipped += currentSkipped;
      missed += currentMissed;
      pending += currentPending;
      reflections += currentReflections;
      completedMinutes += currentCompletedMinutes;
      previousCompleted += previousCompletedForStudent;
      previousSkipped += previousSkippedForStudent;
      previousMissed += previousMissedForStudent;
      previousReflections += previousReflectionsForStudent;
      previousCompletedMinutes += previousCompletedMinutesForStudent;
      previousOutcomeCount += previous.filter(
        (session) => session.status !== 'AWAITING_RESPONSE',
      ).length;

      for (const session of current) {
        const key = session.serviceDate.toISOString().slice(0, 10);
        const point = dailyByDate.get(key);
        if (point) {
          const status =
            session.status === 'AWAITING_RESPONSE'
              ? 'pending'
              : (session.status.toLocaleLowerCase('en-US') as 'completed' | 'skipped' | 'missed');
          point[status] += 1;
        }
        if (session.status === 'AWAITING_RESPONSE') continue;
        const slot = session.practiceSlot?.slotKey ?? 'OTHER';
        const metric = slotMetrics.get(slot) ?? { completed: 0, total: 0 };
        metric.total += 1;
        if (session.status === 'COMPLETED') metric.completed += 1;
        slotMetrics.set(slot, metric);
      }

      const activeSlots = student.practicePlans[0]?.slots ?? [];
      const outcomeCount = current.length - currentPending;
      const completionRate = percentage(currentCompleted, outcomeCount);
      const previousOutcomeCountForStudent =
        previousCompletedForStudent + previousSkippedForStudent + previousMissedForStudent;
      const previousRate = percentage(previousCompletedForStudent, previousOutcomeCountForStudent);
      const insightRecord = student.pulseInsights[0];
      const insight = insightRecord
        ? this.decryptPulseInsight(
            student.id,
            insightRecord.periodEndExclusive,
            insightRecord.analysisEncrypted,
            insightRecord.analysisKeyId,
          )
        : undefined;
      const simplify =
        activeSlots.length > 1 && outcomeCount >= 3 && (completionRate < 60 || currentMissed >= 2);
      return {
        id: student.id,
        fullName: student.fullName,
        channel: student.defaultChannelIdentity?.channelAccount.type,
        curriculumStage: student.curriculumStage,
        lastInboundAt: student.defaultChannelIdentity?.lastInboundAt?.toISOString(),
        completed: currentCompleted,
        skipped: currentSkipped,
        missed: currentMissed,
        pending: currentPending,
        reflections: currentReflections,
        completionRate,
        trend: Math.round((completionRate - previousRate) * 10) / 10,
        previous: {
          completed: previousCompletedForStudent,
          skipped: previousSkippedForStudent,
          missed: previousMissedForStudent,
          reflections: previousReflectionsForStudent,
          completionRate: previousRate,
        },
        insight: insightRecord
          ? {
              tone: insightRecord.tone,
              confidence: insightRecord.confidence,
              suggestedAction: insightRecord.suggestedAction,
              safetyConcern: insightRecord.safetyConcern,
              reflectionCount: insightRecord.reflectionCount,
              generatedAt: insightRecord.createdAt.toISOString(),
              summary: insight?.summary,
              strengths: insight?.strengths ?? [],
              challenges: insight?.challenges ?? [],
              coachTopics: insight?.coachTopics ?? [],
            }
          : undefined,
        openHandoffs: student.handoffs.length,
        schedule: activeSlots.map((slot) => ({
          slotKey: slot.slotKey,
          localTime: slot.localTime,
          durationMinutes: slot.durationMinutes,
        })),
        recommendation: simplify
          ? 'Son 7 günlük yanıtlara göre programı tek seansa indirmeyi değerlendirin.'
          : undefined,
      };
    });

    const outcomeCount = completed + skipped + missed;
    const currentCompletionRate = percentage(completed, outcomeCount);
    const currentResponseRate = percentage(completed + skipped, outcomeCount);
    const currentReflectionRate = percentage(reflections, completed);
    const previousCompletionRate = percentage(previousCompleted, previousOutcomeCount);
    const previousResponseRate = percentage(
      previousCompleted + previousSkipped,
      previousOutcomeCount,
    );
    const previousReflectionRate = percentage(previousReflections, previousCompleted);
    const [readingAssignments, readingPublic, meditationPublic] = await Promise.all([
      this.prisma.readingAssignment.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.readingPublicVisit.aggregate({
        _sum: {
          viewCount: true,
          pdfDownloadCount: true,
          whatsappClickCount: true,
        },
        _count: { _all: true },
      }),
      this.prisma.meditationPublicVisit.aggregate({
        _sum: {
          viewCount: true,
          startCount: true,
          completionCount: true,
          ctaClickCount: true,
        },
        _count: { _all: true },
      }),
    ]);

    await this.prisma.auditLog
      .create({
        data: {
          actorType: 'ADMIN',
          actorId: request.admin!.id,
          action: 'ADMIN_DASHBOARD_READ',
          entityType: 'AdminUser',
          entityId: request.admin!.id,
          safeDiff: { studentCount: realStudents.length, recentMessageCount: inboxEvents.length },
          reason: 'Admin reviewed daily student operations dashboard',
          requestId: randomUUID(),
          correlationId: randomUUID(),
        },
      })
      .catch(() => undefined);

    return {
      generatedAt: now.toISOString(),
      counts: {
        activeStudents: realStudents.length,
        paymentReviews: paymentReviewCount,
        recentMessages: inboxEvents.length,
        failedMessages: failedIntents.length,
        openHandoffs: openHandoffs.length,
        todayMeetings: meetings.length,
      },
      practice: {
        periodDays: 7,
        periodStart: lastSevenStart.toISOString().slice(0, 10),
        periodEndExclusive: today.toISOString().slice(0, 10),
        completed,
        skipped,
        missed,
        pending,
        completedMinutes,
        completionRate: currentCompletionRate,
        responseRate: currentResponseRate,
        reflectionRate: currentReflectionRate,
        trend: Math.round((currentCompletionRate - previousCompletionRate) * 10) / 10,
        previous: {
          completed: previousCompleted,
          skipped: previousSkipped,
          missed: previousMissed,
          completedMinutes: previousCompletedMinutes,
          completionRate: previousCompletionRate,
          responseRate: previousResponseRate,
          reflectionRate: previousReflectionRate,
        },
        deltas: {
          completionRate: Math.round((currentCompletionRate - previousCompletionRate) * 10) / 10,
          responseRate: Math.round((currentResponseRate - previousResponseRate) * 10) / 10,
          reflectionRate: Math.round((currentReflectionRate - previousReflectionRate) * 10) / 10,
        },
        daily,
        slots: [...slotMetrics.entries()].map(([slotKey, metric]) => ({
          slotKey,
          completed: metric.completed,
          total: metric.total,
          completionRate: percentage(metric.completed, metric.total),
        })),
      },
      studentPulse: studentPulse.sort((a, b) => a.completionRate - b.completionRate),
      recentMessages: inboxEvents.map((event) => {
        const normalized = event.normalizedData as Record<string, unknown>;
        const rawContent = this.decryptInboxContent(event.dedupeKey, normalized);
        const content = rawContent ? humanizePracticeResponsePayload(rawContent) : undefined;
        return {
          id: event.id,
          studentId: event.studentId ?? undefined,
          fullName: event.studentId
            ? this.decryptName(
                event.studentId,
                event.student?.fullNameEncrypted ?? null,
                event.student?.fullNameKeyId ?? null,
              )
            : undefined,
          channel: event.channel,
          content,
          source: this.messageSource(content),
          occurredAt: event.createdAt.toISOString(),
        };
      }),
      failedMessages: failedIntents.map((intent) => {
        const payload = intent.payload as Record<string, unknown>;
        return {
          id: intent.id,
          studentId: intent.studentId,
          fullName: this.decryptName(
            intent.studentId,
            intent.student.fullNameEncrypted,
            intent.student.fullNameKeyId,
          ),
          channel: intent.channelIdentity.channelAccount.type,
          category: intent.category,
          status: intent.status,
          reason: intent.suppressionReason,
          preview: this.intentPreview(intent.studentId, payload),
          updatedAt: intent.updatedAt.toISOString(),
        };
      }),
      handoffs: openHandoffs.map((handoff) => ({
        id: handoff.id,
        studentId: handoff.studentId,
        fullName: this.decryptName(
          handoff.studentId,
          handoff.student.fullNameEncrypted,
          handoff.student.fullNameKeyId,
        ),
        reason: handoff.reason,
        createdAt: handoff.createdAt.toISOString(),
      })),
      meetings: meetings.map((meeting) => ({
        id: meeting.id,
        studentId: meeting.meetingSeries.student.id,
        fullName: this.decryptName(
          meeting.meetingSeries.student.id,
          meeting.meetingSeries.student.fullNameEncrypted,
          meeting.meetingSeries.student.fullNameKeyId,
        ),
        startsAt: meeting.startsAt.toISOString(),
        endsAt: meeting.endsAt.toISOString(),
        status: meeting.status,
      })),
      content: {
        assignments: Object.fromEntries(
          readingAssignments.map((item) => [item.status, item._count._all]),
        ),
        readings: {
          visitors: readingPublic._count._all,
          views: readingPublic._sum.viewCount ?? 0,
          pdfDownloads: readingPublic._sum.pdfDownloadCount ?? 0,
          whatsappClicks: readingPublic._sum.whatsappClickCount ?? 0,
        },
        meditations: {
          visitors: meditationPublic._count._all,
          views: meditationPublic._sum.viewCount ?? 0,
          starts: meditationPublic._sum.startCount ?? 0,
          completions: meditationPublic._sum.completionCount ?? 0,
          ctaClicks: meditationPublic._sum.ctaClickCount ?? 0,
        },
      },
    };
  }

  private decryptName(id: string, encrypted: Uint8Array | null, keyId: string | null) {
    if (!encrypted || !keyId) return undefined;
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `student:${id}:name`,
      );
    } catch {
      return undefined;
    }
  }

  private decryptInboxContent(dedupeKey: string, normalized: Record<string, unknown>) {
    if (
      typeof normalized.contentEncrypted !== 'string' ||
      typeof normalized.contentKeyId !== 'string'
    )
      return undefined;
    try {
      return this.encryption.decrypt(
        {
          ciphertext: Buffer.from(normalized.contentEncrypted, 'base64'),
          keyId: normalized.contentKeyId,
        },
        dedupeKey,
      );
    } catch {
      return undefined;
    }
  }

  private decryptPulseInsight(
    studentId: string,
    periodEndExclusive: Date,
    encrypted: Uint8Array,
    keyId: string,
  ): StudentPulseOutput | undefined {
    try {
      const value = this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `student-pulse:${studentId}:${periodEndExclusive.toISOString().slice(0, 10)}`,
      );
      return JSON.parse(value) as StudentPulseOutput;
    } catch {
      return undefined;
    }
  }

  private intentPreview(studentId: string, payload: Record<string, unknown>) {
    if (typeof payload.rendered === 'string') return payload.rendered;
    if (typeof payload.contentEncrypted !== 'string' || typeof payload.contentKeyId !== 'string')
      return undefined;
    try {
      return this.encryption.decrypt(
        {
          ciphertext: Buffer.from(payload.contentEncrypted, 'base64'),
          keyId: payload.contentKeyId,
        },
        `admin-reply:${studentId}`,
      );
    } catch {
      return undefined;
    }
  }

  private messageSource(content: string | undefined) {
    const value = content?.toLocaleLowerCase('tr-TR') ?? '';
    if (value.includes('okuma') && value.includes('birebir meditasyon')) return 'READING';
    if (value.includes('meditasyonunu tamamladım') && value.includes('birebir meditasyon'))
      return 'MEDITATION';
    if (value === 'yaptım' || value === 'yapamadım' || value === 'bugün yapamadım')
      return 'PRACTICE';
    return 'GENERAL';
  }
}
