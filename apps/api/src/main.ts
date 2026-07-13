import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadApplicationConfig } from '@meditation/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = loadApplicationConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 100 * 1024 * 1024 }),
    { bufferLogs: true, rawBody: true },
  );
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 20, parts: 40 },
  });
  app.enableCors({
    origin: config.ADMIN_ORIGIN ? [config.ADMIN_ORIGIN] : false,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/webhooks/')) {
        const length = Number(request.headers['content-length'] ?? 0);
        if (length > config.WEBHOOK_BODY_LIMIT_BYTES) {
          return reply.code(413).send({ message: 'Webhook payload is too large.' });
        }
      }
    })
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
