import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { ApplicationConfigModule } from './config/application-config.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { MessageCatalogModule } from './message-catalog/message-catalog.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { RegistrationModule } from './registration/registration.module.js';

@Module({
  imports: [
    ApplicationConfigModule,
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    MessageCatalogModule,
    ChannelsModule,
    RegistrationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
