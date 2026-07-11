import { Module } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  loadApplicationConfig,
  LookupHmac,
  SystemClock,
} from '@meditation/core';

import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { FIELD_ENCRYPTION, SESSION_HMAC } from './auth.constants.js';

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
    { provide: CLOCK_TOKEN, useClass: SystemClock },
    {
      provide: FIELD_ENCRYPTION,
      useFactory: () => {
        const config = loadApplicationConfig();
        if (!config.ACTIVE_DATA_KEY_ID)
          throw new Error('ACTIVE_DATA_KEY_ID is required for admin auth.');
        return new FieldEncryption(
          parseEncryptionKeys(config.DATA_ENCRYPTION_KEYS_JSON),
          config.ACTIVE_DATA_KEY_ID,
        );
      },
    },
    {
      provide: SESSION_HMAC,
      useFactory: () => {
        const key = loadApplicationConfig().ADMIN_SESSION_HMAC_KEY;
        if (!key) throw new Error('ADMIN_SESSION_HMAC_KEY is required for admin auth.');
        return new LookupHmac(Buffer.from(key, 'base64'));
      },
    },
  ],
  exports: [AdminAuthService, AdminSessionGuard],
})
export class AuthModule {}
