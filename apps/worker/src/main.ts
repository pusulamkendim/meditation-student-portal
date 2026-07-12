import { loadApplicationConfig, SystemClock } from '@meditation/core';
import { PrismaClient } from '@meditation/database';
import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { registerSmokeQueue } from './queue-runtime.js';
import { createChannelAdapters, MessageDispatcher } from './message-dispatcher.js';
import { reconcileSubscriptions } from './subscription-lifecycle.js';
import { processPracticeLifecycle } from './practice-lifecycle.js';
import { processPracticeResponse } from './practice-response.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const logger = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
  const boss = new PgBoss(config.DATABASE_URL);
  const prisma = new PrismaClient();
  boss.on('error', (error) => logger.error({ errorCode: error.name }, 'pg-boss error'));
  await boss.start();
  await registerSmokeQueue(boss, new SystemClock(), logger, config.QUEUE_SMOKE_JOB);
  const dispatcher = new MessageDispatcher(
    prisma,
    new SystemClock(),
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
      where: { status: 'PENDING', topic: { in: ['message.intents', 'practice.inbound'] } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const event of events) {
      const payload = event.payload as { intentId?: string; inboxEventId?: string };
      const queueName = event.topic === 'message.intents' ? 'message.send' : 'practice.response';
      const data =
        event.topic === 'message.intents'
          ? { intentId: payload.intentId }
          : { inboxEventId: payload.inboxEventId };
      if (!Object.values(data)[0]) continue;
      const jobId = await boss.send(queueName, data, { id: `${event.topic}-${event.aggregateId}` });
      if (jobId)
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), attempts: { increment: 1 } },
        });
    }
  });
  await boss.schedule('outbox.relay', '* * * * *', {});
  await boss.createQueue('subscription.lifecycle');
  await boss.work('subscription.lifecycle', async () => {
    await reconcileSubscriptions(prisma, new SystemClock());
  });
  await boss.schedule('subscription.lifecycle', '0 * * * *', {});
  await boss.createQueue('practice.lifecycle');
  await boss.work('practice.lifecycle', async () => {
    await processPracticeLifecycle(prisma, new SystemClock(), config);
  });
  await boss.schedule('practice.lifecycle', '* * * * *', {});
  await boss.createQueue('practice.response');
  await boss.work<{ inboxEventId: string }>('practice.response', async (jobs) => {
    for (const job of jobs)
      await processPracticeResponse(prisma, new SystemClock(), config, job.data.inboxEventId);
  });
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
