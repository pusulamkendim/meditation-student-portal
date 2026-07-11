import { NestFactory } from '@nestjs/core';
import { z } from 'zod';

import { AppModule } from '../app.module.js';
import { AdminAuthService } from '../auth/admin-auth.service.js';

const bootstrapInputSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
});

async function bootstrapAdmin(): Promise<void> {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('ADMIN_BOOTSTRAP_ENABLED=true is required for the one-time bootstrap command.');
  }
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password)
    throw new Error('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required.');
  const input = bootstrapInputSchema.safeParse({ email, password });
  if (!input.success) {
    const fields = input.error.issues.map((issue) => issue.path.join('.') || 'input').join(', ');
    throw new Error(
      `Invalid admin bootstrap fields: ${fields}. Use plain shell quotes and a 12+ character password.`,
    );
  }

  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await application
      .get(AdminAuthService)
      .bootstrap(input.data.email, input.data.password, crypto.randomUUID());
    process.stdout.write(
      `${JSON.stringify({
        adminId: result.adminId,
        totpSecret: result.totpSecret,
        recoveryCodes: result.recoveryCodes,
      })}\n`,
    );
  } finally {
    await application.close();
  }
}

void bootstrapAdmin().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Admin bootstrap failed for an unknown reason.'}\n`,
  );
  process.exitCode = 1;
});
