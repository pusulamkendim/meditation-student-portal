import { existsSync } from 'node:fs';

import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const applicationConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DEFAULT_LOCALE: z.string().default('tr-TR'),
  CLOCK_MODE: z.enum(['system', 'fake']).default('system'),
  ALLOWED_RECIPIENTS: z.string().default(''),
  ENABLE_EXPERIMENTAL_FEATURES: booleanFromEnvironment,
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export function loadApplicationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApplicationConfig {
  if (environment === process.env && existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const config = applicationConfigSchema.parse(environment);
  if (config.CLOCK_MODE === 'fake' && config.NODE_ENV !== 'test') {
    throw new Error('CLOCK_MODE=fake is allowed only in the test environment.');
  }
  return config;
}
