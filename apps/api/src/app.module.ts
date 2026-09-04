import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { ApplicationConfigModule } from './config/application-config.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { MessageCatalogModule } from './message-catalog/message-catalog.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { RegistrationModule } from './registration/registration.module.js';
import { PracticeModule } from './practice/practice.module.js';
import { MeetingsModule } from './meetings/meetings.module.js';
import { LlmModule } from './llm/llm.module.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { DrawingModule } from './drawings/drawing.module.js';
import { ReadingModule } from './readings/reading.module.js';
import { MeditationModule } from './meditations/meditation.module.js';
import { ContentHubModule } from './content-hub/content-hub.module.js';
import { StudentReportModule } from './student-reports/student-report.module.js';
import { PublicAnalyticsModule } from './public-analytics/public-analytics.module.js';
import { SiteOverviewModule } from './site-overview/site-overview.module.js';
import { CorporateInquiriesModule } from './corporate-inquiries/corporate-inquiries.module.js';

@Module({
  imports: [
    ApplicationConfigModule,
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    MessageCatalogModule,
    ChannelsModule,
    RegistrationModule,
    PracticeModule,
    MeetingsModule,
    LlmModule,
    KnowledgeModule,
    DrawingModule,
    ReadingModule,
    MeditationModule,
    ContentHubModule,
    StudentReportModule,
    PublicAnalyticsModule,
    SiteOverviewModule,
    CorporateInquiriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
