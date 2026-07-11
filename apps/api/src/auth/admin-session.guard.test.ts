import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AdminSessionGuard } from './admin-session.guard.js';

describe('AdminSessionGuard', () => {
  it('rejects requests without a server-side session cookie', async () => {
    const auth = { authenticate: vi.fn() };
    const guard = new AdminSessionGuard(auth as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: {} }) }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('attaches the authenticated admin to the request', async () => {
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
      sessionId: 'session-1',
    };
    const auth = { authenticate: vi.fn().mockResolvedValue(admin) };
    const request = { cookies: { admin_session: 'opaque-token' } } as Record<string, unknown>;
    const guard = new AdminSessionGuard(auth as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.admin).toEqual(admin);
  });
});
