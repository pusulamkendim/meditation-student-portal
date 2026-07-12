import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';
import { AuthModule } from '../auth/auth.module.js';
import { PracticeController } from './practice.controller.js';
import { PracticeService } from './practice.service.js';
@Module({
  imports: [AuthModule],
  controllers: [PracticeController],
  providers: [PracticeService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
  exports: [PracticeService],
})
export class PracticeModule {}
