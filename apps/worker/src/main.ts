import { loadApplicationConfig, syncWhatsAppTemplates, SystemClock } from '@meditation/core';
import {
  createPrismaWhatsAppTemplateStore,
  PrismaClient,
  syncDefaultRegistrationMessages,
  syncSystemEventRegistry,
} from '@meditation/database';
import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { registerSmokeQueue } from './queue-runtime.js';
import { createChannelAdapters, MessageDispatcher } from './message-dispatcher.js';
import {
  processSubscriptionRenewalReminders,
  reconcileSubscriptions,
} from './subscription-lifecycle.js';
import { processPracticeLifecycle } from './practice-lifecycle.js';
import { processPracticeResponse } from './practice-response.js';
import { expireStalePracticeResponses } from './practice-response-timeout.js';
import { processMeetingReminder, processMeetingSummaries } from './meeting-lifecycle.js';
import { MeetingCalendarWorker } from './meeting-calendar.js';
import { LlmAgentProcessor } from './llm-agent.js';
import { KnowledgeIngestionProcessor } from './knowledge-ingestion.js';
import { WeeklySummaryAiProcessor } from './weekly-summary-ai.js';
import { StudentPulseAiProcessor } from './student-pulse-ai.js';
import { StudentReportAiProcessor } from './student-report-ai.js';
import { RegistrationInboundProcessor } from './registration-inbound.js';
import { SubscriptionRenewalInboundProcessor } from './subscription-renewal-inbound.js';
import { InboundIntentRouter } from './inbound-intent-router.js';
import { AdminPanelNotificationProcessor } from './admin-panel-notification.js';
import { MeditationAudioRenderProcessor } from './meditation-audio-render.js';
import { VoiceMessageProcessor } from './voice-message.js';
import {
  configureResponsiveQueue,
  OUTBOX_POLL_INTERVAL_MS,
  RESPONSIVE_WORK_OPTIONS,
} from './responsive-queue.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const logger = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
  const boss = new PgBoss({ connectionString: config.DATABASE_URL, useListenNotify: true });
  const prisma = new PrismaClient();
  const systemClock = new SystemClock();
  const calendarWorker = new MeetingCalendarWorker(prisma, config, systemClock);
  const llmAgent = new LlmAgentProcessor(prisma, config, systemClock);
  const knowledgeIngestion = new KnowledgeIngestionProcessor(prisma, config, systemClock);
  const weeklySummaryAi = new WeeklySummaryAiProcessor(prisma, config, systemClock);
  const studentPulseAi = new StudentPulseAiProcessor(prisma, config, systemClock);
  const studentReportAi = new StudentReportAiProcessor(prisma, config, systemClock);
  const registrationInbound = new RegistrationInboundProcessor(prisma, config, systemClock);
  const subscriptionRenewalInbound = new SubscriptionRenewalInboundProcessor(
    prisma,
    config,
    systemClock,
  );
  const inboundIntentRouter = new InboundIntentRouter(llmAgent, prisma, systemClock, config);
  const adminPanelNotifications = new AdminPanelNotificationProcessor(prisma);
  const meditationAudioRender = new MeditationAudioRenderProcessor(prisma, config);
  const voiceMessages = new VoiceMessageProcessor(prisma, config, systemClock);
  boss.on('error', (error) => logger.error({ errorCode: error.name }, 'pg-boss error'));
  await syncSystemEventRegistry(prisma);
  await syncDefaultRegistrationMessages(prisma);
  await boss.start();
  const whatsappAccessToken = config.WHATSAPP_ACCESS_TOKEN;
  const whatsappBusinessAccountId = config.WHATSAPP_BUSINESS_ACCOUNT_ID ?? config.WHATSAPP_WABA_ID;
  if (whatsappAccessToken && whatsappBusinessAccountId) {
    const synchronizeWhatsAppTemplates = async (): Promise<void> => {
      const result = await syncWhatsAppTemplates(createPrismaWhatsAppTemplateStore(prisma), {
        accessToken: whatsappAccessToken,
        businessAccountId: whatsappBusinessAccountId,
        graphVersion: config.WHATSAPP_GRAPH_VERSION,
      });
      const summary = {
        scanned: result.scanned,
        submitted: result.submitted,
        approved: result.approved,
        pending: result.pending,
        rejected: result.rejected,
        paused: result.paused,
        failed: result.failed,
      };
      if (result.failed) {
        logger.warn(
          {
            ...summary,
            failures: result.entries
              .filter((entry) => entry.action === 'failed')
              .map((entry) => ({ eventKey: entry.eventKey, error: entry.error })),
          },
          'WhatsApp template synchronization completed with failures',
        );
      } else {
        logger.info(summary, 'WhatsApp templates synchronized');
      }
    };
    await synchronizeWhatsAppTemplates().catch((error: unknown) =>
      logger.error(
        { errorCode: error instanceof Error ? error.name : 'UnknownError' },
        'WhatsApp template synchronization failed',
      ),
    );
    await boss.createQueue('whatsapp.template-sync');
    await boss.work('whatsapp.template-sync', async () => {
      await synchronizeWhatsAppTemplates();
    });
    await boss.schedule('whatsapp.template-sync', '*/15 * * * *', {});
  } else {
    logger.warn(
      'WhatsApp template synchronization is disabled because business account credentials are unavailable',
    );
  }
  const recoveredMeditationRenders = await meditationAudioRender.recoverInterrupted(
    systemClock.now(),
  );
  if (recoveredMeditationRenders)
    logger.warn(
      { recoveredMeditationRenders },
      'Interrupted meditation audio renders returned to the queue',
    );
  await registerSmokeQueue(boss, systemClock, logger, config.QUEUE_SMOKE_JOB);
  const dispatcher = new MessageDispatcher(
    prisma,
    systemClock,
    config,
    createChannelAdapters(config),
  );
  await configureResponsiveQueue(boss, 'message.send');
  await boss.work<{ intentId: string }>('message.send', RESPONSIVE_WORK_OPTIONS, async (jobs) => {
    for (const job of jobs) await dispatcher.dispatch(job.data.intentId);
  });
  await boss.createQueue('outbox.relay');
  let relayRunning = false;
  let relayRequested = false;
  const relayOutbox = async (): Promise<void> => {
    relayRequested = true;
    if (relayRunning) return;
    relayRunning = true;
    try {
      do {
        relayRequested = false;
        const events = await prisma.outboxEvent.findMany({
          where: {
            status: 'PENDING',
            availableAt: { lte: systemClock.now() },
            topic: {
              in: [
                'message.intents',
                'practice.inbound',
                'channel.inbound',
                'meeting.calendar-create',
                'meeting.calendar-update',
                'llm.agent-reply',
                'knowledge.document-parse',
                'llm.weekly-summary',
                'llm.student-report',
                'admin.notifications',
                'meditation.audio-render',
                'media.voice-inbound',
              ],
            },
          },
          take: 100,
          orderBy: { createdAt: 'asc' },
        });
        for (const event of events) {
          const gatedFlag: Record<string, string> = {
            'knowledge.document-parse': 'knowledge.ingestion.enabled',
            'llm.weekly-summary': 'llm.weekly-summary.enabled',
            'llm.student-report': 'llm.student-report.enabled',
          };
          const requiredFlag = gatedFlag[event.topic];
          if (requiredFlag) {
            const flag = await prisma.featureFlagConfig.findUnique({
              where: { key: requiredFlag },
            });
            if (!flag?.enabled || flag.rolloutPercentage <= 0) continue;
          }
          const payload = event.payload as {
            intentId?: string;
            inboxEventId?: string;
            seriesId?: string;
            meetingId?: string;
            retryOperationId?: string;
            versionId?: string;
            outboxEventId?: string;
            renderId?: string;
            reportId?: string;
            operationId?: string;
          };
          let queueName: string;
          let data: Record<string, string | undefined>;
          switch (event.topic) {
            case 'message.intents':
              queueName = 'message.send';
              data = { intentId: payload.intentId };
              break;
            case 'practice.inbound':
              queueName = 'practice.response';
              data = { inboxEventId: payload.inboxEventId };
              break;
            case 'meeting.calendar-create':
              queueName = 'meeting.calendar-create';
              data = { seriesId: payload.seriesId };
              break;
            case 'meeting.calendar-update':
              queueName = 'meeting.calendar-update';
              data = { seriesId: payload.seriesId, meetingId: payload.meetingId };
              break;
            case 'knowledge.document-parse':
              queueName = 'knowledge.document-parse';
              data = { versionId: payload.versionId };
              break;
            case 'llm.weekly-summary':
              queueName = 'llm.weekly-summary';
              data = { meetingId: payload.meetingId };
              break;
            case 'llm.student-report':
              queueName = 'llm.student-report';
              data = { reportId: payload.reportId, operationId: payload.operationId };
              break;
            case 'admin.notifications':
              queueName = 'admin.notification';
              data = { outboxEventId: event.id };
              break;
            case 'meditation.audio-render':
              queueName = 'meditation.audio-render';
              data = { renderId: payload.renderId };
              break;
            case 'channel.inbound':
              queueName = 'channel.inbound';
              data = { inboxEventId: payload.inboxEventId };
              break;
            case 'media.voice-inbound':
              queueName = 'media.voice-inbound';
              data = { inboxEventId: payload.inboxEventId };
              break;
            default:
              queueName = 'llm.agent-reply';
              data = {
                inboxEventId: payload.inboxEventId,
                retryOperationId: payload.retryOperationId,
              };
              break;
          }
          if (!Object.values(data)[0]) continue;
          const jobId = await boss.send(queueName, data, { id: event.id });
          if (jobId)
            await prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                attempts: { increment: 1 },
              },
            });
        }
      } while (relayRequested);
    } finally {
      relayRunning = false;
    }
  };
  await boss.work('outbox.relay', async () => {
    await relayOutbox();
  });
  await boss.schedule('outbox.relay', '* * * * *', {});
  const outboxPoller = setInterval(() => {
    void relayOutbox().catch((error: unknown) =>
      logger.error(
        { errorCode: error instanceof Error ? error.name : 'UnknownError' },
        'Outbox polling failed',
      ),
    );
  }, OUTBOX_POLL_INTERVAL_MS);
  await boss.createQueue('meeting.calendar-create');
  await boss.work<{ seriesId?: string }>('meeting.calendar-create', async (jobs) => {
    for (const job of jobs)
      if (job.data.seriesId) await calendarWorker.createSeries(job.data.seriesId);
  });
  await boss.createQueue('meeting.calendar-update');
  await boss.work<{ seriesId?: string; meetingId?: string }>(
    'meeting.calendar-update',
    async (jobs) => {
      for (const job of jobs) {
        if (job.data.seriesId) await calendarWorker.updateSeries(job.data.seriesId);
        else if (job.data.meetingId) await calendarWorker.updateMeeting(job.data.meetingId);
      }
    },
  );
  await boss.createQueue('subscription.lifecycle');
  await boss.work('subscription.lifecycle', async () => {
    const renewalReminders = await processSubscriptionRenewalReminders(prisma, systemClock, config);
    if (renewalReminders > 0)
      logger.info({ renewalReminders }, 'Subscription renewal reminders queued');
    await reconcileSubscriptions(prisma, systemClock);
  });
  await boss.schedule('subscription.lifecycle', '0 * * * *', {});
  await boss.createQueue('practice.lifecycle');
  await boss.work('practice.lifecycle', async () => {
    await processPracticeLifecycle(prisma, systemClock, config);
  });
  await boss.schedule('practice.lifecycle', '* * * * *', {});
  await configureResponsiveQueue(boss, 'practice.response');
  await boss.work<{ inboxEventId: string }>(
    'practice.response',
    RESPONSIVE_WORK_OPTIONS,
    async (jobs) => {
      for (const job of jobs)
        await processPracticeResponse(prisma, systemClock, config, job.data.inboxEventId);
      await relayOutbox();
    },
  );
  await boss.createQueue('practice.response-timeout');
  await boss.work('practice.response-timeout', async () => {
    const expiredPracticeResponses = await expireStalePracticeResponses(prisma, systemClock);
    if (expiredPracticeResponses > 0)
      logger.info({ expiredPracticeResponses }, 'Stale practice responses marked as missed');
  });
  await boss.schedule('practice.response-timeout', '*/15 * * * *', {});
  await boss.createQueue('llm.agent-reply');
  await configureResponsiveQueue(boss, 'channel.inbound');
  await configureResponsiveQueue(boss, 'media.voice-inbound');
  await boss.work<{ inboxEventId: string }>(
    'media.voice-inbound',
    RESPONSIVE_WORK_OPTIONS,
    async (jobs) => {
      for (const job of jobs)
        if (job.data.inboxEventId) await voiceMessages.process(job.data.inboxEventId);
      await relayOutbox();
    },
  );
  await boss.work<{ inboxEventId: string }>(
    'channel.inbound',
    RESPONSIVE_WORK_OPTIONS,
    async (jobs) => {
      for (const job of jobs) {
        if (!job.data.inboxEventId) continue;
        const registrationResult = await registrationInbound.process(job.data.inboxEventId);
        if (registrationResult === 'processed') continue;
        const renewalResult = await subscriptionRenewalInbound.process(job.data.inboxEventId);
        if (renewalResult === 'unhandled') await inboundIntentRouter.process(job.data.inboxEventId);
      }
      await relayOutbox();
    },
  );
  await boss.work<{ inboxEventId: string; retryOperationId?: string }>(
    'llm.agent-reply',
    async (jobs) => {
      for (const job of jobs) {
        if (job.data.inboxEventId)
          await llmAgent.process(job.data.inboxEventId, job.data.retryOperationId);
      }
    },
  );
  await boss.createQueue('knowledge.document-parse');
  await boss.work<{ versionId: string }>('knowledge.document-parse', async (jobs) => {
    for (const job of jobs)
      if (job.data.versionId) await knowledgeIngestion.process(job.data.versionId);
  });
  await boss.createQueue('llm.weekly-summary');
  await boss.work<{ meetingId: string }>('llm.weekly-summary', async (jobs) => {
    for (const job of jobs)
      if (job.data.meetingId) await weeklySummaryAi.process(job.data.meetingId);
  });
  await boss.createQueue('llm.student-pulse-daily');
  await boss.work('llm.student-pulse-daily', async () => {
    const result = await studentPulseAi.processAll();
    logger.info(result, 'Daily student pulse analysis completed');
  });
  await boss.schedule('llm.student-pulse-daily', '15 2 * * *', {});
  await boss.createQueue('llm.student-report');
  await boss.work<{ reportId: string; operationId?: string }>(
    'llm.student-report',
    async (jobs) => {
      for (const job of jobs)
        if (job.data.reportId)
          await studentReportAi.process(job.data.reportId, job.data.operationId);
    },
  );
  await boss.createQueue('admin.notification');
  await boss.work<{ outboxEventId: string }>('admin.notification', async (jobs) => {
    for (const job of jobs)
      if (job.data.outboxEventId) await adminPanelNotifications.process(job.data.outboxEventId);
  });
  await boss.createQueue('meditation.audio-render');
  await boss.work<{ renderId: string }>('meditation.audio-render', async (jobs) => {
    for (const job of jobs)
      if (job.data.renderId) await meditationAudioRender.process(job.data.renderId);
  });
  await boss.createQueue('meeting.reminder-24h');
  await boss.work('meeting.reminder-24h', async () => {
    await processMeetingReminder(
      prisma,
      systemClock,
      config,
      24 * 60 * 60_000,
      'MEETING_REMINDER_24H',
    );
  });
  await boss.schedule('meeting.reminder-24h', '* * * * *', {});
  await boss.createQueue('meeting.reminder-1h');
  await boss.work('meeting.reminder-1h', async () => {
    await processMeetingReminder(prisma, systemClock, config, 60 * 60_000, 'MEETING_REMINDER_1H');
  });
  await boss.schedule('meeting.reminder-1h', '* * * * *', {});
  await boss.createQueue('meeting.summary-3h');
  await boss.work('meeting.summary-3h', async () => {
    await processMeetingSummaries(prisma, systemClock);
  });
  await boss.schedule('meeting.summary-3h', '* * * * *', {});
  await boss.createQueue('calendar.incremental-sync');
  await boss.work('calendar.incremental-sync', async () => {
    await calendarWorker.incrementalSync(false);
  });
  await boss.schedule('calendar.incremental-sync', '*/5 * * * *', {});
  await boss.createQueue('calendar.reconcile');
  await boss.work('calendar.reconcile', async () => {
    await calendarWorker.incrementalSync(true);
  });
  await boss.schedule('calendar.reconcile', '0 * * * *', {});
  logger.info({ environment: config.NODE_ENV }, 'Worker started');

  const shutdown = async () => {
    clearInterval(outboxPoller);
    await boss.stop({ graceful: true, timeout: 30_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      service: 'worker',
      errorCode: error instanceof Error ? error.name : 'UnknownError',
      message: 'Worker startup failed',
    })}\n`,
  );
  process.exit(1);
});
