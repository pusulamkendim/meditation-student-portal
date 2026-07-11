import { Module } from '@nestjs/common';
import { loadApplicationConfig } from '@meditation/core';

import { ADMIN_EMAIL_ADAPTER } from './admin-email.adapter.js';
import { AdminNotificationService } from './admin-notification.service.js';
import { SesAdminEmailAdapter } from './ses-admin-email.adapter.js';

@Module({
  providers: [
    AdminNotificationService,
    {
      provide: ADMIN_EMAIL_ADAPTER,
      useFactory: () => {
        const config = loadApplicationConfig();
        if (!config.ADMIN_EMAIL_FROM || !config.ADMIN_ALERT_EMAIL) {
          throw new Error('ADMIN_EMAIL_FROM and ADMIN_ALERT_EMAIL are required.');
        }
        return new SesAdminEmailAdapter(
          config.ADMIN_EMAIL_FROM,
          config.ADMIN_ALERT_EMAIL,
          config.AWS_SES_REGION,
        );
      },
    },
  ],
  exports: [AdminNotificationService],
})
export class NotificationsModule {}
