import type { ApplicationConfig } from '@meditation/core';
import { AdminRole } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_SESSION_COOKIE } from './auth.constants.js';
import { AdminAuthController } from './admin-auth.controller.js';

describe('AdminAuthController', () => {
  it('keeps the session cookie until the absolute session expiry', async () => {
    const expiresAt = new Date('2026-07-15T10:30:00.000Z');
    const absoluteExpiresAt = new Date('2026-07-15T22:00:00.000Z');
    const auth = {
      login: vi.fn().mockResolvedValue({
        sessionToken: 'session-token',
        csrfToken: 'csrf-token',
        expiresAt,
        absoluteExpiresAt,
        admin: { id: 'admin-1', email: 'admin@example.com', role: AdminRole.ADMIN },
      }),
    };
    const controller = new AdminAuthController(
      auth as never,
      {
        NODE_ENV: 'development',
      } as ApplicationConfig,
    );
    const reply = {
      setCookie: vi.fn(),
      header: vi.fn(),
    };

    const result = await controller.login(
      {
        email: 'admin@example.com',
        password: 'long-enough-password',
        totpCode: '123456',
      },
      {
        ip: '127.0.0.1',
        id: 'request-1',
        headers: { 'user-agent': 'vitest' },
      } as never,
      reply as never,
    );

    expect(reply.setCookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      'session-token',
      expect.objectContaining({
        expires: absoluteExpiresAt,
        httpOnly: true,
        path: '/v1/admin',
        sameSite: 'strict',
        secure: false,
      }),
    );
    expect(result).toMatchObject({
      expiresAt: expiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    });
  });

  it('refreshes the cookie and returns a replacement CSRF token', async () => {
    const absoluteExpiresAt = new Date('2026-07-31T10:00:00.000Z');
    const auth = {
      renew: vi.fn().mockResolvedValue({
        sessionId: 'session-id',
        sessionToken: 'session-token',
        csrfToken: 'stable-csrf-token',
        expiresAt: new Date('2026-07-24T10:30:00.000Z'),
        absoluteExpiresAt,
        admin: { id: 'admin-1', email: 'admin@example.com', role: AdminRole.ADMIN },
      }),
    };
    const controller = new AdminAuthController(
      auth as never,
      { NODE_ENV: 'development' } as ApplicationConfig,
    );
    const reply = { setCookie: vi.fn(), header: vi.fn() };

    const result = await controller.refresh(
      { cookies: { admin_session: 'session-token' } } as never,
      reply as never,
      'portal',
    );

    expect(auth.renew).toHaveBeenCalledWith('session-token');
    expect(reply.setCookie).toHaveBeenCalledWith(
      ADMIN_SESSION_COOKIE,
      'session-token',
      expect.objectContaining({ expires: absoluteExpiresAt }),
    );
    expect(result).toEqual({
      csrfToken: 'stable-csrf-token',
      expiresAt: '2026-07-24T10:30:00.000Z',
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      sessionId: 'session-id',
    });
  });
});
