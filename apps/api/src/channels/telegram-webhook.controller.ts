import {
  Controller,
  Headers,
  Inject,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyTelegramWebhookSecret, type ApplicationConfig } from '@meditation/core';
import type { FastifyRequest } from 'fastify';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { TelegramWebhookService } from './telegram-webhook.service.js';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    private readonly webhook: TelegramWebhookService,
  ) {}
  @Post()
  receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
  ) {
    if (
      !this.config.TELEGRAM_WEBHOOK_SECRET ||
      !request.rawBody ||
      !verifyTelegramWebhookSecret(secret, this.config.TELEGRAM_WEBHOOK_SECRET)
    )
      throw new UnauthorizedException('Invalid webhook secret.');
    return this.webhook.accept(request.body, request.rawBody);
  }
}
