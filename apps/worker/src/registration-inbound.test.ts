import { randomUUID } from 'node:crypto';
import {
  FakeClock,
  FieldEncryption,
  loadApplicationConfig,
  type ApplicationConfig,
} from '@meditation/core';
import {
  ConsentScope,
  ConsentStatus,
  PrismaClient,
  RegistrationStep,
  StudentStatus,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '@meditation/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  extractFullName,
  isValidFullName,
  RegistrationInboundProcessor,
  shouldHandleRegistrationMessage,
} from './registration-inbound.js';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';
let prisma: PrismaClient;

describe('registration input validation', () => {
  it('requires a plausible first and last name', () => {
    expect(isValidFullName('Ayşe Yılmaz')).toBe(true);
    expect(isValidFullName("Nil Gün O'Neil")).toBe(true);
    expect(isValidFullName('Ayşe')).toBe(false);
    expect(isValidFullName('12 34')).toBe(false);
    expect(isValidFullName('süper çok sevindim')).toBe(false);
  });

  it('extracts a full name from a natural multi-line answer', () => {
    expect(extractFullName('Duygu diyebilirsiniz ☺️\nDuygu Bulut')).toBe('Duygu Bulut');
    expect(extractFullName('Duygu Bulut ☺️')).toBe('Duygu Bulut');
  });

  it('releases completed student messages to the agent router', () => {
    expect(shouldHandleRegistrationMessage(undefined, RegistrationStep.COMPLETE)).toBe(false);
    expect(shouldHandleRegistrationMessage(undefined, RegistrationStep.NAME)).toBe(true);
    expect(shouldHandleRegistrationMessage('KAYIT', RegistrationStep.COMPLETE)).toBe(true);
  });
});

describe.runIf(runDatabaseTests)('registration inbound flow', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://meditation:meditation@localhost:5433/meditation?schema=public';
  const config = loadApplicationConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key }),
    ACTIVE_DATA_KEY_ID: 'test',
    LOOKUP_HMAC_KEY: Buffer.alloc(32, 8).toString('base64'),
    PAYMENT_IBAN: 'TR00 TEST',
    PAYMENT_ACCOUNT_HOLDER: 'Test Hesap',
  }) as ApplicationConfig;
  const encryption = new FieldEncryption(new Map([['test', Buffer.from(key, 'base64')]]), 'test');
  const clock = new FakeClock('2026-07-13T09:00:00.000Z');
  const accountExternalId = `test-${randomUUID()}`;
  const senderHmac = randomUUID();
  const sender = `telegram-${randomUUID()}`;
  const inboxIds: string[] = [];
  let studentId: string | undefined;
  let processor: RegistrationInboundProcessor;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
    processor = new RegistrationInboundProcessor(prisma, config, clock);
  });

  afterAll(async () => {
    if (inboxIds.length) {
      await prisma.inboundResponseOwnership.deleteMany({
        where: { inboundMessageId: { in: inboxIds } },
      });
      await prisma.systemEventOccurrence.deleteMany({
        where: { inboundMessageId: { in: inboxIds } },
      });
      await prisma.message.deleteMany({ where: { inboxEventId: { in: inboxIds } } });
      await prisma.inboxEvent.deleteMany({ where: { id: { in: inboxIds } } });
    }
    if (studentId) {
      const intents = await prisma.messageIntent.findMany({
        where: { studentId },
        select: { id: true },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: intents.map((intent) => intent.id) } },
      });
      await prisma.messageIntent.deleteMany({ where: { studentId } });
      await prisma.payment.deleteMany({ where: { studentId } });
      await prisma.student.delete({ where: { id: studentId } });
    }
    await prisma.channelAccount.deleteMany({ where: { externalId: accountExternalId } });
    await prisma.$disconnect();
  });

  async function send(text: string, exactCommand?: 'KAYIT') {
    const dedupeKey = randomUUID();
    const protectedContent = encryption.encrypt(text, dedupeKey);
    const protectedSender = encryption.encrypt(sender, dedupeKey);
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
          senderEncrypted: protectedSender.ciphertext.toString('base64'),
          senderKeyId: protectedSender.keyId,
          contentEncrypted: protectedContent.ciphertext.toString('base64'),
          contentKeyId: protectedContent.keyId,
          ...(exactCommand ? { exactCommand } : {}),
        },
      },
    });
    inboxIds.push(inbox.id);
    await processor.process(inbox.id);
  }

  it('persists consent, encrypted name and payment through the complete inbound flow', async () => {
    await send('KAYIT', 'KAYIT');
    const identity = await prisma.studentChannelIdentity.findFirstOrThrow({
      where: { externalUserHmac: senderHmac },
      include: { student: true },
    });
    studentId = identity.studentId;
    expect(identity.student.registrationStep).toBe(RegistrationStep.PRIVACY_NOTICE);

    await send('ONAYLIYORUM');
    await send('EVET');
    await send('HAYIR');
    await send('Ayşe Yılmaz');
    await send('ÖDEME YAPTIM');

    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(student.registrationStep).toBe(RegistrationStep.PAYMENT_REVIEW);
    expect(student.status).toBe(StudentStatus.PAYMENT_PENDING);
    expect(
      encryption.decrypt(
        { ciphertext: Buffer.from(student.fullNameEncrypted!), keyId: student.fullNameKeyId! },
        `student:${student.id}:name`,
      ),
    ).toBe('Ayşe Yılmaz');
    await expect(
      prisma.privacyNoticeReceipt.count({ where: { studentId: student.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.consent.count({
        where: {
          studentId: student.id,
          scope: ConsentScope.MESSAGING,
          status: ConsentStatus.GRANTED,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.consent.count({
        where: {
          studentId: student.id,
          scope: ConsentScope.AGENT_REPLY_AI,
          status: ConsentStatus.WITHDRAWN,
        },
      }),
    ).resolves.toBe(1);
    await expect(prisma.payment.count({ where: { studentId: student.id } })).resolves.toBe(1);
    await expect(prisma.messageIntent.count({ where: { studentId: student.id } })).resolves.toBe(6);
    await expect(
      prisma.message.count({ where: { studentId: student.id, direction: 'INBOUND' } }),
    ).resolves.toBe(6);
  });
});
