import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  ALLOWED_RECIPIENTS: z.string().default(''),
  ENABLE_EXPERIMENTAL_FEATURES: booleanFromEnvironment,
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
