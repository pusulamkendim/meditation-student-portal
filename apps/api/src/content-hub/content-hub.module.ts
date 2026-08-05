import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { ContentHubController } from './content-hub.controller.js';
import { ContentHubService } from './content-hub.service.js';

@Module({
  controllers: [ContentHubController],
  providers: [ContentHubService, { provide: CLOCK_TOKEN, useClass: SystemClock }],
})
export class ContentHubModule {}
