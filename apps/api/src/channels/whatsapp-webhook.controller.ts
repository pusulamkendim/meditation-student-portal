import {
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApplicationConfig } from '@meditation/core';
import { verifyWhatsAppSignature } from '@meditation/core';
import type { FastifyRequest } from 'fastify';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { WhatsAppWebhookService } from './whatsapp-webhook.service.js';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    private readonly webhook: WhatsAppWebhookService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (
      mode !== 'subscribe' ||
      !this.config.WHATSAPP_VERIFY_TOKEN ||
      token !== this.config.WHATSAPP_VERIFY_TOKEN ||
      !challenge
    ) {
      throw new UnauthorizedException('Webhook verification failed.');
    }
    return challenge;
  }

  @Post()
  receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ status: 'accepted'; accepted: number; duplicate: number }> {
    const secret = this.config.WHATSAPP_APP_SECRET;
    if (
      !secret ||
      !request.rawBody ||
      !verifyWhatsAppSignature(request.rawBody, signature, secret)
    ) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
    return this.webhook.accept(request.body, request.rawBody).then((result) => ({
      status: 'accepted' as const,
      ...result,
    }));
  }
}
