import { Module } from '@nestjs/common';

import { PublicAnalyticsController } from './public-analytics.controller.js';
import { PublicAnalyticsService } from './public-analytics.service.js';

@Module({
  controllers: [PublicAnalyticsController],
  providers: [PublicAnalyticsService],
})
export class PublicAnalyticsModule {}
