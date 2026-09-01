import {
  bindingMatchesWhatsAppTemplate,
  FieldEncryption,
  renderMessageTemplate,
  resolveMessageVariant,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  MessageIntentStatus,
  PracticePlanStatus,
  PrismaClient,
  StandardMessageVersionStatus,
  StudentStatus,
  SubscriptionStatus,
} from '@meditation/database';

type SubscriptionRenewalConfig = Pick<
  ApplicationConfig,
  'DATA_ENCRYPTION_KEYS_JSON' | 'ACTIVE_DATA_KEY_ID'
>;

const SUBSCRIPTION_RENEWAL_REMINDER_DAYS = 5;
const SUBSCRIPTION_TIMEZONE = 'Europe/Istanbul';

function serviceDate(value: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SUBSCRIPTION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const valueFor = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(valueFor('year'), valueFor('month') - 1, valueFor('day')));
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

export function subscriptionRenewalTargetEndDate(now: Date): Date {
  // endExclusive is the day after the last service day. Five days before the
  // visible package end therefore means targeting endExclusive six days ahead.
  return addDays(serviceDate(now), SUBSCRIPTION_RENEWAL_REMINDER_DAYS + 1);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeZone: SUBSCRIPTION_TIMEZONE,
  }).format(value);
}

function createEncryption(config: SubscriptionRenewalConfig): FieldEncryption {
  if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
    throw new Error('Worker encryption keys are required.');
  const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
  return new FieldEncryption(
    new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
    config.ACTIVE_DATA_KEY_ID,
  );
}

export async function createSubscriptionRenewalReminder(
  prisma: PrismaClient,
  clock: Clock,
  config: SubscriptionRenewalConfig,
  subscriptionPeriodId: string,
  expectedVersion: number,
): Promise<boolean> {
  const now = clock.now();
  const encryption = createEncryption(config);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subscriptionPeriodId}))`;
    const subscription = await tx.subscriptionPeriod.findUniqueOrThrow({
      where: { id: subscriptionPeriodId },
      include: {
        renewalRequest: true,
        student: {
          include: { defaultChannelIdentity: { include: { channelAccount: true } } },
        },
      },
    });
    if (
      subscription.status !== SubscriptionStatus.ACTIVE ||
      subscription.version !== expectedVersion ||
      subscription.renewalRequest ||
      !subscription.student.defaultChannelIdentity
    )
      return false;

    const replacement = await tx.subscriptionPeriod.findFirst({
      where: {
        id: { not: subscription.id },
        studentId: subscription.studentId,
        OR: [
          { status: SubscriptionStatus.SCHEDULED, endExclusive: { gt: now } },
          {
            status: SubscriptionStatus.ACTIVE,
            startDate: { gte: subscription.endExclusive },
          },
        ],
      },
      select: { id: true },
    });
    if (replacement) return false;

    const identity = subscription.student.defaultChannelIdentity;
    const versions = await tx.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: now },
        variant: {
          channel: identity.channelAccount.type,
          standardMessage: { eventKey: 'SUBSCRIPTION_RENEWAL_REMINDER', audience: 'STUDENT' },
        },
      },
      include: { variant: { include: { providerBinding: true } } },
    });
    const fullName =
      subscription.student.fullNameEncrypted && subscription.student.fullNameKeyId
        ? encryption.decrypt(
            {
              ciphertext: Buffer.from(subscription.student.fullNameEncrypted),
              keyId: subscription.student.fullNameKeyId,
            },
            `student:${subscription.studentId}:name`,
          )
        : undefined;
    const firstName = fullName?.trim().split(/\s+/u)[0] ?? 'öğrencim';
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
        locale: subscription.student.preferredLocale,
        stage: subscription.student.curriculumStage,
        hasStudentName: Boolean(fullName),
      },
    );
    if (!variant) return false;

    const variables: Record<string, string> = {
      studentDisplayName: firstName,
      subscriptionEndsAtText: formatDate(addDays(subscription.endExclusive, -1)),
      amountText: '4.000 TL',
    };
    const renewal = await tx.subscriptionRenewal.create({
      data: {
        studentId: subscription.studentId,
        sourceSubscriptionPeriodId: subscription.id,
        reminderQueuedAt: now,
      },
    });
    const occurrence = await tx.systemEventOccurrence.create({
      data: {
        eventKey: 'SUBSCRIPTION_RENEWAL_REMINDER',
        studentId: subscription.studentId,
        idempotencyKey: `subscription:${subscription.id}:renewal:${SUBSCRIPTION_RENEWAL_REMINDER_DAYS}d`,
        variables,
        occurredAt: now,
      },
    });
    const binding = variant.variant.providerBinding;
    const approvedBinding = bindingMatchesWhatsAppTemplate(
      binding,
      'SUBSCRIPTION_RENEWAL_REMINDER',
      variant.content,
      variant.variant.locale,
    )
      ? binding
      : undefined;
    const intent = await tx.messageIntent.create({
      data: {
        studentId: subscription.studentId,
        channelIdentityId: identity.id,
        category: 'SUBSCRIPTION_RENEWAL_REMINDER',
        status: MessageIntentStatus.PENDING,
        idempotencyKey: `system-event:${occurrence.id}`,
        dueAt: now,
        expiresAt: subscription.endExclusive,
        aggregateVersion: subscription.student.version,
        payload: {
          eventKey: 'SUBSCRIPTION_RENEWAL_REMINDER',
          subscriptionPeriodId: subscription.id,
          subscriptionRenewalId: renewal.id,
          standardMessageVersionId: variant.id,
          rendered: renderMessageTemplate(
            'SUBSCRIPTION_RENEWAL_REMINDER',
            variant.content,
            variables,
          ),
          quickReplies: [
            { id: 'DEVAM ETMEK İSTERİM', title: 'Devam etmek isterim' },
            { id: 'DEVAM ETMEYECEĞİM', title: 'Devam etmeyeceğim' },
          ],
          providerTemplateName: approvedBinding?.templateName,
          providerTemplateLocale: approvedBinding?.providerLocale,
          providerTemplateParameters: approvedBinding
            ? (variant.placeholders as string[]).map((key) => String(variables[key] ?? ''))
            : undefined,
        },
      },
    });
    await tx.outboxEvent.createMany({
      data: [
        {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: intent.id,
          eventType: 'MessageIntentCreated',
          payload: { intentId: intent.id },
        },
        {
          topic: 'admin.notifications',
          aggregateType: 'SubscriptionRenewal',
          aggregateId: renewal.id,
          eventType: 'ADMIN_SUBSCRIPTION_EXPIRING',
          payload: {
            studentId: subscription.studentId,
            studentReference: subscription.studentId.slice(0, 8),
            subscriptionEndsAtText: variables.subscriptionEndsAtText,
          },
        },
      ],
    });
    return true;
  });
}

export async function processSubscriptionRenewalReminders(
  prisma: PrismaClient,
  clock: Clock,
  config: SubscriptionRenewalConfig,
): Promise<number> {
  const targetEndDate = subscriptionRenewalTargetEndDate(clock.now());
  const targetEndDateExclusive = addDays(targetEndDate, 1);
  const subscriptions = await prisma.subscriptionPeriod.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      endExclusive: { gte: targetEndDate, lt: targetEndDateExclusive },
      renewalRequest: null,
    },
    select: { id: true, version: true },
    orderBy: { id: 'asc' },
    take: 200,
  });
  let created = 0;
  for (const subscription of subscriptions) {
    if (
      await createSubscriptionRenewalReminder(
        prisma,
        clock,
        config,
        subscription.id,
        subscription.version,
      )
    )
      created += 1;
  }
  return created;
}

export async function reconcileSubscriptions(prisma: PrismaClient, clock: Clock): Promise<void> {
  const now = clock.now();
  const today = serviceDate(now);
  await prisma.$transaction(async (tx) => {
    for (const item of await tx.subscriptionPeriod.findMany({
      where: { status: SubscriptionStatus.SCHEDULED, startDate: { lte: today } },
    })) {
      const claimed = await tx.subscriptionPeriod.updateMany({
        where: { id: item.id, status: SubscriptionStatus.SCHEDULED, version: item.version },
        data: { status: SubscriptionStatus.ACTIVE, version: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      await tx.practicePlan.updateMany({
        where: {
          studentId: item.studentId,
          subscriptionPeriodId: { not: item.id },
          status: { in: [PracticePlanStatus.ACTIVE, PracticePlanStatus.PAUSED] },
          effectiveUntil: { lte: now },
        },
        data: { status: PracticePlanStatus.SUPERSEDED, version: { increment: 1 } },
      });
      await tx.practicePlan.updateMany({
        where: { subscriptionPeriodId: item.id, status: PracticePlanStatus.DRAFT },
        data: { status: PracticePlanStatus.ACTIVE, effectiveFrom: now, version: { increment: 1 } },
      });
      await tx.student.update({
        where: { id: item.studentId },
        data: { status: StudentStatus.ACTIVE, version: { increment: 1 } },
      });
    }
    for (const item of await tx.subscriptionPeriod.findMany({
      where: { status: SubscriptionStatus.ACTIVE, endExclusive: { lte: today } },
    })) {
      const claimed = await tx.subscriptionPeriod.updateMany({
        where: { id: item.id, status: SubscriptionStatus.ACTIVE, version: item.version },
        data: { status: SubscriptionStatus.EXPIRED, version: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      const replacement = await tx.subscriptionPeriod.findFirst({
        where: {
          studentId: item.studentId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED] },
          endExclusive: { gt: today },
        },
      });
      if (!replacement)
        await tx.student.update({
          where: { id: item.studentId },
          data: { status: StudentStatus.INACTIVE, version: { increment: 1 } },
        });
    }
  });
}
