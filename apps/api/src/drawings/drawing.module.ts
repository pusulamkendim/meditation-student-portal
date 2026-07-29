import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { MessageCatalogModule } from '../message-catalog/message-catalog.module.js';
import { DrawingController, PublicDrawingController } from './drawing.controller.js';
import { createDrawingStorage, DRAWING_STORAGE, DrawingService } from './drawing.service.js';

@Module({
  imports: [AuthModule, MessageCatalogModule],
  controllers: [DrawingController, PublicDrawingController],
  providers: [
    DrawingService,
    {
      provide: DRAWING_STORAGE,
      inject: [APPLICATION_CONFIG],
      useFactory: createDrawingStorage,
    },
  ],
})
export class DrawingModule {}
