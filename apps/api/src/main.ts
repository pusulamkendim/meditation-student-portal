import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import { loadApplicationConfig } from '@meditation/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: config.WEBHOOK_BODY_LIMIT_BYTES }),
    { bufferLogs: true, rawBody: true },
  );
  await app.register(cookie);
  app.enableCors({
    origin: config.ADMIN_ORIGIN ? [config.ADMIN_ORIGIN] : false,
    credentials: true,
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_request, reply) => {
      reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
      reply.header('x-content-type-options', 'nosniff');
      reply.header('x-frame-options', 'DENY');
      reply.header('referrer-policy', 'no-referrer');
    });
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
  Logger.log(`API is listening on port ${config.API_PORT}`, 'Bootstrap');
}

void bootstrap();
