import { loadApplicationConfig, SystemClock } from '@meditation/core';
import { PrismaClient } from '@meditation/database';
import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { registerSmokeQueue } from './queue-runtime.js';
import { createChannelAdapters, MessageDispatcher } from './message-dispatcher.js';
import { reconcileSubscriptions } from './subscription-lifecycle.js';

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
      where: { status: 'PENDING', topic: 'message.intents' },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const event of events) {
      const payload = event.payload as { intentId?: string };
      if (!payload.intentId) continue;
      const jobId = await boss.send(
        'message.send',
        { intentId: payload.intentId },
        { id: `intent-${payload.intentId}` },
      );
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
