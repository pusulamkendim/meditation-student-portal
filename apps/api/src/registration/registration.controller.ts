import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ChannelType } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { PaymentService } from './payment.service.js';
import { RegistrationService } from './registration.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { InternalChannelGuard } from './internal-channel.guard.js';
const advance = z.object({
  command: z.enum([
    'START',
    'PRIVACY_ACCEPTED',
    'CHANNEL_ACCEPTED',
    'AI_ACCEPTED',
    'AI_DECLINED',
    'NAME_RECEIVED',
  ]),
  channel: z.nativeEnum(ChannelType),
  externalMessageId: z.string(),
  name: z.string().max(200).optional(),
  noticeVersion: z.string().optional(),
});
@Controller('v1')
export class RegistrationController {
  constructor(
    @Inject(RegistrationService) private readonly registration: RegistrationService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  @Get('admin/payments') @UseGuards(AdminSessionGuard) async listPayments() {
    return {
      items: await this.prisma.payment.findMany({ orderBy: { reportedAt: 'desc' }, take: 100 }),
    };
  }
  @Post('registration/:studentId/advance') @UseGuards(InternalChannelGuard) advance(
    @Param('studentId') id: string,
    @Body() body: unknown,
  ) {
    const v = advance.parse(body);
    return this.registration.advance(id, v.command, v);
  }
  @Post('registration/:studentId/payment-reported') @UseGuards(InternalChannelGuard) report(
    @Param('studentId') id: string,
    @Body() b: unknown,
  ) {
    const v = z
      .object({ externalMessageId: z.string(), proofStorageKey: z.string().max(1024).optional() })
      .parse(b);
    return this.registration.reportPayment(id, v.externalMessageId, v.proofStorageKey);
  }
  @Post('registration/:studentId/consents/withdraw') @UseGuards(InternalChannelGuard) withdraw(
    @Param('studentId') id: string,
    @Body() body: unknown,
  ) {
    const value = z
      .object({
        scope: z.enum(['MESSAGING', 'AGENT_REPLY_AI', 'REFLECTION_AI']),
        channel: z.nativeEnum(ChannelType),
        externalMessageId: z.string(),
      })
      .parse(body);
    return this.registration.withdrawConsent(
      id,
      value.scope,
      value.channel,
      value.externalMessageId,
    );
  }
  @Post('admin/payments/:id/action-required') @UseGuards(AdminSessionGuard, AdminCsrfGuard) action(
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.payments.actionRequired(id, z.object({ note: z.string().min(1) }).parse(b).note);
  }
  @Post('admin/payments/:id/approve') @UseGuards(AdminSessionGuard, AdminCsrfGuard) approve(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() req: FastifyRequest,
  ) {
    const v = z.object({ startDate: z.coerce.date().optional() }).parse(b);
    return this.payments.approve(id, req.admin!.id, v.startDate);
  }
}
