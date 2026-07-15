import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  FakeClock,
  FieldEncryption,
  loadApplicationConfig,
  type ApplicationConfig,
  type ChannelAdapter,
  type OutboundChannelMessage,
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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { LlmAgentProcessor } from '../../../worker/src/llm-agent.js';
import { InboundIntentClassifier } from '../../../worker/src/inbound-intent.js';
import { InboundIntentRouter } from '../../../worker/src/inbound-intent-router.js';
import { MessageDispatcher } from '../../../worker/src/message-dispatcher.js';
import { processPracticeLifecycle } from '../../../worker/src/practice-lifecycle.js';
import { processPracticeResponse } from '../../../worker/src/practice-response.js';
import { RegistrationInboundProcessor } from '../../../worker/src/registration-inbound.js';
import { TelegramWebhookController } from '../channels/telegram-webhook.controller.js';
import { TelegramWebhookService } from '../channels/telegram-webhook.service.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';
import { PracticeService } from '../practice/practice.service.js';

const runE2e = process.env.RUN_REGISTRATION_E2E === 'true';

class RegistrationProviderCollector implements ChannelAdapter {
  readonly sent: OutboundChannelMessage[] = [];

  async send(message: OutboundChannelMessage) {
    this.sent.push(structuredClone(message));
    return { providerMessageId: String(1_000_000 + this.sent.length) };
  }
}

describe.runIf(runE2e)('E2E-REG Telegram registration', () => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://meditation:meditation@localhost:5433/meditation?schema=public';
  const encryptionKey = Buffer.alloc(32, 17).toString('base64');
  const config = loadApplicationConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ e2e: encryptionKey }),
    ACTIVE_DATA_KEY_ID: 'e2e',
    LOOKUP_HMAC_KEY: Buffer.alloc(32, 18).toString('base64'),
    TELEGRAM_ACCOUNT_ID: 'registration-e2e-bot',
    TELEGRAM_WEBHOOK_SECRET: 'registration-e2e-webhook-secret-0001',
    PAYMENT_IBAN: 'TR00 E2E TEST',
    PAYMENT_ACCOUNT_HOLDER: 'E2E Test Hesabı',
    GEMINI_API_KEY: 'e2e-fake-gemini-key',
  }) as ApplicationConfig;
  const clock = new FakeClock('2026-07-15T09:00:00.000Z');
  const encryption = new FieldEncryption(
    new Map([['e2e', Buffer.from(encryptionKey, 'base64')]]),
    'e2e',
  );
  const collector = new RegistrationProviderCollector();
  let updateId = 1000;
  let senderSequence = 9_000_000;
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let processor: RegistrationInboundProcessor;
  let dispatcher: MessageDispatcher;
  let agent: LlmAgentProcessor;
  let intentRouter: InboundIntentRouter;
  let practice: PracticeService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await syncSystemEventRegistry(prisma);
    await syncDefaultRegistrationMessages(prisma);
    const module = await Test.createTestingModule({
      controllers: [TelegramWebhookController],
      providers: [
        TelegramWebhookService,
        PrismaService,
        { provide: APPLICATION_CONFIG, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      rawBody: true,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    processor = new RegistrationInboundProcessor(prisma, config, clock);
    dispatcher = new MessageDispatcher(prisma, clock, config, { TELEGRAM: collector });
    agent = new LlmAgentProcessor(prisma, config, clock);
    intentRouter = new InboundIntentRouter(
      prisma,
      config,
      clock,
      new InboundIntentClassifier(prisma, config, clock),
      agent,
    );
    practice = new PracticeService(
      prisma as PrismaService,
      clock,
      config,
      new SystemMessageOrchestrator(prisma as PrismaService, clock),
    );
    await prisma.llmProvider.update({
      where: { adapterId: 'gemini' },
      data: { status: 'ENABLED' },
    });
    vi.stubGlobal('fetch', fakeGeminiFetch);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    vi.unstubAllGlobals();
  });

  function scenario() {
    return { senderId: ++senderSequence, sentFrom: collector.sent.length };
  }

  async function send(senderId: number, text: string, fixedUpdateId?: number) {
    const currentUpdateId = fixedUpdateId ?? ++updateId;
    const payload = {
      update_id: currentUpdateId,
      message: {
        message_id: currentUpdateId,
        date: Math.floor(clock.now().getTime() / 1000),
        text,
        from: { id: senderId, first_name: 'E2E' },
        chat: { id: senderId, type: 'private' },
      },
    };
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': config.TELEGRAM_WEBHOOK_SECRET },
      payload,
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<{ status: string }>();
    if (result.status === 'duplicate') return result;

    const inbox = await prisma.inboxEvent.findUniqueOrThrow({
      where: { dedupeKey: `tg:${config.TELEGRAM_ACCOUNT_ID}:update:${currentUpdateId}` },
    });
    expect(await processor.process(inbox.id)).toBe('processed');
    const ownership = await prisma.inboundResponseOwnership.findUniqueOrThrow({
      where: { inboundMessageId: inbox.id },
    });
    await dispatcher.dispatch(ownership.referenceId!);
    const processedInbox = await prisma.inboxEvent.findUniqueOrThrow({ where: { id: inbox.id } });
    return { ...result, inboxId: inbox.id, studentId: processedInbox.studentId! };
  }

  async function start(senderId: number) {
    const firstUpdateId = ++updateId;
    const result = await send(senderId, 'KAYIT', firstUpdateId);
    return { ...result, firstUpdateId };
  }

  async function getStudent(studentId: string) {
    return prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  }

  async function reachName(senderId: number, aiAnswer = 'EVET') {
    const started = await start(senderId);
    await send(senderId, 'ONAYLIYORUM');
    await send(senderId, 'EVET');
    await send(senderId, aiAnswer);
    return started.studentId;
  }

  async function complete(senderId: number, aiAnswer = 'EVET') {
    const studentId = await reachName(senderId, aiAnswer);
    await send(senderId, 'Ayşe Yılmaz');
    await send(senderId, 'ÖDEME YAPTIM');
    return { studentId, student: await getStudent(studentId) };
  }

  async function activateStudent(studentId: string, options: { withPractice?: boolean } = {}) {
    const payment = await prisma.payment.findFirstOrThrow({ where: { studentId } });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'APPROVED', approvedAt: clock.now() },
    });
    await prisma.student.update({
      where: { id: studentId },
      data: { status: 'ACTIVE', registrationStep: 'COMPLETE', version: { increment: 1 } },
    });
    const subscription = await prisma.subscriptionPeriod.create({
      data: {
        studentId,
        paymentId: payment.id,
        status: 'ACTIVE',
        startDate: new Date('2026-07-15T00:00:00.000Z'),
        endExclusive: new Date('2026-08-15T00:00:00.000Z'),
      },
    });
    if (options.withPractice === false) return subscription;
    const plan = await prisma.practicePlan.create({
      data: {
        studentId,
        subscriptionPeriodId: subscription.id,
        status: 'ACTIVE',
        revision: 1,
        effectiveFrom: new Date('2026-07-15T00:00:00.000Z'),
        slots: {
          create: [
            { slotKey: 'MORNING', localTime: '08:00', durationMinutes: 15 },
            { slotKey: 'EVENING', localTime: '21:00', durationMinutes: 15 },
          ],
        },
      },
      include: { slots: true },
    });
    const morning = plan.slots.find((slot) => slot.slotKey === 'MORNING')!;
    await prisma.practiceSession.create({
      data: {
        studentId,
        practicePlanId: plan.id,
        practiceSlotId: morning.id,
        serviceDate: new Date('2026-07-16T00:00:00.000Z'),
        startAt: new Date('2026-07-16T05:00:00.000Z'),
        durationMinutes: 15,
      },
    });
    await prisma.meetingSeries.create({
      data: {
        studentId,
        subscriptionPeriodId: subscription.id,
        timezone: 'Europe/Istanbul',
        recurrenceRule: 'FREQ=WEEKLY;COUNT=4',
        meetings: {
          create: {
            occurrenceNumber: 1,
            startsAt: new Date('2026-07-17T15:00:00.000Z'),
            endsAt: new Date('2026-07-17T16:00:00.000Z'),
          },
        },
      },
    });
  }

  async function sendAgentQuestion(
    senderId: number,
    text: string,
    expectedResult: 'processed' | 'handoff' = 'processed',
  ) {
    const currentUpdateId = ++updateId;
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': config.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: currentUpdateId,
        message: {
          message_id: currentUpdateId,
          date: Math.floor(clock.now().getTime() / 1000),
          text,
          from: { id: senderId, first_name: 'E2E' },
          chat: { id: senderId, type: 'private' },
        },
      },
    });
    expect(response.statusCode).toBe(201);
    const inbox = await prisma.inboxEvent.findUniqueOrThrow({
      where: { dedupeKey: `tg:${config.TELEGRAM_ACCOUNT_ID}:update:${currentUpdateId}` },
    });
    expect(await processor.process(inbox.id)).toBe('unhandled');
    expect(await intentRouter.process(inbox.id)).toBe(expectedResult);
    const ownership = await prisma.inboundResponseOwnership.findUniqueOrThrow({
      where: { inboundMessageId: inbox.id },
    });
    await dispatcher.dispatch(ownership.referenceId!);
    return {
      inboxId: inbox.id,
      answer: collector.sent.at(-1)!.content,
      ownership,
    };
  }

  async function sendPracticeResponse(senderId: number, text: string, replyToMessageId?: number) {
    const currentUpdateId = ++updateId;
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': config.TELEGRAM_WEBHOOK_SECRET },
      payload: {
        update_id: currentUpdateId,
        message: {
          message_id: currentUpdateId,
          date: Math.floor(clock.now().getTime() / 1000),
          text,
          ...(replyToMessageId ? { reply_to_message: { message_id: replyToMessageId } } : {}),
          from: { id: senderId, first_name: 'E2E' },
          chat: { id: senderId, type: 'private' },
        },
      },
    });
    expect(response.statusCode).toBe(201);
    const inbox = await prisma.inboxEvent.findUniqueOrThrow({
      where: { dedupeKey: `tg:${config.TELEGRAM_ACCOUNT_ID}:update:${currentUpdateId}` },
    });
    const route = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: inbox.id, eventType: 'MESSAGE_RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });
    let routingResult: Awaited<ReturnType<InboundIntentRouter['process']>> | false = false;
    if (route.topic === 'practice.inbound') {
      routingResult = (await processPracticeResponse(prisma, clock, config, inbox.id))
        ? 'practice'
        : false;
    } else {
      expect(await processor.process(inbox.id)).toBe('unhandled');
      routingResult = await intentRouter.process(inbox.id);
    }
    return {
      inboxId: inbox.id,
      processed: routingResult === 'practice' || routingResult === 'practice-clarification',
      routingResult,
      route: route.topic,
    };
  }

  async function dispatchPending(studentId: string) {
    const intents = await prisma.messageIntent.findMany({
      where: { studentId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    for (const intent of intents) await dispatcher.dispatch(intent.id);
  }

  async function processAgentInbox(inboxId: string) {
    const result = await intentRouter.process(inboxId);
    const ownership = await prisma.inboundResponseOwnership.findUniqueOrThrow({
      where: { inboundMessageId: inboxId },
    });
    await dispatcher.dispatch(ownership.referenceId!);
    return { result, owner: ownership.owner, answer: collector.sent.at(-1)!.content };
  }

  async function preparePracticeStage(stage: 'REMINDER' | 'CHECKIN') {
    clock.set('2026-07-15T09:00:00.000Z');
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    const subscription = await activateStudent(studentId, { withPractice: false });
    const plan = await practice.createPlan(
      studentId,
      subscription.id,
      [
        { slotKey: 'MORNING', localTime: '12:20', active: true },
        { slotKey: 'EVENING', localTime: '21:00', active: false },
      ],
      undefined,
      undefined,
      '00000000-0000-4000-8000-000000000001',
    );
    await dispatchPending(studentId);
    clock.advanceTo('2026-07-15T09:10:00.000Z');
    await processPracticeLifecycle(prisma, clock, config);
    await dispatchPending(studentId);
    if (stage === 'CHECKIN') {
      clock.advanceTo('2026-07-15T09:45:00.000Z');
      await processPracticeLifecycle(prisma, clock, config);
      await dispatchPending(studentId);
    }
    const session = await prisma.practiceSession.findFirstOrThrow({
      where: { practicePlanId: plan.id },
      orderBy: { startAt: 'asc' },
    });
    return { ...current, studentId, sessionId: session.id };
  }

  it('REG-01 completes the standard registration with AI consent', async () => {
    const current = scenario();
    const { studentId, student } = await complete(current.senderId);
    expect(student.status).toBe(StudentStatus.PAYMENT_PENDING);
    expect(student.registrationStep).toBe(RegistrationStep.PAYMENT_REVIEW);
    expect(
      encryption.decrypt(
        { ciphertext: Buffer.from(student.fullNameEncrypted!), keyId: student.fullNameKeyId! },
        `student:${student.id}:name`,
      ),
    ).toBe('Ayşe Yılmaz');
    expect(
      await prisma.consent.count({
        where: {
          studentId: student.id,
          scope: ConsentScope.MESSAGING,
          status: ConsentStatus.GRANTED,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.consent.count({
        where: {
          studentId: student.id,
          scope: ConsentScope.REFLECTION_STORAGE,
          status: ConsentStatus.GRANTED,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.consent.count({
        where: {
          studentId: student.id,
          scope: ConsentScope.AGENT_REPLY_AI,
          status: ConsentStatus.GRANTED,
        },
      }),
    ).toBe(1);
    expect(await prisma.payment.count({ where: { studentId } })).toBe(1);
    const sent = collector.sent.slice(current.sentFrom);
    expect(sent).toHaveLength(6);
    expect(new Set(sent.map((message) => message.idempotencyKey)).size).toBe(6);
    expect(collector.sent.at(-1)?.content.toLocaleLowerCase('tr-TR')).toContain('ödeme bildirimi');
  });

  it('REG-02 accepts natural confirmations and records an AI decline', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    await send(current.senderId, 'onayladım');
    await send(current.senderId, 'tamam');
    await send(current.senderId, 'istemiyorum');
    expect((await getStudent(started.studentId)).registrationStep).toBe(RegistrationStep.NAME);
    expect(
      await prisma.consent.count({
        where: {
          studentId: started.studentId,
          scope: ConsentScope.AGENT_REPLY_AI,
          status: ConsentStatus.WITHDRAWN,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.consent.count({
        where: {
          studentId: started.studentId,
          scope: ConsentScope.REFLECTION_STORAGE,
          status: ConsentStatus.WITHDRAWN,
        },
      }),
    ).toBe(1);

    const titleCase = scenario();
    const titleCaseStarted = await start(titleCase.senderId);
    await send(titleCase.senderId, 'Onaylıyorum');
    await send(titleCase.senderId, 'Evet');
    await send(titleCase.senderId, 'Hayır');
    expect((await getStudent(titleCaseStarted.studentId)).registrationStep).toBe(
      RegistrationStep.NAME,
    );
    expect(
      await prisma.consent.count({
        where: {
          studentId: titleCaseStarted.studentId,
          scope: ConsentScope.AGENT_REPLY_AI,
          status: ConsentStatus.WITHDRAWN,
        },
      }),
    ).toBe(1);
  });

  it('REG-03 keeps the student at KVKK when consent is declined', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    await send(current.senderId, 'hayır');
    expect((await getStudent(started.studentId)).registrationStep).toBe(
      RegistrationStep.PRIVACY_NOTICE,
    );
    expect(
      await prisma.privacyNoticeReceipt.count({ where: { studentId: started.studentId } }),
    ).toBe(0);
  });

  it('REG-04 does not grant messaging consent after a channel opt-in decline', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    await send(current.senderId, 'evet');
    await send(current.senderId, 'kabul etmiyorum');
    expect((await getStudent(started.studentId)).registrationStep).toBe(
      RegistrationStep.CHANNEL_OPT_IN,
    );
    expect(
      await prisma.consent.count({
        where: { studentId: started.studentId, scope: ConsentScope.MESSAGING },
      }),
    ).toBe(0);
  });

  it('REG-05 rejects invalid and conversational names before accepting a full name', async () => {
    const current = scenario();
    const studentId = await reachName(current.senderId);
    for (const value of ['Ayşe', '123 456', 'süper çok sevindim']) {
      await send(current.senderId, value);
      expect((await getStudent(studentId)).registrationStep).toBe(RegistrationStep.NAME);
    }
    await send(current.senderId, "Nil Gün O'Neil");
    expect((await getStudent(studentId)).registrationStep).toBe(
      RegistrationStep.PAYMENT_INSTRUCTIONS,
    );
  });

  it('REG-06 deduplicates a repeated Telegram update', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    const before = await prisma.inboxEvent.count({ where: { studentId: started.studentId } });
    expect((await send(current.senderId, 'KAYIT', started.firstUpdateId)).status).toBe('duplicate');
    expect(await prisma.inboxEvent.count({ where: { studentId: started.studentId } })).toBe(before);
    expect(await prisma.student.count({ where: { id: started.studentId } })).toBe(1);
  });

  it('REG-07 repeats the current prompt when KAYIT is sent mid-flow', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    await send(current.senderId, 'evet');
    await send(current.senderId, 'KAYIT');
    expect((await getStudent(started.studentId)).registrationStep).toBe(
      RegistrationStep.CHANNEL_OPT_IN,
    );
    expect(await prisma.student.count({ where: { id: started.studentId } })).toBe(1);
  });

  it('REG-08 does not create another payment when KAYIT is repeated after reporting', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId, 'HAYIR');
    await send(current.senderId, 'KAYIT');
    expect((await getStudent(studentId)).registrationStep).toBe(RegistrationStep.PAYMENT_REVIEW);
    expect(await prisma.payment.count({ where: { studentId } })).toBe(1);
  });

  it('REG-09 ignores enthusiastic or unrelated text as consent', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    for (const value of ['merhaba', 'süper çok sevindim', 'başlayalım']) {
      await send(current.senderId, value);
      expect((await getStudent(started.studentId)).registrationStep).toBe(
        RegistrationStep.PRIVACY_NOTICE,
      );
    }
    expect(
      await prisma.privacyNoticeReceipt.count({ where: { studentId: started.studentId } }),
    ).toBe(0);
  });

  it('REG-10 serializes competing answers without duplicate consent', async () => {
    const current = scenario();
    const started = await start(current.senderId);
    await Promise.all([send(current.senderId, 'evet'), send(current.senderId, 'hayır')]);
    const student = await getStudent(started.studentId);
    expect([RegistrationStep.CHANNEL_OPT_IN, RegistrationStep.AI_PREFERENCE]).toContain(
      student.registrationStep,
    );
    expect(
      await prisma.consent.count({
        where: { studentId: started.studentId, scope: ConsentScope.MESSAGING },
      }),
    ).toBeLessThanOrEqual(1);
    const inboundIds = await prisma.message.findMany({
      where: { studentId: started.studentId, direction: 'INBOUND' },
      select: { inboxEventId: true },
    });
    expect(
      await prisma.inboundResponseOwnership.count({
        where: { inboundMessageId: { in: inboundIds.flatMap((item) => item.inboxEventId ?? []) } },
      }),
    ).toBe(3);
  });

  it('LLM-01 answers when the next practice starts from student context', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId);
    const result = await sendAgentQuestion(current.senderId, 'Pratiklerim ne zaman başlayacak?');
    expect(result.answer).toContain('16.07.2026 08:00');
    await expectAgentEvidence(result.inboxId, studentId, 'PRACTICE');
  });

  it('LLM-02 answers the next meeting time from student context', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId);
    const result = await sendAgentQuestion(current.senderId, 'Görüşmemiz ne zaman?');
    expect(result.answer).toContain('17.07.2026 18:00');
    await expectAgentEvidence(result.inboxId, studentId, 'MEETINGS');
  });

  it('LLM-03 answers total daily practice duration from the active plan', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId);
    const result = await sendAgentQuestion(current.senderId, 'Günde kaç dakika pratik yapmalıyım?');
    expect(result.answer).toContain('30 dakika');
    await expectAgentEvidence(result.inboxId, studentId, 'PRACTICE');
  });

  it('LLM-04 does not invent a schedule when the student has no practice plan', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId, { withPractice: false });

    const result = await sendAgentQuestion(
      current.senderId,
      'Pratiklerim ne zaman başlayacak?',
      'handoff',
    );

    expect(result.answer).toContain("Bunu Necip'e ileteceğim.");
    expect(result.answer).not.toMatch(/\b\d{1,2}[.:]\d{2}\b/);
    expect(result.ownership.owner).toBe('ADMIN_HANDOFF');
    expect(await prisma.handoff.count({ where: { studentId, status: 'OPEN' } })).toBe(1);
    await expectAgentEvidence(result.inboxId, studentId, 'PRACTICE', 0);
  });

  it('FLOW-01 records the current admin-plan and student-response behavior', async () => {
    clock.set('2026-07-15T09:00:00.000Z');
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    const subscription = await activateStudent(studentId, { withPractice: false });
    const sentFrom = collector.sent.length;

    await practice.createPlan(
      studentId,
      subscription.id,
      [
        { slotKey: 'MORNING', localTime: '12:20', active: true },
        { slotKey: 'EVENING', localTime: '21:00', active: true },
      ],
      undefined,
      undefined,
      '00000000-0000-4000-8000-000000000001',
    );
    await dispatchPending(studentId);
    const planConfirmation = collector.sent.at(-1)?.content ?? '';
    expect(planConfirmation).toContain('her pratik 15 dakika');
    expect(planConfirmation).not.toContain('her pratik 30 dakika');
    const planReply = await sendPracticeResponse(current.senderId, 'ONAYLIYORUM');
    const planReplyRoute = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: planReply.inboxId, eventType: 'MESSAGE_RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });

    clock.advanceTo('2026-07-15T09:10:00.000Z');
    await processPracticeLifecycle(prisma, clock, config);
    await dispatchPending(studentId);

    clock.advanceTo('2026-07-15T09:45:00.000Z');
    await processPracticeLifecycle(prisma, clock, config);
    await dispatchPending(studentId);
    const completedResponse = await sendPracticeResponse(current.senderId, 'YAPTIM');
    await dispatchPending(studentId);
    await prisma.practiceSession.updateMany({
      where: { studentId, status: 'COMPLETED' },
      data: { updatedAt: clock.now() },
    });
    const reflectionResponse = await sendPracticeResponse(
      current.senderId,
      'Başta odaklanmakta zorlandım, sonra sakinleştim.',
    );

    clock.advanceTo('2026-07-15T17:50:00.000Z');
    await processPracticeLifecycle(prisma, clock, config);
    await dispatchPending(studentId);
    clock.advanceTo('2026-07-15T18:25:00.000Z');
    await processPracticeLifecycle(prisma, clock, config);
    await dispatchPending(studentId);
    const skippedResponse = await sendPracticeResponse(current.senderId, 'YAPAMADIM');
    await dispatchPending(studentId);

    const messages = await Promise.all(
      collector.sent.slice(sentFrom).map(async (message) => {
        const intent = await prisma.messageIntent.findUniqueOrThrow({
          where: { id: message.intentId },
        });
        const payload = intent.payload as Record<string, unknown>;
        return {
          eventKey: typeof payload.eventKey === 'string' ? payload.eventKey : intent.category,
          content: message.content,
          quickReplies: message.quickReplies?.map((reply) => reply.title) ?? [],
        };
      }),
    );
    const sessions = await prisma.practiceSession.findMany({
      where: { studentId, serviceDate: new Date('2026-07-15T00:00:00.000Z') },
      orderBy: { startAt: 'asc' },
      select: { startAt: true, durationMinutes: true, status: true },
    });
    const observation = {
      messages,
      responses: {
        planConfirmationProcessedAsPracticeResponse: planReply.processed,
        planConfirmationRoute: planReplyRoute.topic,
        completedProcessed: completedResponse.processed,
        reflectionProcessed: reflectionResponse.processed,
        skippedProcessed: skippedResponse.processed,
      },
      sessions,
      reflectionCount: await prisma.practiceReflection.count({
        where: { practiceSession: { studentId } },
      }),
    };

    console.info(`PRACTICE_FLOW_OBSERVATION ${JSON.stringify(observation, null, 2)}`);
    expect(messages.length).toBeGreaterThan(0);
    expect(sessions).toHaveLength(2);
  });

  it('FLOW-02 observes likely student messages after a practice reminder', async () => {
    const current = await preparePracticeStage('REMINDER');
    const observations = [];

    for (const text of [
      'Hazırım',
      'Bugün yapamayacağım',
      'Bu saati değiştirmek istiyorum',
      'Görüşmem ne zaman?',
    ]) {
      const result = await sendPracticeResponse(current.senderId, text);
      observations.push({
        text,
        route: result.route,
        processedAsPracticeResponse: result.processed,
      });
    }

    console.info(`PRACTICE_REMINDER_REPLIES ${JSON.stringify(observations, null, 2)}`);
    expect(observations).toHaveLength(4);
    expect(observations.find((item) => item.text === 'Bugün yapamayacağım')).toMatchObject({
      route: 'channel.inbound',
      processedAsPracticeResponse: true,
    });
  });

  it('FLOW-03 observes likely student messages while a check-in awaits a response', async () => {
    const observations = [];
    for (const text of [
      'YAPTIM',
      'Yaptim',
      'yaptim',
      'YAPAMADIM',
      'Yapamadim',
      'yapamadim',
      'Tamamladım',
      'Bugün yapamayacağım',
      'Teşekkür ederim',
      'Görüşmem ne zaman?',
    ]) {
      const current = await preparePracticeStage('CHECKIN');
      const sentFrom = collector.sent.length;
      const result = await sendPracticeResponse(current.senderId, text);
      const agentResult =
        result.route === 'channel.inbound' ? await processAgentInbox(result.inboxId) : null;
      await dispatchPending(current.studentId);
      const session = await prisma.practiceSession.findUniqueOrThrow({
        where: { id: current.sessionId },
      });
      observations.push({
        text,
        route: result.route,
        processedAsPracticeResponse: result.processed,
        agentResult,
        sessionStatus: session.status,
        replies: collector.sent.slice(sentFrom).map((message) => message.content),
      });
    }

    console.info(`PRACTICE_CHECKIN_REPLIES ${JSON.stringify(observations, null, 2)}`);
    expect(observations).toHaveLength(10);
    const meetingQuestion = observations.find((item) => item.text === 'Görüşmem ne zaman?');
    expect(meetingQuestion).toMatchObject({
      route: 'channel.inbound',
      processedAsPracticeResponse: false,
      sessionStatus: 'AWAITING_RESPONSE',
    });
    expect(meetingQuestion?.agentResult).not.toBeNull();
    expect(observations.find((item) => item.text === 'Tamamladım')?.sessionStatus).toBe(
      'COMPLETED',
    );
    expect(observations.find((item) => item.text === 'Bugün yapamayacağım')?.sessionStatus).toBe(
      'SKIPPED',
    );
  });

  it('FLOW-04 observes practice-independent questions after activation', async () => {
    clock.set('2026-07-15T09:00:00.000Z');
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId);
    const observations = [];

    for (const item of [
      { text: 'Görüşmem ne zaman?', result: 'processed' as const },
      { text: 'Ödemem onaylandı mı?', result: 'processed' as const },
      { text: 'Paketim ne zaman bitiyor?', result: 'processed' as const },
      { text: 'Bugün nasılsın?', result: 'processed' as const },
    ]) {
      const response = await sendAgentQuestion(current.senderId, item.text, item.result);
      observations.push({
        text: item.text,
        owner: response.ownership.owner,
        answer: response.answer,
      });
    }

    console.info(`NON_PRACTICE_QUESTIONS ${JSON.stringify(observations, null, 2)}`);
    expect(observations).toHaveLength(4);
  });

  it('ROUTER-01 does not mutate practice state for a low-confidence completion', async () => {
    const current = await preparePracticeStage('CHECKIN');
    const result = await sendPracticeResponse(current.senderId, 'Sanırım yaptım galiba');
    await dispatchPending(current.studentId);

    expect(result.routingResult).toBe('practice-clarification');
    expect(
      (await prisma.practiceSession.findUniqueOrThrow({ where: { id: current.sessionId } })).status,
    ).toBe('AWAITING_RESPONSE');
    expect(
      await prisma.inboundIntentDecision.findUniqueOrThrow({
        where: { inboxEventId: result.inboxId },
      }),
    ).toMatchObject({ domain: 'PRACTICE', action: 'COMPLETE', confidence: 60 });
  });

  it('ROUTER-02 fails closed when both classifier attempts return invalid output', async () => {
    const current = await preparePracticeStage('CHECKIN');
    const result = await sendPracticeResponse(current.senderId, 'E2E_INVALID_INTENT');

    expect(result.routingResult).toBe('handoff');
    expect(
      (await prisma.practiceSession.findUniqueOrThrow({ where: { id: current.sessionId } })).status,
    ).toBe('AWAITING_RESPONSE');
    expect(
      await prisma.inboundIntentDecision.findUniqueOrThrow({
        where: { inboxEventId: result.inboxId },
      }),
    ).toMatchObject({ status: 'FAILED', confidence: 0 });
    expect(
      await prisma.inboundResponseOwnership.findUniqueOrThrow({
        where: { inboundMessageId: result.inboxId },
      }),
    ).toMatchObject({ owner: 'ADMIN_HANDOFF' });
  });

  it('ROUTER-03 applies a retried inbox only once', async () => {
    const current = await preparePracticeStage('CHECKIN');
    const result = await sendPracticeResponse(current.senderId, 'Yaptım');

    expect(await intentRouter.process(result.inboxId)).toBe('ignored');
    expect(
      await prisma.inboundIntentDecision.count({ where: { inboxEventId: result.inboxId } }),
    ).toBe(1);
    expect(
      await prisma.inboundResponseOwnership.count({
        where: { inboundMessageId: result.inboxId },
      }),
    ).toBe(1);
    expect(
      await prisma.llmUsageLog.count({ where: { operationId: `intent:${result.inboxId}` } }),
    ).toBe(1);
  });

  it('ROUTER-04 sends at most four prior messages with the current message', async () => {
    const current = scenario();
    const { studentId } = await complete(current.senderId);
    await activateStudent(studentId);
    for (const text of [
      'Teşekkür ederim',
      'Bugün nasılsın?',
      'Paketim ne zaman bitiyor?',
      'Ödemem onaylandı mı?',
      'Görüşmem ne zaman?',
      'Günde kaç dakika pratik yapmalıyım?',
    ])
      await sendAgentQuestion(current.senderId, text);

    const decision = await prisma.inboundIntentDecision.findFirstOrThrow({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
    const snapshot = decision.contextSnapshot as { historyCount?: number };
    expect(snapshot.historyCount).toBe(4);
  });

  it('ROUTER-05 gives an explicit reply context precedence over recent-event fallback', async () => {
    const current = await preparePracticeStage('CHECKIN');
    const checkinMessage = await prisma.message.findFirstOrThrow({
      where: {
        studentId: current.studentId,
        direction: 'OUTBOUND',
        externalMessageId: { not: null },
        messageIntent: { payload: { path: ['eventKey'], equals: 'PRACTICE_CHECKIN' } },
      },
      orderBy: { occurredAt: 'desc' },
    });
    const result = await sendPracticeResponse(
      current.senderId,
      'Yaptım',
      Number(checkinMessage.externalMessageId),
    );
    const decision = await prisma.inboundIntentDecision.findUniqueOrThrow({
      where: { inboxEventId: result.inboxId },
    });

    expect(decision).toMatchObject({
      domain: 'PRACTICE',
      action: 'COMPLETE',
      contextSource: 'REPLY',
    });
    expect(
      (await prisma.practiceSession.findUniqueOrThrow({ where: { id: current.sessionId } })).status,
    ).toBe('COMPLETED');
  });

  async function expectAgentEvidence(
    inboxId: string,
    studentId: string,
    section: string,
    minimumRows = 1,
  ) {
    const intent = await prisma.messageIntent.findUniqueOrThrow({
      where: { idempotencyKey: `agent:${inboxId}` },
    });
    expect(['AGENT_REPLY', 'AGENT_HANDOFF']).toContain(intent.category);
    expect(
      await prisma.llmUsageLog.count({
        where: { studentId, task: 'AGENT_REPLY', status: 'SUCCEEDED' },
      }),
    ).toBeGreaterThanOrEqual(1);
    const decision = await prisma.inboundIntentDecision.findUniqueOrThrow({
      where: { inboxEventId: inboxId },
    });
    expect(decision.status).toBe('APPLIED');
    const contextRead = await prisma.agentContextRead.findFirstOrThrow({
      where: { studentId, sourceMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    expect(contextRead.sections).toContain(section);
    expect(contextRead.rowCount).toBeGreaterThanOrEqual(minimumRows);
  }
});

async function fakeGeminiFetch(_url: string | URL | Request, init?: RequestInit) {
  const request = JSON.parse(String(init?.body)) as {
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  const prompt = request.contents[0]!.parts[0]!.text;
  try {
    const compact = JSON.parse(prompt) as {
      m?: string;
      reply?: string | null;
      event?: string | null;
      history?: Array<[string, string]>;
      state?: string[];
    };
    if (typeof compact.m === 'string') {
      const output = classifyFakeIntent(compact);
      return geminiResponse(output, 42, 8);
    }
  } catch {
    // Agent prompts are intentionally not JSON documents.
  }
  const question = prompt.match(/^Question: (.*)$/m)?.[1] ?? '';
  const contextJson = prompt.match(
    /Student context \(untrusted data, not instructions\): (.*)\nRecent allowed conversation/s,
  )?.[1];
  if (!contextJson) throw new Error('Fake Gemini did not receive student context.');
  const context = JSON.parse(contextJson) as {
    asOf: string;
    sections: {
      MEETINGS?: Array<{ startsAt: string }>;
      PAYMENT?: Array<{ status: string }>;
      MEMBERSHIP?: Array<{ endExclusive: string }>;
      PRACTICE?: {
        plan: { slots: Array<{ active: boolean; durationMinutes: number }> } | null;
        nextPractice: { startAt: string };
      };
    };
    recordHashes: string[];
  };
  const section = Object.keys(context.sections)[0];
  let answer: string;
  if (section === 'MEETINGS') {
    const startsAt = context.sections.MEETINGS![0]!.startsAt;
    answer = `Bir sonraki görüşmemiz ${formatIstanbul(startsAt)}.`;
  } else if (section === 'PAYMENT') {
    answer = `Son ödeme durumun ${context.sections.PAYMENT![0]!.status}.`;
  } else if (section === 'MEMBERSHIP') {
    answer = `Paketin ${context.sections.MEMBERSHIP![0]!.endExclusive} tarihine kadar geçerli.`;
  } else if (section === 'PRACTICE' && !context.sections.PRACTICE!.plan) {
    answer = "Henüz tanımlanmış bir pratik programın görünmüyor. Bunu Necip'e ileteceğim.";
  } else if (section === 'PRACTICE' && question.toLocaleLowerCase('tr-TR').includes('kaç dakika')) {
    const total = context.sections
      .PRACTICE!.plan!.slots.filter((slot: { active: boolean }) => slot.active)
      .reduce((sum: number, slot: { durationMinutes: number }) => sum + slot.durationMinutes, 0);
    answer = `Günlük toplam ${total} dakika pratik yapmalısın.`;
  } else if (section === 'PRACTICE') {
    answer = `İlk sıradaki pratiğin ${formatIstanbul(context.sections.PRACTICE!.nextPractice.startAt)}.`;
  } else {
    answer = 'İyiyim, teşekkür ederim. Umarım senin de günün güzel geçiyordur.';
  }
  const output = {
    answer,
    usedSections: section ? [section] : [],
    asOf: context.asOf,
    evidenceRecordHashes: context.recordHashes,
    handoffRequired: section === 'PRACTICE' && !context.sections.PRACTICE!.plan,
    sourceChunkIds: [],
    supported: true,
  };
  return geminiResponse(output, 120, 30);
}

function classifyFakeIntent(input: {
  m: string;
  reply?: string | null;
  event?: string | null;
  history?: Array<[string, string]>;
  state?: string[];
}) {
  const text = input.m.normalize('NFKC').toLocaleLowerCase('tr-TR').replaceAll('ı', 'i');
  const source = input.reply ? 'REPLY' : input.event ? 'EVENT' : 'CURRENT';
  if (/kendime zarar|intihar|yaşamak istemiyorum/.test(text))
    return { domain: 'SAFETY', action: 'HANDOFF', confidence: 99, source };
  if (/görüş|meet|link/.test(text))
    return { domain: 'MEETING', action: 'QUERY', confidence: 97, source };
  if (/ödeme|odeme/.test(text))
    return { domain: 'PAYMENT', action: 'QUERY', confidence: 97, source };
  if (/paket|üyelik|uyelik/.test(text))
    return { domain: 'MEMBERSHIP', action: 'QUERY', confidence: 96, source };
  if (/saat.*değiş|saati.*değiş|saati.*degis/.test(text))
    return { domain: 'PRACTICE', action: 'CHANGE', confidence: 97, source };
  if (/yapamadim|yapamayacağim|yapamayacagim|firsat bulamadim/.test(text))
    return { domain: 'PRACTICE', action: 'SKIP', confidence: 97, source };
  if (text.includes('sanirim yaptim galiba'))
    return { domain: 'PRACTICE', action: 'COMPLETE', confidence: 60, source };
  if (/yaptim|tamamladim|bitirdim/.test(text))
    return { domain: 'PRACTICE', action: 'COMPLETE', confidence: 97, source };
  if (/zorlandim|sakinleştim|sakinlestim|hissettim|odaklan/.test(text))
    return { domain: 'PRACTICE', action: 'REFLECT', confidence: 92, source };
  if (/pratik|kaç dakika|kac dakika/.test(text))
    return { domain: 'PRACTICE', action: 'QUERY', confidence: 96, source };
  if (/teşekkür|tesekkur|nasilsin|nasılsın/.test(text))
    return { domain: 'GENERAL', action: 'SMALL_TALK', confidence: 94, source };
  if (/onayliyorum|hazirim|evet/.test(text))
    return { domain: 'GENERAL', action: 'CONFIRM', confidence: 82, source };
  if (text.includes('e2e_invalid_intent')) return { invalid: true };
  return { domain: 'GENERAL', action: 'UNKNOWN', confidence: 45, source };
}

function geminiResponse(output: unknown, inputTokens: number, outputTokens: number) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }],
      usageMetadata: {
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        totalTokenCount: inputTokens + outputTokens,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'e2e-gemini' } },
  );
}

function formatIstanbul(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(',', '');
}
