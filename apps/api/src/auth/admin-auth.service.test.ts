import { LookupHmac } from '@meditation/core';
import { UnauthorizedException } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { AdminRole } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import { AdminAuthService } from './admin-auth.service.js';

describe('AdminAuthService password hashing', () => {
  it('uses a verifiable Argon2id password hash', async () => {
    const hash = await AdminAuthService.hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verify(hash, 'wrong password')).resolves.toBe(false);
  });
});

describe('AdminAuthService session renewal', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const sessionToken = 'stable-session-token';
  const hmac = new LookupHmac(Buffer.alloc(32, 9));

  function harness(absoluteExpiresAt = new Date('2026-07-31T11:00:00.000Z')) {
    const session = {
      id: '11111111-1111-4111-8111-111111111111',
      revokedAt: null,
      expiresAt: new Date('2026-07-24T11:30:00.000Z'),
      absoluteExpiresAt,
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
      adminUser: {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'admin@example.com',
        role: AdminRole.ADMIN,
        active: true,
      },
    };
    const prisma = {
      adminSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AdminAuthService(
      prisma as never,
      { now: () => now } as never,
      {} as never,
      hmac,
    );
    return { service, prisma };
  }

  it('renews an idle session inside the absolute lifetime without changing its identity', async () => {
    const { service, prisma } = harness();

    const renewed = await service.renew(sessionToken);

    expect(renewed).toMatchObject({
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken,
      csrfToken: hmac.digest(`admin-csrf:${sessionToken}`),
      expiresAt: new Date('2026-07-24T12:30:00.000Z'),
    });
    expect(prisma.adminSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          csrfTokenHash: hmac.digest(hmac.digest(`admin-csrf:${sessionToken}`)),
          lastSeenAt: now,
          expiresAt: new Date('2026-07-24T12:30:00.000Z'),
        }),
      }),
    );
  });

  it('returns the same CSRF token to concurrent browser tabs', async () => {
    const { service } = harness();

    const [first, second] = await Promise.all([
      service.renew(sessionToken),
      service.renew(sessionToken),
    ]);

    expect(first.csrfToken).toBe(second.csrfToken);
  });

  it('upgrades a shorter legacy absolute lifetime to seven days from login', async () => {
    const { service, prisma } = harness(new Date('2026-07-25T00:00:00.000Z'));

    const renewed = await service.renew(sessionToken);

    expect(renewed.absoluteExpiresAt).toEqual(new Date('2026-07-31T10:00:00.000Z'));
    expect(prisma.adminSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          absoluteExpiresAt: new Date('2026-07-31T10:00:00.000Z'),
        }),
      }),
    );
  });

  it('rejects renewal after the absolute session lifetime', async () => {
    const { service, prisma } = harness(new Date('2026-07-24T11:59:59.000Z'));

    await expect(service.renew(sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.adminSession.updateMany).not.toHaveBeenCalled();
  });
});
