import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { AuthModule } from '../auth/auth.module.js';
import { SiteOverviewController } from './site-overview.controller.js';
import { SiteOverviewService } from './site-overview.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SiteOverviewController],
  providers: [SiteOverviewService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
})
export class SiteOverviewModule {}
