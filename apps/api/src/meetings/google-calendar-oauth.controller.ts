import { BadRequestException, Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { ApplicationConfig } from '@meditation/core';
import type { FastifyReply } from 'fastify';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { GoogleCalendarService } from './google-calendar.service.js';

// Google returns from a different origin, so the strict admin session cookie is
// intentionally not required here. The callback is authorized by its expiring,
// single-use state record and PKCE verifier.
@Controller('v1/admin/google-calendar/oauth')
export class GoogleCalendarOAuthController {
  constructor(
    @Inject(GoogleCalendarService) private readonly google: GoogleCalendarService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {}

  @Get('callback')
  async callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Res() reply: FastifyReply,
  ) {
    if (!state || !code) throw new BadRequestException('Google OAuth callback is incomplete.');
    const result = await this.google.callback(state, code);
    if (this.config.ADMIN_ORIGIN) {
      return reply.redirect(`${this.config.ADMIN_ORIGIN}/meetings?calendar=connected`);
    }
    return reply.send(result);
  }
}
