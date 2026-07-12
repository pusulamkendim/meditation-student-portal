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
const encryptionKeysConfig = z.preprocess(
  (value) => {
    if (value === '' || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      for (const entry of Object.values(parsed)) {
        if (typeof entry !== 'string' || Buffer.from(entry, 'base64').length !== 32)
          throw new Error();
      }
      return value;
    } catch {
      return '__INVALID_ENCRYPTION_KEYS_JSON__';
    }
  },
  z
    .string()
    .refine(
      (value) => value !== '__INVALID_ENCRYPTION_KEYS_JSON__',
      'Must be a JSON object of base64-encoded 32-byte keys.',
    )
    .optional(),
);

export const applicationConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    ADMIN_ORIGIN: z.string().url().optional(),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DEFAULT_LOCALE: z.string().default('tr-TR'),
    ALLOWED_RECIPIENTS: z.string().default(''),
    ENABLE_EXPERIMENTAL_FEATURES: booleanFromEnvironment,
    QUEUE_SMOKE_JOB: booleanFromEnvironment,
    DATA_ENCRYPTION_KEYS_JSON: encryptionKeysConfig,
    ACTIVE_DATA_KEY_ID: optionalConfigValue,
    LOOKUP_HMAC_KEY: optionalSecret,
    ADMIN_SESSION_HMAC_KEY: optionalSecret,
    AWS_SES_REGION: z.string().default('eu-central-1'),
    ADMIN_EMAIL_FROM: z.string().email().optional(),
    ADMIN_ALERT_EMAIL: z.string().email().optional(),
    WHATSAPP_VERIFY_TOKEN: optionalConfigValue,
    WHATSAPP_APP_SECRET: optionalSecret,
    WHATSAPP_ACCESS_TOKEN: optionalConfigValue,
    WHATSAPP_PHONE_NUMBER_ID: optionalConfigValue,
    TELEGRAM_BOT_TOKEN: optionalConfigValue,
    TELEGRAM_WEBHOOK_SECRET: optionalSecret,
    TELEGRAM_ACCOUNT_ID: z.string().default('default'),
    WEBHOOK_BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(1048576).default(262144),
    PAYMENT_IBAN: optionalConfigValue,
    PAYMENT_ACCOUNT_HOLDER: optionalConfigValue,
    INTERNAL_COMMAND_SECRET: optionalSecret,
    GOOGLE_OAUTH_CLIENT_ID: optionalConfigValue,
    GOOGLE_OAUTH_CLIENT_SECRET: optionalConfigValue,
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
    GOOGLE_CALENDAR_SCOPES: z.string().default('https://www.googleapis.com/auth/calendar'),
    GOOGLE_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
    GEMINI_API_KEY: optionalConfigValue,
    R2_ENDPOINT: z.string().url().optional(),
    R2_ACCESS_KEY_ID: optionalConfigValue,
    R2_SECRET_ACCESS_KEY: optionalConfigValue,
    R2_QUARANTINE_BUCKET: z.string().default('meditation-quarantine'),
    R2_PRIVATE_BUCKET: z.string().default('meditation-private'),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
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
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_WEBHOOK_SECRET',
      'PAYMENT_IBAN',
      'PAYMENT_ACCOUNT_HOLDER',
      'INTERNAL_COMMAND_SECRET',
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_REDIRECT_URI',
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
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
