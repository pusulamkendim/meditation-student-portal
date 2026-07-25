import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { DrawingController } from './drawing.controller.js';
import { createDrawingStorage, DRAWING_STORAGE, DrawingService } from './drawing.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DrawingController],
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
