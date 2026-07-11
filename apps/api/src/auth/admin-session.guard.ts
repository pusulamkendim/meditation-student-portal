import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ADMIN_SESSION_COOKIE } from './auth.constants.js';
import { AdminAuthService } from './admin-auth.service.js';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Authentication required.');
    request.admin = await this.auth.authenticate(token);
    return true;
  }
}
