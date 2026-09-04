import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import {
  AdminCorporateInquiriesController,
  PublicCorporateInquiriesController,
} from './corporate-inquiries.controller.js';
import { CorporateInquiriesService } from './corporate-inquiries.service.js';

@Module({
  controllers: [PublicCorporateInquiriesController, AdminCorporateInquiriesController],
  providers: [CorporateInquiriesService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
})
export class CorporateInquiriesModule {}
