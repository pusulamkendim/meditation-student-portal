import { loadApplicationConfig, SystemClock } from '@meditation/core';
import { PrismaClient } from '@meditation/database';
import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { registerSmokeQueue } from './queue-runtime.js';
import { createChannelAdapters, MessageDispatcher } from './message-dispatcher.js';
import { reconcileSubscriptions } from './subscription-lifecycle.js';
import { processPracticeLifecycle } from './practice-lifecycle.js';
import { processPracticeResponse } from './practice-response.js';
import { processMeetingReminder, processMeetingSummaries } from './meeting-lifecycle.js';
import { MeetingCalendarWorker } from './meeting-calendar.js';
import { LlmAgentProcessor } from './llm-agent.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const logger = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
  const boss = new PgBoss(config.DATABASE_URL);
  const prisma = new PrismaClient();
  const systemClock = new SystemClock();
  const calendarWorker = new MeetingCalendarWorker(prisma, config, systemClock);
  const llmAgent = new LlmAgentProcessor(prisma, config, systemClock);
  boss.on('error', (error) => logger.error({ errorCode: error.name }, 'pg-boss error'));
  await boss.start();
  await registerSmokeQueue(boss, systemClock, logger, config.QUEUE_SMOKE_JOB);
  const dispatcher = new MessageDispatcher(
    prisma,
    systemClock,
    config,
    createChannelAdapters(config),
  );
  await boss.createQueue('message.send');
  await boss.work<{ intentId: string }>('message.send', async (jobs) => {
    for (const job of jobs) await dispatcher.dispatch(job.data.intentId);
  });
  await boss.createQueue('outbox.relay');
  await boss.work('outbox.relay', async () => {
    const events = await prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        topic: {
          in: [
            'message.intents',
            'practice.inbound',
            'channel.inbound',
            'meeting.calendar-create',
            'meeting.calendar-update',
            'llm.agent-reply',
          ],
        },
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const event of events) {
      const payload = event.payload as {
        intentId?: string;
        inboxEventId?: string;
        seriesId?: string;
        meetingId?: string;
        retryOperationId?: string;
      };
      const queueName =
        event.topic === 'message.intents'
          ? 'message.send'
          : event.topic === 'practice.inbound'
            ? 'practice.response'
            : event.topic === 'meeting.calendar-create'
              ? 'meeting.calendar-create'
              : event.topic === 'meeting.calendar-update'
                ? 'meeting.calendar-update'
                : 'llm.agent-reply';
      const data =
        event.topic === 'message.intents'
          ? { intentId: payload.intentId }
          : event.topic === 'practice.inbound'
            ? { inboxEventId: payload.inboxEventId }
            : event.topic === 'meeting.calendar-update'
              ? { seriesId: payload.seriesId, meetingId: payload.meetingId }
              : { inboxEventId: payload.inboxEventId, retryOperationId: payload.retryOperationId };
      if (!Object.values(data)[0]) continue;
      const jobId = await boss.send(queueName, data, { id: `${event.topic}-${event.id}` });
      if (jobId)
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), attempts: { increment: 1 } },
        });
    }
  });
  await boss.schedule('outbox.relay', '* * * * *', {});
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
    await reconcileSubscriptions(prisma, systemClock);
  });
  await boss.schedule('subscription.lifecycle', '0 * * * *', {});
  await boss.createQueue('practice.lifecycle');
  await boss.work('practice.lifecycle', async () => {
    await processPracticeLifecycle(prisma, systemClock, config);
  });
  await boss.schedule('practice.lifecycle', '* * * * *', {});
  await boss.createQueue('practice.response');
  await boss.work<{ inboxEventId: string }>('practice.response', async (jobs) => {
    for (const job of jobs)
      await processPracticeResponse(prisma, systemClock, config, job.data.inboxEventId);
  });
  await boss.createQueue('llm.agent-reply');
  await boss.work<{ inboxEventId: string; retryOperationId?: string }>(
    'llm.agent-reply',
    async (jobs) => {
      for (const job of jobs) {
        if (job.data.inboxEventId)
          await llmAgent.process(job.data.inboxEventId, job.data.retryOperationId);
      }
    },
  );
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
