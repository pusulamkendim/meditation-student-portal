import { BadRequestException, ConflictException } from '@nestjs/common';
import { generatePracticeSchedule } from '@meditation/core';
import {
  AuditActorType,
  MeditationGuidanceMode,
  MeditationRenderStatus,
  PracticePlanStatus,
  PracticeSessionStatus,
  SubscriptionStatus,
  type Prisma,
} from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { currentMeditationRenderMap } from '../practice/practice.service.js';

type Transaction = Prisma.TransactionClient;

type SourceSubscription = {
  id: string;
  studentId: string;
  startDate: Date;
  endExclusive: Date;
  status: SubscriptionStatus;
  version: number;
};

type RenewalSubscription = {
  id: string;
  studentId: string;
  startDate: Date;
  endExclusive: Date;
  status: SubscriptionStatus;
};

type PlanWithSlots = Prisma.PracticePlanGetPayload<{
  include: {
    slots: {
      include: {
        meditationType: {
          select: { id: true; title: true; audioRevision: true; guidanceMode: true };
        };
      };
    };
  };
}>;

type SubscriptionWithStudent = Prisma.SubscriptionPeriodGetPayload<{
  include: { student: true };
}>;

export function addSubscriptionDays(start: Date, days = 28): Date {
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function alignRenewalBoundary(
  tx: Transaction,
  input: {
    source: SourceSubscription;
    start: Date;
    today: Date;
    adminId: string;
  },
): Promise<PlanWithSlots | undefined> {
  const { source, start, today, adminId } = input;
  if (start < today) throw new BadRequestException('Yeni dönem başlangıcı bugünden önce olamaz.');
  if (start <= source.startDate)
    throw new BadRequestException('Yeni dönem önceki dönemin başlangıcından sonra olmalıdır.');

  const conflictingMeeting = await tx.weeklyMeeting.findFirst({
    where: {
      meetingSeries: { subscriptionPeriodId: source.id },
      status: { not: 'CANCELLED' },
      startsAt: { gte: start },
    },
    select: { id: true },
  });
  if (conflictingMeeting)
    throw new BadRequestException(
      'Yeni dönem başlangıcından sonraki eski dönem görüşmelerini önce yeniden planlayın veya iptal edin.',
    );

  const sourcePlan = await tx.practicePlan.findFirst({
    where: {
      subscriptionPeriodId: source.id,
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

  const previousEndExclusive = source.endExclusive;
  let addedSessionCount = 0;
  let suppressedSessionCount = 0;

  if (start < previousEndExclusive) {
    const affected = await tx.practiceSession.findMany({
      where: {
        practicePlan: { subscriptionPeriodId: source.id },
        serviceDate: { gte: start },
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
          cancellationReason: 'SUBSCRIPTION_RENEWED_EARLY',
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
        data: { status: 'SUPPRESSED', suppressionReason: 'SUBSCRIPTION_RENEWED_EARLY' },
      });
    }
  } else if (start > previousEndExclusive && sourcePlan) {
    addedSessionCount = await createSessionsForPlan(tx, {
      plan: sourcePlan,
      subscription: await tx.subscriptionPeriod.findUniqueOrThrow({
        where: { id: source.id },
        include: { student: true },
      }),
      rangeStart: previousEndExclusive,
      rangeEndExclusive: start,
    });
  }

  if (sourcePlan && (!sourcePlan.effectiveUntil || sourcePlan.effectiveUntil > start)) {
    await tx.practicePlan.update({
      where: { id: sourcePlan.id },
      data: { effectiveUntil: start, version: { increment: 1 } },
    });
  }

  const changed = await tx.subscriptionPeriod.updateMany({
    where: { id: source.id, version: source.version, status: source.status },
    data: {
      endExclusive: start,
      status: start.getTime() <= today.getTime() ? SubscriptionStatus.EXPIRED : source.status,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1)
    throw new ConflictException('Önceki üyelik dönemi başka bir işlem tarafından güncellendi.');

  await tx.auditLog.create({
    data: {
      actorType: AuditActorType.ADMIN,
      actorId: adminId,
      action: 'SUBSCRIPTION_RENEWAL_BOUNDARY_ALIGNED',
      entityType: 'SubscriptionPeriod',
      entityId: source.id,
      reason: 'Yeni dönem başlangıcına göre önceki dönem sınırı güncellendi.',
      safeDiff: {
        previousEndExclusive: previousEndExclusive.toISOString(),
        endExclusive: start.toISOString(),
        addedSessionCount,
        suppressedSessionCount,
      },
      requestId: randomUUID(),
      correlationId: `subscription-renewal-${source.id}`,
    },
  });

  return sourcePlan ?? undefined;
}

export async function carryPracticePlanToRenewal(
  tx: Transaction,
  input: {
    sourcePlan?: PlanWithSlots;
    subscription: RenewalSubscription;
    today: Date;
  },
): Promise<string | undefined> {
  const { sourcePlan, subscription, today } = input;
  if (!sourcePlan || !sourcePlan.slots.length) return undefined;

  // Renewal copies the operational plan silently. The payment approval is the
  // only student-facing message; plan confirmed/updated events are not emitted.
  const revision =
    (
      await tx.practicePlan.aggregate({
        where: { studentId: subscription.studentId },
        _max: { revision: true },
      })
    )._max.revision ?? 0;
  const status =
    sourcePlan.status === PracticePlanStatus.PAUSED
      ? PracticePlanStatus.PAUSED
      : subscription.status === SubscriptionStatus.ACTIVE
        ? PracticePlanStatus.ACTIVE
        : PracticePlanStatus.DRAFT;
  const plan = await tx.practicePlan.create({
    data: {
      studentId: subscription.studentId,
      subscriptionPeriodId: subscription.id,
      status,
      revision: revision + 1,
      effectiveFrom: subscription.startDate,
      activeWeekdays: sourcePlan.activeWeekdays,
      slots: {
        create: sourcePlan.slots.map((slot) => ({
          slotKey: slot.slotKey,
          localTime: slot.localTime,
          durationMinutes: slot.durationMinutes,
          active: slot.active,
          meditationTypeId: slot.meditationTypeId,
        })),
      },
    },
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

  if (subscription.status === SubscriptionStatus.ACTIVE) {
    await tx.practicePlan.updateMany({
      where: {
        id: sourcePlan.id,
        status: { in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED] },
      },
      data: {
        status: PracticePlanStatus.SUPERSEDED,
        effectiveUntil: today,
        version: { increment: 1 },
      },
    });
  }

  await createSessionsForPlan(tx, {
    plan,
    subscription: await tx.subscriptionPeriod.findUniqueOrThrow({
      where: { id: subscription.id },
      include: { student: true },
    }),
    rangeStart: subscription.startDate,
    rangeEndExclusive: subscription.endExclusive,
  });
  return plan.id;
}

async function createSessionsForPlan(
  tx: Transaction,
  input: {
    plan: PlanWithSlots;
    subscription: SubscriptionWithStudent;
    rangeStart: Date;
    rangeEndExclusive: Date;
  },
): Promise<number> {
  const { plan, subscription, rangeStart, rangeEndExclusive } = input;
  const scheduled = generatePracticeSchedule({
    startDate: rangeStart,
    endExclusive: rangeEndExclusive,
    timezone: subscription.student.timezone,
    activeWeekdays: plan.activeWeekdays,
    slots: plan.slots.map((slot) => ({
      slotKey: slot.slotKey,
      localTime: slot.localTime,
      active: slot.active,
      durationMinutes: slot.durationMinutes,
    })),
  });
  if (!scheduled.length) return 0;

  const meditationTypes = plan.slots
    .map((slot) => slot.meditationType)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const durations = [...new Set(scheduled.map((item) => item.durationMinutes))];
  const renders = meditationTypes.length
    ? await tx.meditationAudioRender.findMany({
        where: {
          meditationTypeId: { in: meditationTypes.map((item) => item.id) },
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
  const renderMap = currentMeditationRenderMap(meditationTypes, renders);
  const slotByKey = new Map(plan.slots.map((slot) => [slot.slotKey, slot]));
  const rows = scheduled.map((item) => {
    const slot = slotByKey.get(item.slotKey)!;
    const render = slot.meditationTypeId
      ? renderMap.get(`${slot.meditationTypeId}:${item.durationMinutes}`)
      : undefined;
    if (slot.meditationType?.guidanceMode === MeditationGuidanceMode.GUIDED && !render)
      throw new BadRequestException(
        `${slot.meditationType.title} için ${item.durationMinutes} dakikalık ses hazır değil.`,
      );
    const paused = plan.status === PracticePlanStatus.PAUSED;
    return {
      studentId: subscription.studentId,
      practicePlanId: plan.id,
      practiceSlotId: slot.id,
      meditationTypeId: slot.meditationTypeId,
      meditationRenderId: render?.id,
      serviceDate: item.serviceDate,
      startAt: item.startAt,
      durationMinutes: item.durationMinutes,
      status: paused ? PracticeSessionStatus.SUPPRESSED : PracticeSessionStatus.SCHEDULED,
      cancellationReason: paused ? 'PRACTICE_PAUSED' : null,
    };
  });
  const created = await tx.practiceSession.createMany({ data: rows, skipDuplicates: true });
  return created.count;
}
