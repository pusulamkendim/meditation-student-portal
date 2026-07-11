import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ADMIN_CSRF_HEADER, ADMIN_SESSION_COOKIE } from './auth.constants.js';
import { AdminAuthService } from './admin-auth.service.js';

@Injectable()
export class AdminCsrfGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const session = request.cookies[ADMIN_SESSION_COOKIE];
    const csrf = request.headers[ADMIN_CSRF_HEADER];
    if (!session || typeof csrf !== 'string')
      throw new BadRequestException('CSRF token is required.');
    await this.auth.validateCsrf(session, csrf);
    return true;
  }
}
