import type { Clock } from '@meditation/core';

export const smokeQueueName = 'system.smoke';

export interface QueueJob<T> {
  id: string;
  data: T;
}

export interface QueueRuntime {
  createQueue(name: string): Promise<void>;
  work<T>(name: string, handler: (jobs: QueueJob<T>[]) => Promise<void>): Promise<string>;
  send(name: string, data: object): Promise<string | null>;
}

export interface WorkerLogger {
  info(attributes: Record<string, unknown>, message: string): void;
}

export async function registerSmokeQueue(
  queue: QueueRuntime,
  clock: Clock,
  logger: WorkerLogger,
  enqueueSmokeJob: boolean,
): Promise<void> {
  await queue.createQueue(smokeQueueName);
  await queue.work<{ requestedAt: string }>(smokeQueueName, async (jobs) => {
    for (const job of jobs) {
      logger.info({ jobId: job.id, requestedAt: job.data.requestedAt }, 'Smoke job processed');
    }
  });
  if (enqueueSmokeJob) {
    await queue.send(smokeQueueName, { requestedAt: clock.now().toISOString() });
  }
}
