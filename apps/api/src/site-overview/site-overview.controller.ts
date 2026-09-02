import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';

import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { SiteOverviewService } from './site-overview.service.js';
import { isSiteOverviewRange, type SiteOverviewRange } from './site-overview.helpers.js';

@Controller('v1/admin/site-overview')
@UseGuards(AdminSessionGuard)
export class SiteOverviewController {
  constructor(@Inject(SiteOverviewService) private readonly overviewService: SiteOverviewService) {}

  @Get()
  overview(@Query('range') range?: string) {
    const value = range ?? '30d';
    if (!isSiteOverviewRange(value)) {
      throw new BadRequestException('Geçersiz site analitiği tarih aralığı.');
    }
    return this.overviewService.overview(value as SiteOverviewRange);
  }
}
