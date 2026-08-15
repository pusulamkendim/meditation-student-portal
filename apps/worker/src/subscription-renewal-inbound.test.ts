import { randomUUID } from 'node:crypto';

import {
  FakeClock,
  FieldEncryption,
  loadApplicationConfig,
  type ApplicationConfig,
} from '@meditation/core';
import {
  PrismaClient,
  RegistrationStep,
  StudentStatus,
  SubscriptionRenewalStatus,
  SubscriptionStatus,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '@meditation/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  classifySubscriptionRenewalAction,
  SubscriptionRenewalInboundProcessor,
} from './subscription-renewal-inbound.js';
import {
  createSubscriptionRenewalReminder,
  processSubscriptionRenewalReminders,
  subscriptionRenewalTargetEndDate,
} from './subscription-lifecycle.js';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';

describe('subscription renewal reminder date', () => {
  it('uses the Istanbul calendar day and targets five days ahead', () => {
    expect(
      subscriptionRenewalTargetEndDate(new Date('2026-08-14T23:59:59.000Z')).toISOString(),
    ).toBe('2026-08-21T00:00:00.000Z');
  });
});

describe('subscription renewal answer classification', () => {
  it.each([
    ['Devam etmek isterim', 'CONTINUE'],
    ['ÜYELİĞİME DEVAM ETMEK İSTİYORUM', 'CONTINUE'],
    ['Devam etmeyeceğim', 'DECLINE'],
    ['devam etmeyecegim', 'DECLINE'],
    ['ÖDEME YAPTIM', 'PAYMENT_REPORTED'],
    ['odemeyi yaptim', 'PAYMENT_REPORTED'],
  ] as const)('classifies %s as %s', (content, expected) => {
    expect(classifySubscriptionRenewalAction(content, 'text')).toBe(expected);
  });

  it('accepts a receipt attachment and leaves unrelated text alone', () => {
    expect(classifySubscriptionRenewalAction(undefined, 'image')).toBe('PAYMENT_REPORTED');
    expect(classifySubscriptionRenewalAction(undefined, 'document')).toBe('PAYMENT_REPORTED');
    expect(classifySubscriptionRenewalAction('Görüşmem ne zaman?', 'text')).toBeUndefined();
  });
});

describe.runIf(runDatabaseTests)('subscription renewal inbound flow', () => {
  const key = Buffer.alloc(32, 17).toString('base64');
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://meditation:meditation@localhost:5433/meditation?schema=public';
  const config = loadApplicationConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key }),
    ACTIVE_DATA_KEY_ID: 'test',
    LOOKUP_HMAC_KEY: Buffer.alloc(32, 18).toString('base64'),
    PAYMENT_IBAN: 'TR00 TEST',
    PAYMENT_ACCOUNT_HOLDER: 'Test Hesap',
  }) as ApplicationConfig;
  const encryption = new FieldEncryption(new Map([['test', Buffer.from(key, 'base64')]]), 'test');
  const clock = new FakeClock('2099-08-14T23:59:59.000Z');
  const accountExternalId = `renewal-test-${randomUUID()}`;
  const senderHmac = randomUUID();
  const inboxIds: string[] = [];
  let prisma: PrismaClient;
  let processor: SubscriptionRenewalInboundProcessor;
  let studentId: string;
  let accountId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
    processor = new SubscriptionRenewalInboundProcessor(prisma, config, clock);

    const account = await prisma.channelAccount.create({
      data: {
        type: 'TELEGRAM',
        externalId: accountExternalId,
        displayName: 'Subscription renewal test',
      },
    });
    accountId = account.id;
    const student = await prisma.student.create({
      data: {
        status: StudentStatus.ACTIVE,
        registrationStep: RegistrationStep.COMPLETE,
      },
    });
    studentId = student.id;
    const protectedName = encryption.encrypt('Ayşe Yılmaz', `student:${student.id}:name`);
    const identity = await prisma.studentChannelIdentity.create({
      data: {
        studentId: student.id,
        channelAccountId: account.id,
        externalUserEncrypted: Buffer.from('test'),
        externalUserKeyId: 'test',
        externalUserHmac: senderHmac,
        status: 'ACTIVE',
      },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: {
        fullNameEncrypted: new Uint8Array(protectedName.ciphertext),
        fullNameKeyId: protectedName.keyId,
        defaultChannelIdentityId: identity.id,
        version: { increment: 1 },
      },
    });
    const subscription = await prisma.subscriptionPeriod.create({
      data: {
        studentId: student.id,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2099-07-17T00:00:00.000Z'),
        endExclusive: new Date('2099-08-21T00:00:00.000Z'),
      },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    const intents = await prisma.messageIntent.findMany({
      where: { studentId },
      select: { id: true },
    });
    const payments = await prisma.payment.findMany({
      where: { studentId },
      select: { id: true },
    });
    const renewals = await prisma.subscriptionRenewal.findMany({
      where: { studentId },
      select: { id: true },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: [
            ...intents.map(({ id }) => id),
            ...payments.map(({ id }) => id),
            ...renewals.map(({ id }) => id),
            subscriptionId,
          ],
        },
      },
    });
    await prisma.inboundResponseOwnership.deleteMany({
      where: { inboundMessageId: { in: inboxIds } },
    });
    await prisma.systemEventOccurrence.deleteMany({ where: { studentId } });
    await prisma.message.deleteMany({ where: { studentId } });
    await prisma.messageIntent.deleteMany({ where: { studentId } });
    await prisma.subscriptionRenewal.deleteMany({ where: { studentId } });
    await prisma.meetingCreditEvent.deleteMany({
      where: { subscriptionPeriod: { studentId } },
    });
    await prisma.subscriptionPeriod.deleteMany({ where: { studentId } });
    await prisma.payment.deleteMany({ where: { studentId } });
    await prisma.inboxEvent.deleteMany({ where: { id: { in: inboxIds } } });
    await prisma.student.delete({ where: { id: studentId } });
    await prisma.channelAccount.delete({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  async function send(text: string): Promise<string> {
    const dedupeKey = randomUUID();
    const protectedContent = encryption.encrypt(text, dedupeKey);
    const inbox = await prisma.inboxEvent.create({
      data: {
        channel: 'TELEGRAM',
        dedupeKey,
        eventType: 'MESSAGE_RECEIVED',
        payloadHash: randomUUID(),
        normalizedData: {
          accountExternalId,
          externalMessageId: randomUUID(),
          senderHmac,
          contentEncrypted: protectedContent.ciphertext.toString('base64'),
          contentKeyId: protectedContent.keyId,
          messageType: 'text',
          occurredAt: clock.now().toISOString(),
        },
      },
    });
    inboxIds.push(inbox.id);
    await expect(processor.process(inbox.id)).resolves.toBe('processed');
    return inbox.id;
  }

  it('does not queue a renewal reminder when a scheduled period already exists', async () => {
    const student = await prisma.student.create({
      data: {
        status: StudentStatus.ACTIVE,
        registrationStep: RegistrationStep.COMPLETE,
      },
    });
    const identity = await prisma.studentChannelIdentity.create({
      data: {
        studentId: student.id,
        channelAccountId: accountId,
        externalUserEncrypted: Buffer.from('scheduled-renewal'),
        externalUserKeyId: 'test',
        externalUserHmac: randomUUID(),
        status: 'ACTIVE',
      },
    });
    await prisma.student.update({
      where: { id: student.id },
      data: { defaultChannelIdentityId: identity.id, version: { increment: 1 } },
    });
    const source = await prisma.subscriptionPeriod.create({
      data: {
        studentId: student.id,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2099-07-23T00:00:00.000Z'),
        endExclusive: new Date('2099-08-21T00:00:00.000Z'),
      },
    });
    await prisma.subscriptionPeriod.create({
      data: {
        studentId: student.id,
        status: SubscriptionStatus.SCHEDULED,
        startDate: new Date('2099-08-21T00:00:00.000Z'),
        endExclusive: new Date('2099-09-18T00:00:00.000Z'),
      },
    });

    await expect(
      createSubscriptionRenewalReminder(prisma, clock, config, source.id, source.version),
    ).resolves.toBe(false);
    await expect(
      prisma.subscriptionRenewal.count({ where: { studentId: student.id } }),
    ).resolves.toBe(0);

    await prisma.subscriptionPeriod.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
  });

  it('queues the five-day reminder only once and records renewal payment once', async () => {
    const candidates = await prisma.subscriptionPeriod.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endExclusive: {
          gte: new Date('2099-08-21T00:00:00.000Z'),
          lt: new Date('2099-08-22T00:00:00.000Z'),
        },
        renewalRequest: null,
      },
    });
    expect(candidates.map(({ id }) => id)).toContain(subscriptionId);
    await expect(
      prisma.standardMessageVersion.count({
        where: {
          status: 'PUBLISHED',
          variant: { standardMessage: { eventKey: 'SUBSCRIPTION_RENEWAL_REMINDER' } },
        },
      }),
    ).resolves.toBeGreaterThan(0);
    await expect(processSubscriptionRenewalReminders(prisma, clock, config)).resolves.toBe(1);
    await expect(processSubscriptionRenewalReminders(prisma, clock, config)).resolves.toBe(0);

    const reminder = await prisma.messageIntent.findFirstOrThrow({
      where: { studentId, category: 'SUBSCRIPTION_RENEWAL_REMINDER' },
    });
    const reminderText = (reminder.payload as { rendered: string }).rendered;
    expect(reminderText).toContain('Sevgili Ayşe');
    expect(reminderText).toContain('bitmesine 5 gün kaldı');
    expect((reminder.payload as { quickReplies: unknown[] }).quickReplies).toHaveLength(2);

    await send('DEVAM ETMEYECEĞİM');
    const declined = await prisma.subscriptionRenewal.findUniqueOrThrow({
      where: { sourceSubscriptionPeriodId: subscriptionId },
    });
    expect(declined.status).toBe(SubscriptionRenewalStatus.DECLINED);
    const farewell = await prisma.messageIntent.findFirstOrThrow({
      where: {
        studentId,
        payload: { path: ['eventKey'], equals: 'SUBSCRIPTION_RENEWAL_DECLINED' },
      },
    });
    expect((farewell.payload as { rendered: string }).rendered).toContain(
      'Yolunda yürümeye devam et',
    );

    await send('DEVAM ETMEK İSTERİM');
    const continued = await prisma.subscriptionRenewal.findUniqueOrThrow({
      where: { sourceSubscriptionPeriodId: subscriptionId },
    });
    expect(continued.status).toBe(SubscriptionRenewalStatus.CONTINUE_REQUESTED);
    const instructions = await prisma.messageIntent.findFirstOrThrow({
      where: {
        studentId,
        payload: { path: ['eventKey'], equals: 'SUBSCRIPTION_RENEWAL_PAYMENT_INSTRUCTIONS' },
      },
    });
    const instructionText = (instructions.payload as { rendered: string }).rendered;
    expect(instructionText).toContain('TR00 TEST');
    expect(instructionText).toContain('Test Hesap');

    await send('ÖDEME YAPTIM');
    await send('ÖDEME YAPTIM');
    const renewal = await prisma.subscriptionRenewal.findUniqueOrThrow({
      where: { sourceSubscriptionPeriodId: subscriptionId },
      include: { payment: true },
    });
    expect(renewal.status).toBe(SubscriptionRenewalStatus.PAYMENT_REPORTED);
    expect(renewal.payment?.amountMinor).toBe(400000n);
    await expect(prisma.payment.count({ where: { studentId } })).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: {
          aggregateType: 'Payment',
          aggregateId: renewal.paymentId!,
          eventType: 'ADMIN_PAYMENT_REVIEW_REQUIRED',
        },
      }),
    ).resolves.toBe(1);
  });
});
