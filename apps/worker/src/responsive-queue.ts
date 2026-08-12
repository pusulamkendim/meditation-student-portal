export const OUTBOX_POLL_INTERVAL_MS = 1_000;

export const RESPONSIVE_WORK_OPTIONS = {
  pollingIntervalSeconds: 0.5,
} as const;

interface QueueConfigurator {
  createQueue(name: string, options?: { notify?: boolean }): Promise<void>;
  updateQueue(name: string, options: { notify: boolean }): Promise<void>;
}

export async function configureResponsiveQueue(
  queue: QueueConfigurator,
  name: string,
): Promise<void> {
  await queue.createQueue(name, { notify: true });
  // createQueue is idempotent but does not update existing queue options.
  await queue.updateQueue(name, { notify: true });
}
