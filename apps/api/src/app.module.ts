import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [{ provide: CLOCK_TOKEN, useClass: SystemClock }],
  exports: [CLOCK_TOKEN],
})
export class AppModule {}
