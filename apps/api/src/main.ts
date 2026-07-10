import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { loadApplicationConfig } from '@meditation/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), {
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
  Logger.log(`API is listening on port ${config.API_PORT}`, 'Bootstrap');
}

void bootstrap();
