import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(32).optional(),
);

const optionalConfigValue = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

export const applicationConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    ADMIN_ORIGIN: z.string().url().optional(),
    DATABASE_URL: z.string().url(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DEFAULT_LOCALE: z.string().default('tr-TR'),
    ALLOWED_RECIPIENTS: z.string().default(''),
    ENABLE_EXPERIMENTAL_FEATURES: booleanFromEnvironment,
    QUEUE_SMOKE_JOB: booleanFromEnvironment,
    DATA_ENCRYPTION_KEYS_JSON: optionalSecret,
    ACTIVE_DATA_KEY_ID: optionalConfigValue,
    LOOKUP_HMAC_KEY: optionalSecret,
    ADMIN_SESSION_HMAC_KEY: optionalSecret,
    AWS_SES_REGION: z.string().default('eu-central-1'),
    ADMIN_EMAIL_FROM: z.string().email().optional(),
    ADMIN_ALERT_EMAIL: z.string().email().optional(),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV !== 'staging' && config.NODE_ENV !== 'production') return;

    for (const key of [
      'DATA_ENCRYPTION_KEYS_JSON',
      'ACTIVE_DATA_KEY_ID',
      'LOOKUP_HMAC_KEY',
      'ADMIN_SESSION_HMAC_KEY',
      'ADMIN_ORIGIN',
      'ADMIN_EMAIL_FROM',
      'ADMIN_ALERT_EMAIL',
    ] as const) {
      if (!config[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in ${config.NODE_ENV}`,
        });
      }
    }
  });

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export function resolveMonorepoEnvPath(moduleUrl: string = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), '../../..', '.env');
}

export function loadApplicationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApplicationConfig {
  const rootEnvPath = resolveMonorepoEnvPath();
  if (environment === process.env && existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }

  return applicationConfigSchema.parse(environment);
}
