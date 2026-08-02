import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';

import { AuthModule } from '../auth/auth.module.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { MeditationController } from './meditation.controller.js';
import {
  createMeditationStorage,
  MEDITATION_STORAGE,
  MeditationService,
} from './meditation.service.js';
import { PracticePlayerController } from './practice-player.controller.js';
import { PublicMeditationController } from './public-meditation.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [MeditationController, PracticePlayerController, PublicMeditationController],
  providers: [
    MeditationService,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
    {
      provide: MEDITATION_STORAGE,
      inject: [APPLICATION_CONFIG],
      useFactory: createMeditationStorage,
    },
  ],
})
export class MeditationModule {}
