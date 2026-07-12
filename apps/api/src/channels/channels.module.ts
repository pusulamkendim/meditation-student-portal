import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';
import { AuthModule } from '../auth/auth.module.js';
import { ChannelLinkController } from './channel-link.controller.js';
import { ChannelLinkService } from './channel-link.service.js';
import { ConversationsController, OperationsController } from './conversations.controller.js';

import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsAppWebhookService } from './whatsapp-webhook.service.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramWebhookService } from './telegram-webhook.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    WhatsAppWebhookController,
    TelegramWebhookController,
    ChannelLinkController,
    ConversationsController,
    OperationsController,
  ],
  providers: [
    WhatsAppWebhookService,
    TelegramWebhookService,
    ChannelLinkService,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
  ],
})
export class ChannelsModule {}
