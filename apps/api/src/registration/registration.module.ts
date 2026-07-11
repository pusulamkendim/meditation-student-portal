import { Module } from '@nestjs/common';
import { CLOCK_TOKEN, SystemClock } from '@meditation/core';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentService } from './payment.service.js';
import { RegistrationController } from './registration.controller.js';
import { RegistrationService } from './registration.service.js';
import { InternalChannelGuard } from './internal-channel.guard.js';
@Module({
  imports: [AuthModule],
  controllers: [RegistrationController],
  providers: [
    RegistrationService,
    PaymentService,
    InternalChannelGuard,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
  ],
})
export class RegistrationModule {}
