import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { AuthModule } from '../auth/auth.module.js';
import { MessageCatalogModule } from '../message-catalog/message-catalog.module.js';
import { StudentReportController } from './student-report.controller.js';
import { StudentReportService } from './student-report.service.js';

@Module({
  imports: [AuthModule, MessageCatalogModule],
  controllers: [StudentReportController],
  providers: [StudentReportService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
})
export class StudentReportModule {}
