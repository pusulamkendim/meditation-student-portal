import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { AuthModule } from '../auth/auth.module.js';
import { MessageCatalogController } from './message-catalog.controller.js';
import { MessageCatalogService } from './message-catalog.service.js';
import { SystemMessageOrchestrator } from './system-message-orchestrator.js';

@Module({
  imports: [AuthModule],
  controllers: [MessageCatalogController],
  providers: [
    MessageCatalogService,
    SystemMessageOrchestrator,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
  ],
  exports: [MessageCatalogService, SystemMessageOrchestrator],
})
export class MessageCatalogModule {}
