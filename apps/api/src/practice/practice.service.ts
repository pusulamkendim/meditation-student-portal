import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  endOfLocalServiceDate,
  FieldEncryption,
  generatePracticeSchedule,
  LookupHmac,
  type ApplicationConfig,
  type Clock,
  type SystemEventKey,
} from '@meditation/core';
import {
  AuditActorType,
  ConsentScope,
  ConsentStatus,
  PracticePlanStatus,
  PracticeSessionStatus,
  MeditationGuidanceMode,
  MeditationRenderStatus,
  MeditationTypeStatus,
  SubscriptionStatus,
  type Prisma,
} from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

type SlotInput = {
  slotKey: 'MORNING' | 'EVENING';
  localTime: string;
  active: boolean;
  durationMinutes?: number;
  meditationTypeId?: string | null;
};
type Transaction = Prisma.TransactionClient;

const allIsoWeekdays = [1, 2, 3, 4, 5, 6, 7] as const;
const weekdayLabels = new Map([
  [1, 'Pazartesi'],
  [2, 'Salı'],
  [3, 'Çarşamba'],
  [4, 'Perşembe'],
  [5, 'Cuma'],
  [6, 'Cumartesi'],
  [7, 'Pazar'],
]);

export function normalizeActiveWeekdays(days?: readonly number[]): number[] {
  const normalized = [...new Set(days ?? allIsoWeekdays)].sort((left, right) => left - right);
  if (!normalized.length || normalized.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    throw new BadRequestException('En az bir geçerli pratik günü seçilmelidir.');
  return normalized;
}

export function formatPracticeScheduleSummary(
  slots: Array<{
    slotKey: string;
    localTime: string;
    active: boolean;
    durationMinutes: number;
  }>,
  activeWeekdays: readonly number[],
): string {
  const days = normalizeActiveWeekdays(activeWeekdays)
    .map((day) => weekdayLabels.get(day))
    .join(', ');
  const schedule = slots
    .filter((slot) => slot.active)
    .map(
      (slot) =>
        `${slot.slotKey === 'MORNING' ? 'sabah' : 'akşam'} ${slot.localTime} (${slot.durationMinutes} dk)`,
    )
    .join(', ');
  return `${days}; ${schedule}`;
}

export function currentMeditationRenderMap(
  meditationTypes: Array<{ id: string; audioRevision: number }>,
  renders: Array<{
    id: string;
    meditationTypeId: string;
    sourceVersion: number;
    durationMinutes: number;
  }>,
) {
  const revisionByType = new Map(
    meditationTypes.map((meditation) => [meditation.id, meditation.audioRevision]),
  );
  return new Map(
    renders
      .filter((render) => revisionByType.get(render.meditationTypeId) === render.sourceVersion)
      .map((render) => [`${render.meditationTypeId}:${render.durationMinutes}`, render]),
  );
}

export function presentSubscriptionEndUpdate(
  subscription: {
    id: string;
    studentId: string;
    status: SubscriptionStatus;
    startDate: Date;
    priceMinor: bigint;
    currency: string;
    version: number;
  },
  endExclusive: Date,
  addedSessionCount: number,
  suppressedSessionCount: number,
  version = subscription.version + 1,
) {
  return {
    id: subscription.id,
    studentId: subscription.studentId,
    status: subscription.status,
    startDate: subscription.startDate,
    endExclusive,
    priceMinor: subscription.priceMinor.toString(),
    currency: subscription.currency,
    version,
    addedSessionCount,
    suppressedSessionCount,
  };
}

@Injectable()
export class PracticeService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
    @Inject(SystemMessageOrchestrator) private readonly messages: SystemMessageOrchestrator,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Practice encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async createPlan(
    studentId: string,
    subscriptionId: string,
    slots: SlotInput[],
    effectiveFrom?: Date,
    durationOverride?: number,
    adminId?: string,
    activeWeekdays?: readonly number[],
  ) {
    const plan = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscriptionPeriod.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: { student: true },
      });
      if (
        subscription.studentId !== studentId ||
        !(
          subscription.status === SubscriptionStatus.ACTIVE ||
          subscription.status === SubscriptionStatus.SCHEDULED
        )
      )
        throw new Error('Practice plan requires an active or scheduled subscription.');
      return this.createPlanInTransaction(
        tx,
        studentId,
        subscriptionId,
        slots,
        effectiveFrom,
        'PLAN_CHANGED',
        durationOverride,
        adminId,
        activeWeekdays,
      );
    });
    await this.notifyPlanChange(
      plan,
      plan.revision === 1 ? 'PRACTICE_PLAN_CONFIRMED' : 'PRACTICE_PLAN_UPDATED',
    );
    return plan;
  }

  async updateSubscriptionEnd(
    subscriptionId: string,
    requestedEndExclusive: Date,
    expectedVersion: number,
    reason: string,
    adminId: string,
  ) {
    const now = this.clock.now();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endExclusive = new Date(
      Date.UTC(
        requestedEndExclusive.getUTCFullYear(),
        requestedEndExclusive.getUTCMonth(),
        requestedEndExclusive.getUTCDate(),
      ),
    );
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.subscriptionPeriod.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { studentId: true },
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.studentId}))`;
      const subscription = await tx.subscriptionPeriod.findUniqueOrThrow({
        where: { id: subscriptionId },
        include: { student: true },
      });
      if (
        subscription.status !== SubscriptionStatus.ACTIVE &&
        subscription.status !== SubscriptionStatus.SCHEDULED
      )
        throw new BadRequestException('Yalnızca aktif veya planlanmış üyelik düzenlenebilir.');
      if (endExclusive <= subscription.startDate || endExclusive <= today)
        throw new BadRequestException('Üyelik bitiş tarihi başlangıç ve bugünden sonra olmalıdır.');
      if (subscription.version !== expectedVersion)
        throw new ConflictException('Üyelik başka bir işlem tarafından güncellendi.');
      if (endExclusive.getTime() === subscription.endExclusive.getTime())
        return presentSubscriptionEndUpdate(
          subscription,
          subscription.endExclusive,
          0,
          0,
          subscription.version,
        );

      const overlap = await tx.subscriptionPeriod.findFirst({
        where: {
          id: { not: subscription.id },
          studentId: subscription.studentId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
          startDate: { lt: endExclusive },
          endExclusive: { gt: subscription.startDate },
        },
        select: { id: true },
      });
      if (overlap) throw new ConflictException('Yeni tarih başka bir üyelik dönemiyle çakışıyor.');

      if (endExclusive < subscription.endExclusive) {
        const meetingOutsidePeriod = await tx.weeklyMeeting.findFirst({
          where: {
            meetingSeries: { subscriptionPeriodId: subscription.id },
            status: { not: 'CANCELLED' },
            endsAt: { gt: endExclusive },
          },
          select: { id: true },
        });
        if (meetingOutsidePeriod)
          throw new BadRequestException(
            'Yeni bitiş tarihinden sonraki görüşmeleri önce yeniden planlayın veya iptal edin.',
          );
      }

      const changed = await tx.subscriptionPeriod.updateMany({
        where: { id: subscription.id, version: expectedVersion, status: subscription.status },
        data: { endExclusive, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Üyelik güncelleme çakışması.');

      let addedSessionCount = 0;
      let suppressedSessionCount = 0;
      if (endExclusive < subscription.endExclusive) {
        const affected = await tx.practiceSession.findMany({
          where: {
            studentId: subscription.studentId,
            practicePlan: { subscriptionPeriodId: subscription.id },
            serviceDate: { gte: endExclusive },
            status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
          },
          select: { id: true },
        });
        const sessionIds = affected.map((session) => session.id);
        if (sessionIds.length) {
          const suppressed = await tx.practiceSession.updateMany({
            where: {
              id: { in: sessionIds },
              status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
            },
            data: {
              status: PracticeSessionStatus.SUPPRESSED,
              cancellationReason: 'SUBSCRIPTION_END_CHANGED',
              version: { increment: 1 },
            },
          });
          suppressedSessionCount = suppressed.count;
          await tx.messageIntent.updateMany({
            where: {
              status: { in: ['PENDING', 'CLAIMED'] },
              OR: sessionIds.map((id) => ({
                payload: { path: ['practiceSessionId'], equals: id },
              })),
            },
            data: { status: 'SUPPRESSED', suppressionReason: 'SUBSCRIPTION_END_CHANGED' },
          });
        }
      } else {
        const plan = await tx.practicePlan.findFirst({
          where: {
            subscriptionPeriodId: subscription.id,
            status: {
              in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED, PracticePlanStatus.DRAFT],
            },
          },
          orderBy: { revision: 'desc' },
          include: {
            slots: {
              include: {
                meditationType: {
                  select: { id: true, title: true, audioRevision: true, guidanceMode: true },
                },
              },
            },
          },
        });
        if (plan) {
          const scheduled = generatePracticeSchedule({
            startDate: subscription.endExclusive,
            endExclusive,
            timezone: subscription.student.timezone,
            activeWeekdays: plan.activeWeekdays,
            slots: plan.slots.map((slot) => ({
              slotKey: slot.slotKey,
              localTime: slot.localTime,
              active: slot.active,
              durationMinutes: slot.durationMinutes,
            })),
          });
          const assignedTypes = plan.slots
            .map((slot) => slot.meditationType)
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
          const durations = [...new Set(scheduled.map((item) => item.durationMinutes))];
          const renders = assignedTypes.length
            ? await tx.meditationAudioRender.findMany({
                where: {
                  meditationTypeId: { in: assignedTypes.map((item) => item.id) },
                  durationMinutes: { in: durations },
                  status: MeditationRenderStatus.READY,
                },
                select: {
                  id: true,
                  meditationTypeId: true,
                  sourceVersion: true,
                  durationMinutes: true,
                },
              })
            : [];
          const renderMap = currentMeditationRenderMap(assignedTypes, renders);
          const slotByKey = new Map(plan.slots.map((slot) => [slot.slotKey, slot]));
          const sessionRows = scheduled.map((item) => {
            const slot = slotByKey.get(item.slotKey)!;
            const render = slot.meditationTypeId
              ? renderMap.get(`${slot.meditationTypeId}:${item.durationMinutes}`)
              : undefined;
            if (slot.meditationType?.guidanceMode === MeditationGuidanceMode.GUIDED && !render)
              throw new BadRequestException(
                `${slot.meditationType.title} için ${item.durationMinutes} dakikalık ses hazır değil.`,
              );
            return {
              studentId: subscription.studentId,
              practicePlanId: plan.id,
              practiceSlotId: slot.id,
              meditationTypeId: slot.meditationTypeId,
              meditationRenderId: render?.id,
              serviceDate: item.serviceDate,
              startAt: item.startAt,
              durationMinutes: item.durationMinutes,
              status:
                plan.status === PracticePlanStatus.PAUSED
                  ? PracticeSessionStatus.SUPPRESSED
                  : PracticeSessionStatus.SCHEDULED,
              cancellationReason:
                plan.status === PracticePlanStatus.PAUSED ? 'PRACTICE_PAUSED' : null,
            };
          });
          if (sessionRows.length) {
            const created = await tx.practiceSession.createMany({
              data: sessionRows,
              skipDuplicates: true,
            });
            addedSessionCount = created.count;
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: 'SUBSCRIPTION_END_UPDATED',
          entityType: 'SubscriptionPeriod',
          entityId: subscription.id,
          reason,
          safeDiff: {
            previousEndExclusive: subscription.endExclusive.toISOString(),
            endExclusive: endExclusive.toISOString(),
            addedSessionCount,
            suppressedSessionCount,
          },
          requestId: randomUUID(),
          correlationId: `subscription-${subscription.id}`,
        },
      });
      return presentSubscriptionEndUpdate(
        subscription,
        endExclusive,
        addedSessionCount,
        suppressedSessionCount,
      );
    });
  }

  private async createPlanInTransaction(
    tx: Transaction,
    studentId: string,
    subscriptionId: string,
    slots: SlotInput[],
    effectiveFrom?: Date,
    eventType = 'PLAN_CHANGED',
    durationOverride?: number,
    adminId?: string,
    requestedActiveWeekdays?: readonly number[],
  ) {
    if (!slots.some((item) => item.active))
      throw new BadRequestException('En az bir pratik slotu aktif olmalıdır.');
    const subscription = await tx.subscriptionPeriod.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: { student: true },
    });
    const now = this.clock.now();
    const start = effectiveFrom && effectiveFrom > now ? effectiveFrom : now;
    const activeWeekdays = normalizeActiveWeekdays(requestedActiveWeekdays);
    const normalizedSlots = slots.map((slot) => ({
      ...slot,
      durationMinutes: slot.durationMinutes ?? durationOverride ?? 15,
    }));
    if (
      normalizedSlots.some(
        (slot) =>
          slot.active &&
          (!Number.isInteger(slot.durationMinutes) ||
            slot.durationMinutes < 1 ||
            slot.durationMinutes > 180),
      )
    )
      throw new BadRequestException('Aktif pratik süreleri 1-180 dakika arasında olmalıdır.');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
    const assignedTypeIds = [
      ...new Set(
        normalizedSlots
          .filter((slot) => slot.meditationTypeId)
          .map((slot) => slot.meditationTypeId!),
      ),
    ];
    const meditationTypes = assignedTypeIds.length
      ? await tx.meditationType.findMany({
          where: {
            id: { in: assignedTypeIds },
            status: MeditationTypeStatus.PUBLISHED,
          },
          select: { id: true, title: true, audioRevision: true, guidanceMode: true },
        })
      : [];
    if (meditationTypes.length !== assignedTypeIds.length)
      throw new BadRequestException(
        'Seçilen meditasyon yayınlanmış değil veya artık kullanılamıyor.',
      );
    const revision =
      (await tx.practicePlan.aggregate({ where: { studentId }, _max: { revision: true } }))._max
        .revision ?? 0;
    const supersededSessions =
      subscription.status === SubscriptionStatus.ACTIVE
        ? await tx.practiceSession.findMany({
            where: {
              studentId,
              startAt: { gte: start },
              status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
            },
            select: { id: true },
          })
        : [];
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      await tx.practicePlan.updateMany({
        where: {
          studentId,
          status: { in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED] },
          effectiveUntil: null,
        },
        data: {
          status: PracticePlanStatus.SUPERSEDED,
          effectiveUntil: start,
          version: { increment: 1 },
        },
      });
      if (supersededSessions.length) {
        const sessionIds = supersededSessions.map((session) => session.id);
        await tx.practiceSession.updateMany({
          where: { id: { in: sessionIds } },
          data: {
            status: PracticeSessionStatus.SUPPRESSED,
            cancelledAt: null,
            cancellationReason: 'PLAN_SUPERSEDED',
            version: { increment: 1 },
          },
        });
        await tx.messageIntent.updateMany({
          where: {
            status: { in: ['PENDING', 'CLAIMED'] },
            OR: sessionIds.map((id) => ({ payload: { path: ['practiceSessionId'], equals: id } })),
          },
          data: { status: 'SUPPRESSED', suppressionReason: 'PLAN_SUPERSEDED' },
        });
      }
    }
    const plan = await tx.practicePlan.create({
      data: {
        studentId,
        subscriptionPeriodId: subscriptionId,
        status:
          subscription.status === SubscriptionStatus.ACTIVE
            ? PracticePlanStatus.ACTIVE
            : PracticePlanStatus.DRAFT,
        revision: revision + 1,
        effectiveFrom: start,
        activeWeekdays,
        slots: {
          create: normalizedSlots,
        },
      },
      include: { slots: true },
    });
    const days = generatePracticeSchedule({
      startDate: subscription.startDate,
      endExclusive: subscription.endExclusive,
      timezone: subscription.student.timezone,
      slots: plan.slots.map((slot) => ({
        slotKey: slot.slotKey,
        localTime: slot.localTime,
        active: slot.active,
        durationMinutes: slot.durationMinutes,
      })),
      activeWeekdays,
    });
    const slotIds = new Map<string, string>(plan.slots.map((slot) => [slot.slotKey, slot.id]));
    const slotAssignments = new Map(
      plan.slots.map((slot) => [
        slot.slotKey,
        { id: slot.id, meditationTypeId: slot.meditationTypeId },
      ]),
    );
    const scheduledDays = days.filter((item) => item.startAt >= start);
    const requiredDurations = [...new Set(scheduledDays.map((item) => item.durationMinutes))];
    const readyRenders = assignedTypeIds.length
      ? await tx.meditationAudioRender.findMany({
          where: {
            meditationTypeId: { in: assignedTypeIds },
            durationMinutes: { in: requiredDurations },
            status: MeditationRenderStatus.READY,
          },
          select: {
            id: true,
            meditationTypeId: true,
            sourceVersion: true,
            durationMinutes: true,
          },
        })
      : [];
    const typeById = new Map(meditationTypes.map((item) => [item.id, item]));
    const renderByTypeAndDuration = currentMeditationRenderMap(meditationTypes, readyRenders);
    const sessions = scheduledDays.map((item) => {
      const slot = slotAssignments.get(item.slotKey);
      const meditationTypeId = slot?.meditationTypeId;
      const render = meditationTypeId
        ? renderByTypeAndDuration.get(`${meditationTypeId}:${item.durationMinutes}`)
        : undefined;
      const meditation = meditationTypeId ? typeById.get(meditationTypeId) : undefined;
      if (
        meditationTypeId &&
        meditation?.guidanceMode === MeditationGuidanceMode.GUIDED &&
        !render
      ) {
        throw new BadRequestException(
          `${meditation?.title ?? 'Seçilen meditasyon'} için ${item.durationMinutes} dakikalık ses hazır değil.`,
        );
      }
      return {
        studentId,
        practicePlanId: plan.id,
        practiceSlotId: slot?.id ?? slotIds.get(item.slotKey),
        meditationTypeId,
        meditationRenderId: render?.id,
        serviceDate: item.serviceDate,
        startAt: item.startAt,
        durationMinutes: item.durationMinutes,
      };
    });
    if (sessions.length) await tx.practiceSession.createMany({ data: sessions });
    await tx.auditLog.create({
      data: {
        actorType: adminId ? AuditActorType.ADMIN : AuditActorType.SYSTEM,
        actorId: adminId,
        action: eventType,
        entityType: 'PracticePlan',
        entityId: plan.id,
        safeDiff: {
          revision: plan.revision,
          slots: normalizedSlots,
          activeWeekdays,
          effectiveFrom: start.toISOString(),
        },
        requestId: `practice-${plan.id}`,
        correlationId: `practice-${plan.id}`,
      },
    });
    await tx.outboxEvent.create({
      data: {
        topic: 'student.events',
        aggregateType: 'PracticePlan',
        aggregateId: plan.id,
        eventType: 'PRACTICE_PLAN_UPDATED',
        payload: { studentId, planId: plan.id },
      },
    });
    return plan;
  }

  async pause(studentId: string, paused: boolean, reason: string, adminId: string) {
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.practicePlan.findFirstOrThrow({
        where: {
          studentId,
          status: { in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED] },
        },
        orderBy: { revision: 'desc' },
      });
      const expectedPlanStatus = paused ? PracticePlanStatus.ACTIVE : PracticePlanStatus.PAUSED;
      if (plan.status !== expectedPlanStatus) throw new Error('Practice plan state conflict.');
      const planChanged = await tx.practicePlan.updateMany({
        where: { id: plan.id, status: expectedPlanStatus, version: plan.version },
        data: {
          status: paused ? PracticePlanStatus.PAUSED : PracticePlanStatus.ACTIVE,
          version: { increment: 1 },
        },
      });
      if (planChanged.count !== 1) throw new Error('Practice plan state conflict.');
      if (paused) {
        const affected = await tx.practiceSession.findMany({
          where: {
            studentId,
            practicePlanId: plan.id,
            startAt: { gt: now },
            status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
          },
          select: { id: true },
        });
        await tx.practiceSession.updateMany({
          where: {
            studentId,
            practicePlanId: plan.id,
            startAt: { gt: now },
            status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
          },
          data: {
            status: PracticeSessionStatus.SUPPRESSED,
            cancellationReason: 'PRACTICE_PAUSED',
            version: { increment: 1 },
          },
        });
        if (affected.length)
          await tx.messageIntent.updateMany({
            where: {
              status: { in: ['PENDING', 'CLAIMED'] },
              OR: affected.map(({ id }) => ({
                payload: { path: ['practiceSessionId'], equals: id },
              })),
            },
            data: { status: 'SUPPRESSED', suppressionReason: 'PRACTICE_PAUSED' },
          });
      } else
        await tx.practiceSession.updateMany({
          where: {
            studentId,
            practicePlanId: plan.id,
            startAt: { gt: now },
            status: PracticeSessionStatus.SUPPRESSED,
            cancellationReason: 'PRACTICE_PAUSED',
          },
          data: {
            status: PracticeSessionStatus.SCHEDULED,
            cancellationReason: null,
            version: { increment: 1 },
          },
        });
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: paused ? 'PRACTICE_PAUSED' : 'PRACTICE_RESUMED',
          entityType: 'PracticePlan',
          entityId: plan.id,
          reason,
          requestId: `practice-pause-${plan.id}-${now.getTime()}`,
          correlationId: `practice-${plan.id}`,
        },
      });
      return { planId: plan.id, status: paused ? 'PAUSED' : 'ACTIVE' };
    });
    await this.notifyPlanStatus(studentId, result.planId, paused);
    return result;
  }

  private async notifyPlanChange(
    plan: {
      id: string;
      studentId: string;
      revision: number;
      slots: Array<{
        slotKey: string;
        localTime: string;
        active: boolean;
        durationMinutes: number;
      }>;
      activeWeekdays: number[];
    },
    eventKey: 'PRACTICE_PLAN_CONFIRMED' | 'PRACTICE_PLAN_UPDATED',
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: plan.studentId },
      include: { defaultChannelIdentity: true },
    });
    if (!student?.defaultChannelIdentityId) return;
    const active = plan.slots.filter((slot) => slot.active);
    const fullName =
      student.fullNameEncrypted && student.fullNameKeyId
        ? this.encryption.decrypt(
            {
              ciphertext: Buffer.from(student.fullNameEncrypted),
              keyId: student.fullNameKeyId,
            },
            `student:${student.id}:name`,
          )
        : '';
    const scheduleSummary = formatPracticeScheduleSummary(active, plan.activeWeekdays);
    const morning = active.find((slot) => slot.slotKey === 'MORNING');
    const evening = active.find((slot) => slot.slotKey === 'EVENING');
    const variables =
      eventKey === 'PRACTICE_PLAN_CONFIRMED'
        ? {
            morningTimeText: morning
              ? `${morning.localTime} (${morning.durationMinutes} dakika)`
              : 'kapalı',
            eveningTimeText: evening
              ? `${evening.localTime} (${evening.durationMinutes} dakika)`
              : 'kapalı',
            durationText: `${plan.activeWeekdays.map((day) => weekdayLabels.get(day)).join(', ')} günlerinde uygulanacak`,
            studentDisplayName: fullName ? ` ${fullName.trim().split(/\s+/)[0]}` : '',
          }
        : { scheduleSummary };
    try {
      await this.messages.createIntent({
        eventKey,
        studentId: student.id,
        channelIdentityId: student.defaultChannelIdentityId,
        idempotencyKey: `practice-plan:${plan.id}:${eventKey.toLowerCase()}:v${plan.revision}`,
        locale: student.preferredLocale,
        stage: student.curriculumStage,
        variables,
      });
    } catch {
      // A missing template must not roll back an admin plan change.
    }
  }

  private async notifyPlanStatus(studentId: string, planId: string, paused: boolean) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        defaultChannelIdentity: true,
        practicePlans: { where: { id: planId }, include: { slots: true }, take: 1 },
      },
    });
    if (!student?.defaultChannelIdentityId) return;
    const currentPlan = student.practicePlans[0];
    const scheduleSummary = currentPlan
      ? formatPracticeScheduleSummary(currentPlan.slots, currentPlan.activeWeekdays)
      : '';
    const eventKey = paused ? 'PRACTICE_PAUSED' : 'PRACTICE_RESUMED';
    try {
      await this.messages.createIntent({
        eventKey,
        studentId,
        channelIdentityId: student.defaultChannelIdentityId,
        idempotencyKey: `practice-plan:${planId}:${eventKey.toLowerCase()}`,
        locale: student.preferredLocale,
        stage: student.curriculumStage,
        variables: paused ? { resumeAtText: '' } : { scheduleSummary },
      });
    } catch {
      // A missing template must not roll back an admin plan state change.
    }
  }

  async cancel(sessionId: string, reason: string, adminId: string) {
    return this.changeCancellation(sessionId, reason, adminId, false);
  }

  async reschedule(
    sessionId: string,
    startAt: Date,
    expectedVersion: number,
    reason: string,
    adminId: string,
  ) {
    const now = this.clock.now();
    if (startAt <= now) throw new Error('Practice session must be scheduled in the future.');
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.practiceSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { student: { include: { defaultChannelIdentity: true } } },
      });
      if (session.version !== expectedVersion) throw new Error('Practice session state conflict.');
      if (
        session.status !== PracticeSessionStatus.SCHEDULED &&
        session.status !== PracticeSessionStatus.REMINDED
      )
        throw new Error('Only upcoming sessions can be rescheduled.');
      if (session.startAt <= now) throw new Error('Started sessions cannot be changed.');

      const serviceDate = session.serviceDate.toISOString().slice(0, 10);
      const targetDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: session.student.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(startAt);
      if (serviceDate !== targetDate)
        throw new Error('Practice time must remain on the same local day.');

      const changed = await tx.practiceSession.updateMany({
        where: {
          id: session.id,
          version: expectedVersion,
          status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
        },
        data: {
          startAt,
          status: PracticeSessionStatus.SCHEDULED,
          replyNonceHmac: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('Practice session state conflict.');

      await tx.messageIntent.updateMany({
        where: {
          payload: { path: ['practiceSessionId'], equals: session.id },
          status: { in: ['PENDING', 'CLAIMED'] },
        },
        data: { status: 'SUPPRESSED', suppressionReason: 'SESSION_RESCHEDULED' },
      });
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: 'PRACTICE_RESCHEDULED',
          entityType: 'PracticeSession',
          entityId: session.id,
          reason,
          safeDiff: {
            previousStartAt: session.startAt.toISOString(),
            startAt: startAt.toISOString(),
          },
          requestId: `practice-reschedule-${session.id}-${now.getTime()}`,
          correlationId: `practice-${session.id}`,
        },
      });
      return {
        id: session.id,
        studentId: session.studentId,
        channelIdentityId: session.student.defaultChannelIdentityId,
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        timezone: session.student.timezone,
        status: PracticeSessionStatus.SCHEDULED,
        startAt: startAt.toISOString(),
        durationMinutes: session.durationMinutes,
        previousStartAt: session.startAt.toISOString(),
        version: expectedVersion + 1,
      };
    });
    await this.notifyPracticeChange(result, 'PRACTICE_RESCHEDULED');
    return { id: result.id, status: result.status, startAt: result.startAt };
  }

  async restore(sessionId: string, reason: string, adminId: string) {
    return this.changeCancellation(sessionId, reason, adminId, true);
  }
  async cancelRange(
    studentId: string,
    from: Date,
    to: Date,
    slotKey: string | undefined,
    reason: string,
    adminId: string,
  ) {
    const now = this.clock.now();
    if (to < from) throw new Error('Range end must not precede range start.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;
      const sessions = await tx.practiceSession.findMany({
        where: {
          studentId,
          serviceDate: { gte: from, lte: to },
          startAt: { gt: now },
          status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
          ...(slotKey ? { practiceSlot: { slotKey } } : {}),
        },
        select: { id: true },
      });
      const ids = sessions.map((session) => session.id);
      if (ids.length) {
        await tx.practiceSession.updateMany({
          where: {
            id: { in: ids },
            status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
          },
          data: {
            status: PracticeSessionStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: reason,
            version: { increment: 1 },
          },
        });
        await tx.messageIntent.updateMany({
          where: {
            status: { in: ['PENDING', 'CLAIMED'] },
            OR: ids.map((id) => ({ payload: { path: ['practiceSessionId'], equals: id } })),
          },
          data: { status: 'SUPPRESSED', suppressionReason: 'SESSION_CANCELLED' },
        });
      }
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: 'PRACTICE_RANGE_CANCELLED',
          entityType: 'Student',
          entityId: studentId,
          reason,
          safeDiff: { from: from.toISOString(), to: to.toISOString(), slotKey, count: ids.length },
          requestId: `practice-range-${studentId}-${now.getTime()}`,
          correlationId: `practice-${studentId}`,
        },
      });
      return { cancelled: ids.length };
    });
  }
  private async changeCancellation(
    sessionId: string,
    reason: string,
    adminId: string,
    restore: boolean,
  ) {
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.practiceSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: {
          practicePlan: { include: { subscriptionPeriod: true } },
          student: true,
        },
      });
      if (session.startAt <= now) throw new Error('Started sessions cannot be changed.');
      if (
        restore &&
        (session.status !== PracticeSessionStatus.CANCELLED ||
          session.practicePlan.status !== PracticePlanStatus.ACTIVE ||
          session.practicePlan.subscriptionPeriod.status !== SubscriptionStatus.ACTIVE)
      )
        throw new Error('This session cannot be restored.');
      if (
        !restore &&
        !(
          session.status === PracticeSessionStatus.SCHEDULED ||
          session.status === PracticeSessionStatus.REMINDED
        )
      )
        throw new Error('Only upcoming sessions can be cancelled.');
      const status = restore ? PracticeSessionStatus.SCHEDULED : PracticeSessionStatus.CANCELLED;
      const changed = await tx.practiceSession.updateMany({
        where: { id: session.id, version: session.version, status: session.status },
        data: {
          status,
          cancelledAt: restore ? null : now,
          cancellationReason: restore ? null : reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('Practice session state conflict.');
      await tx.messageIntent.updateMany({
        where: {
          payload: { path: ['practiceSessionId'], equals: session.id },
          status: { in: ['PENDING', 'CLAIMED'] },
        },
        data: {
          status: 'SUPPRESSED',
          suppressionReason: restore ? 'RESTORED_REPLACED' : 'SESSION_CANCELLED',
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: restore ? 'PRACTICE_RESTORED' : 'PRACTICE_CANCELLED',
          entityType: 'PracticeSession',
          entityId: session.id,
          reason,
          requestId: `practice-${session.id}-${now.getTime()}`,
          correlationId: `practice-${session.practicePlanId}`,
        },
      });
      return {
        id: session.id,
        studentId: session.studentId,
        channelIdentityId: session.student.defaultChannelIdentityId,
        locale: session.student.preferredLocale,
        stage: session.student.curriculumStage,
        timezone: session.student.timezone,
        startAt: session.startAt.toISOString(),
        durationMinutes: session.durationMinutes,
        status,
        version: session.version + 1,
      };
    });
    await this.notifyPracticeChange(result, restore ? 'PRACTICE_RESTORED' : 'PRACTICE_CANCELLED');
    return { id: result.id, status: result.status };
  }

  private async notifyPracticeChange(
    input: {
      id: string;
      studentId: string;
      channelIdentityId: string | null;
      locale: string;
      stage: string;
      timezone: string;
      startAt: string;
      durationMinutes: number;
      version: number;
      previousStartAt?: string;
    },
    eventKey: SystemEventKey,
  ) {
    if (!input.channelIdentityId) return;
    const startsAtText = new Intl.DateTimeFormat('tr-TR', {
      timeZone: input.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(input.startAt));
    const variables: Record<string, string> =
      eventKey === 'PRACTICE_CANCELLED'
        ? { startsAtText }
        : eventKey === 'PRACTICE_RESTORED'
          ? { startsAtText, durationText: `${input.durationMinutes} dakika` }
          : {
              previousStartsAtText: input.previousStartAt
                ? new Intl.DateTimeFormat('tr-TR', {
                    timeZone: input.timezone,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(input.previousStartAt))
                : startsAtText,
              startsAtText,
              durationText: `${input.durationMinutes} dakika`,
            };
    try {
      await this.messages.createIntent({
        eventKey,
        studentId: input.studentId,
        channelIdentityId: input.channelIdentityId,
        idempotencyKey: `practice:${input.id}:${eventKey.toLowerCase()}:v${input.version}`,
        locale: input.locale,
        stage: input.stage,
        variables,
      });
    } catch {
      // Missing or unpublished templates must not roll back an admin state change.
    }
  }

  async currentProgram(studentId: string) {
    const now = this.clock.now();
    const plan = await this.prisma.practicePlan.findFirst({
      where: { studentId, status: { in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED] } },
      orderBy: { revision: 'desc' },
      include: { slots: { where: { active: true } } },
    });
    const next = await this.prisma.practiceSession.findMany({
      where: {
        studentId,
        status: { in: [PracticeSessionStatus.SCHEDULED, PracticeSessionStatus.REMINDED] },
        startAt: { gte: now },
      },
      orderBy: { startAt: 'asc' },
      take: 2,
      include: { practiceSlot: true },
    });
    return {
      status: plan?.status ?? 'NONE',
      activeWeekdays: plan?.activeWeekdays ?? [],
      slots:
        plan?.slots.map((slot) => ({
          slot: slot.slotKey,
          localTime: slot.localTime,
          durationMinutes: slot.durationMinutes,
        })) ?? [],
      next: next.map((session) => ({
        slot: session.practiceSlot?.slotKey,
        startAt: session.startAt.toISOString(),
        durationMinutes: session.durationMinutes,
      })),
    };
  }

  async updateOutcome(
    sessionId: string,
    status: 'COMPLETED' | 'SKIPPED' | 'MISSED',
    expectedVersion: number,
    reflection: string | null | undefined,
    reason: string,
    adminId: string,
  ) {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.practiceSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { reflection: true },
      });
      if (session.version !== expectedVersion)
        throw new ConflictException('Practice session state conflict.');
      if (
        session.status === PracticeSessionStatus.CANCELLED ||
        session.status === PracticeSessionStatus.SUPPRESSED
      )
        throw new BadRequestException(
          'Cancelled or suppressed sessions cannot receive an outcome.',
        );
      if (session.startAt > now)
        throw new BadRequestException('A future practice cannot be marked as completed.');
      if (status !== PracticeSessionStatus.COMPLETED && reflection?.trim())
        throw new BadRequestException('Reflection can only be stored for a completed practice.');

      const changed = await tx.practiceSession.updateMany({
        where: { id: session.id, version: expectedVersion, status: session.status },
        data: {
          status,
          replyNonceHmac: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('Practice session state conflict.');

      const normalizedReflection = reflection?.trim() ?? '';
      if (status === PracticeSessionStatus.COMPLETED && normalizedReflection) {
        const consent = await tx.consent.findFirst({
          where: { studentId: session.studentId, scope: ConsentScope.REFLECTION_STORAGE },
          orderBy: { occurredAt: 'desc' },
        });
        if (consent?.status !== ConsentStatus.GRANTED)
          throw new BadRequestException('Reflection storage consent is required.');
        const encrypted = this.encryption.encrypt(
          normalizedReflection,
          `practice:${session.id}:reflection`,
        );
        await tx.practiceReflection.upsert({
          where: { practiceSessionId: session.id },
          create: {
            practiceSessionId: session.id,
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
          },
          update: {
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
          },
        });
      } else if (status !== PracticeSessionStatus.COMPLETED || reflection === null) {
        await tx.practiceReflection.deleteMany({ where: { practiceSessionId: session.id } });
      }

      await tx.messageIntent.updateMany({
        where: {
          payload: { path: ['practiceSessionId'], equals: session.id },
          status: { in: ['PENDING', 'CLAIMED'] },
        },
        data: { status: 'SUPPRESSED', suppressionReason: 'ADMIN_OUTCOME_UPDATED' },
      });
      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: adminId,
          action: 'PRACTICE_OUTCOME_UPDATED',
          entityType: 'PracticeSession',
          entityId: session.id,
          reason,
          safeDiff: {
            previousStatus: session.status,
            status,
            reflectionChanged:
              reflection !== undefined ||
              (status !== PracticeSessionStatus.COMPLETED && Boolean(session.reflection)),
          },
          requestId: `practice-outcome-${session.id}-${now.getTime()}`,
          correlationId: `practice-${session.practicePlanId}`,
        },
      });
      return {
        id: session.id,
        status,
        version: expectedVersion + 1,
        reflection:
          status === PracticeSessionStatus.COMPLETED
            ? normalizedReflection || undefined
            : undefined,
      };
    });
  }

  async respond(
    sessionId: string,
    studentId: string,
    replyNonce: string,
    response: 'COMPLETED' | 'SKIPPED',
    reflection?: string,
  ) {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.practiceSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { student: true },
      });
      if (session.studentId !== studentId) throw new Error('Practice response student mismatch.');
      if (
        session.status !== PracticeSessionStatus.AWAITING_RESPONSE ||
        !session.replyNonceHmac ||
        !this.lookup.verify(replyNonce, session.replyNonceHmac) ||
        now < session.startAt ||
        now >= endOfLocalServiceDate(session.serviceDate, session.student.timezone)
      )
        throw new Error('Practice response is no longer accepted.');
      const changed = await tx.practiceSession.updateMany({
        where: {
          id: session.id,
          status: PracticeSessionStatus.AWAITING_RESPONSE,
          version: session.version,
        },
        data: { status: response, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error('Practice response state conflict.');
      if (reflection?.trim()) {
        const consent = await tx.consent.findFirst({
          where: { studentId, scope: ConsentScope.REFLECTION_STORAGE },
          orderBy: { occurredAt: 'desc' },
        });
        if (consent?.status !== ConsentStatus.GRANTED)
          throw new Error('Reflection storage consent is required.');
        const encrypted = this.encryption.encrypt(
          reflection.trim(),
          `practice:${session.id}:reflection`,
        );
        await tx.practiceReflection.upsert({
          where: { practiceSessionId: session.id },
          create: {
            practiceSessionId: session.id,
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
          },
          update: {
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
          },
        });
      }
      return tx.practiceSession.findUniqueOrThrow({ where: { id: session.id } });
    });
  }
}
