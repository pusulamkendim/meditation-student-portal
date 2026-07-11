import { Module } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  LookupHmac,
  SystemClock,
  type ApplicationConfig,
} from '@meditation/core';

import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminCsrfGuard } from './admin-csrf.guard.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { FIELD_ENCRYPTION, SESSION_HMAC } from './auth.constants.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';

function parseEncryptionKeys(serialized: string | undefined): Map<string, Buffer> {
  if (!serialized) throw new Error('DATA_ENCRYPTION_KEYS_JSON is required for admin auth.');
  const value = JSON.parse(serialized) as Record<string, string>;
  return new Map(Object.entries(value).map(([keyId, key]) => [keyId, Buffer.from(key, 'base64')]));
}

@Module({
  controllers: [AdminAuthController, AdminDashboardController],
  providers: [
    AdminAuthService,
    AdminSessionGuard,
    AdminCsrfGuard,
    { provide: CLOCK_TOKEN, useClass: SystemClock },
    {
      provide: FIELD_ENCRYPTION,
      useFactory: (config: ApplicationConfig) => {
        if (!config.ACTIVE_DATA_KEY_ID)
          throw new Error('ACTIVE_DATA_KEY_ID is required for admin auth.');
        return new FieldEncryption(
          parseEncryptionKeys(config.DATA_ENCRYPTION_KEYS_JSON),
          config.ACTIVE_DATA_KEY_ID,
        );
      },
      inject: [APPLICATION_CONFIG],
    },
    {
      provide: SESSION_HMAC,
      useFactory: (config: ApplicationConfig) => {
        const key = config.ADMIN_SESSION_HMAC_KEY;
        if (!key) throw new Error('ADMIN_SESSION_HMAC_KEY is required for admin auth.');
        return new LookupHmac(Buffer.from(key, 'base64'));
      },
      inject: [APPLICATION_CONFIG],
    },
  ],
  exports: [AdminAuthService, AdminSessionGuard, AdminCsrfGuard],
})
export class AuthModule {}
