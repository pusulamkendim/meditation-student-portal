import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { AuthModule } from '../auth/auth.module.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { MessageCatalogModule } from '../message-catalog/message-catalog.module.js';
import { AdminReadingController, PublicReadingController } from './reading.controller.js';
import { createReadingStorage, READING_STORAGE, ReadingService } from './reading.service.js';

@Module({
  imports: [AuthModule, MessageCatalogModule],
  controllers: [AdminReadingController, PublicReadingController],
  providers: [
    ReadingService,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
    {
      provide: READING_STORAGE,
      inject: [APPLICATION_CONFIG],
      useFactory: createReadingStorage,
    },
  ],
})
export class ReadingModule {}
