import { verify } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';

import { AdminAuthService } from './admin-auth.service.js';

describe('AdminAuthService password hashing', () => {
  it('uses a verifiable Argon2id password hash', async () => {
    const hash = await AdminAuthService.hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
