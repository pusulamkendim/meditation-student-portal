import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyTelegramWebhookSecret, type ApplicationConfig } from '@meditation/core';
import type { FastifyRequest } from 'fastify';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';

@Injectable()
export class InternalChannelGuard implements CanActivate {
  constructor(@Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const received = context.switchToHttp().getRequest<FastifyRequest>().headers[
      'x-internal-command-secret'
    ];
    if (
      !this.config.INTERNAL_COMMAND_SECRET ||
      typeof received !== 'string' ||
      !verifyTelegramWebhookSecret(received, this.config.INTERNAL_COMMAND_SECRET)
    )
      throw new UnauthorizedException('Verified channel context is required.');
    return true;
  }
}
