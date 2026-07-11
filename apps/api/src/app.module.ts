import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
