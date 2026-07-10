import { loadApplicationConfig } from '@meditation/core';

const config = loadApplicationConfig();

process.stdout.write(
  JSON.stringify({
    level: 'info',
    service: 'worker',
    message: 'Worker started. Queue adapters are introduced in M1.',
    environment: config.NODE_ENV,
  }) + '\n',
);

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
