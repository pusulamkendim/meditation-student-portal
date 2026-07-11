import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { ADMIN_EMAIL_ADAPTER } from './admin-email.adapter.js';
import { AdminNotificationService } from './admin-notification.service.js';
import { SesAdminEmailAdapter } from './ses-admin-email.adapter.js';

@Module({
  providers: [
    AdminNotificationService,
    SesAdminEmailAdapter,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
    {
      provide: ADMIN_EMAIL_ADAPTER,
      useExisting: SesAdminEmailAdapter,
    },
  ],
  exports: [AdminNotificationService],
})
export class NotificationsModule {}
