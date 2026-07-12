import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';
import { AuthModule } from '../auth/auth.module.js';

import { MeetingController } from './meeting.controller.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingService } from './meeting.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    GoogleCalendarService,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
  ],
  exports: [MeetingService, GoogleCalendarService],
})
export class MeetingsModule {}
