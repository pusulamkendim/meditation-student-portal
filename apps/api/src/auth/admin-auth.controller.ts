import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Inject } from '@nestjs/common';
import type { ApplicationConfig } from '@meditation/core';
import { z } from 'zod';

import {
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_REFRESH_HEADER,
} from './auth.constants.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';

const loginSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(12).max(256),
    totpCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z
      .string()
      .regex(/^[A-Fa-f0-9-]{16,19}$/)
      .optional(),
  })
  .refine((value) => Boolean(value.totpCode) !== Boolean(value.recoveryCode), {
    message: 'Exactly one second factor is required.',
  });

const stepUpSchema = z.object({ totpCode: z.string().regex(/^\d{6}$/) });

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{
    csrfToken: string;
    expiresAt: string;
    absoluteExpiresAt: string;
    admin: { id: string; email: string; role: string };
  }> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid login payload.');
    const result = await this.auth.login({
      ...parsed.data,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
    this.setSessionCookie(reply, result.sessionToken, result.absoluteExpiresAt);
    reply.header('cache-control', 'no-store');
    return {
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
      absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
      admin: result.admin,
    };
  }

  @Get('me')
  @UseGuards(AdminSessionGuard)
  me(@Req() request: FastifyRequest): { admin: FastifyRequest['admin'] } {
    return { admin: request.admin };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers(ADMIN_SESSION_REFRESH_HEADER) refreshHeader: string | undefined,
  ): Promise<{
    csrfToken: string;
    expiresAt: string;
    absoluteExpiresAt: string;
    sessionId: string;
  }> {
    const sessionToken = request.cookies[ADMIN_SESSION_COOKIE];
    if (!sessionToken) throw new UnauthorizedException('Authentication required.');
    if (refreshHeader !== 'portal') {
      throw new BadRequestException('Session refresh request is invalid.');
    }
    const result = await this.auth.renew(sessionToken);
    this.setSessionCookie(reply, result.sessionToken, result.absoluteExpiresAt);
    reply.header('cache-control', 'no-store');
    return {
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
      absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
      sessionId: result.sessionId,
    };
  }

  @Post('logout')
  @UseGuards(AdminSessionGuard)
  @HttpCode(204)
  async logout(
    @Req() request: FastifyRequest,
    @Headers(ADMIN_CSRF_HEADER) csrfToken: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const sessionToken = request.cookies[ADMIN_SESSION_COOKIE];
    if (!sessionToken || !csrfToken) throw new BadRequestException('CSRF token is required.');
    await this.auth.logout(sessionToken, csrfToken);
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: '/v1/admin' });
  }

  @Post('step-up')
  @UseGuards(AdminSessionGuard)
  async stepUp(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Headers(ADMIN_CSRF_HEADER) csrfToken: string | undefined,
  ): Promise<{ verifiedAt: string }> {
    const parsed = stepUpSchema.safeParse(body);
    const sessionToken = request.cookies[ADMIN_SESSION_COOKIE];
    if (!parsed.success || !sessionToken || !csrfToken) {
      throw new BadRequestException('Invalid step-up payload.');
    }
    await this.auth.validateCsrf(sessionToken, csrfToken);
    const verifiedAt = await this.auth.stepUp(sessionToken, parsed.data.totpCode);
    return { verifiedAt: verifiedAt.toISOString() };
  }

  private setSessionCookie(reply: FastifyReply, token: string, expires: Date) {
    reply.setCookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'staging' || this.config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/admin',
      expires,
    });
  }
}
