import { loadApplicationConfig, SystemClock } from '@meditation/core';
import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { registerSmokeQueue } from './queue-runtime.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const logger = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
  const boss = new PgBoss(config.DATABASE_URL);
  boss.on('error', (error) => logger.error({ errorCode: error.name }, 'pg-boss error'));
  await boss.start();
  await registerSmokeQueue(boss, new SystemClock(), logger, config.QUEUE_SMOKE_JOB);
  logger.info({ environment: config.NODE_ENV }, 'Worker started');

  const shutdown = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
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
