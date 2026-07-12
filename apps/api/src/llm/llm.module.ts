import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';
import { AuthModule } from '../auth/auth.module.js';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LlmController],
  providers: [LlmService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
})
export class LlmModule {}
