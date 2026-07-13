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
import { StudentAdminService } from './student-admin.service.js';
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
    @Inject(StudentAdminService) private readonly studentAdmin: StudentAdminService,
  ) {}
  @Get('admin/payments') @UseGuards(AdminSessionGuard) async listPayments() {
    const payments = await this.prisma.payment.findMany({
      orderBy: { reportedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        studentId: true,
        status: true,
        amountMinor: true,
        currency: true,
        referenceCode: true,
        reportedAt: true,
        reviewNote: true,
      },
    });
    return {
      items: payments.map((payment) => ({
        ...payment,
        amountMinor: payment.amountMinor.toString(),
        reportedAt: payment.reportedAt.toISOString(),
      })),
    };
  }
  @Get('admin/students') @UseGuards(AdminSessionGuard) async listStudents(
    @Req() request: FastifyRequest,
  ) {
    return this.studentAdmin.list(request.admin?.id);
  }
  @Get('admin/students/:id') @UseGuards(AdminSessionGuard) async getStudent(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.studentAdmin.detail(id, request.admin?.id);
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
        scope: z.enum(['MESSAGING', 'AGENT_REPLY_AI', 'REFLECTION_STORAGE', 'REFLECTION_AI']),
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
  @Post('registration/:studentId/consents')
  @UseGuards(InternalChannelGuard)
  recordConsent(@Param('studentId') id: string, @Body() body: unknown) {
    const value = z
      .object({
        scope: z.enum(['REFLECTION_STORAGE', 'REFLECTION_AI']),
        granted: z.boolean(),
        channel: z.nativeEnum(ChannelType),
        externalMessageId: z.string(),
      })
      .parse(body);
    return this.registration.recordConsent(
      id,
      value.scope,
      value.granted ? 'GRANTED' : 'WITHDRAWN',
      value.channel,
      value.externalMessageId,
    );
  }
  @Post('admin/payments/:id/action-required')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  async action(@Param('id') id: string, @Body() b: unknown) {
    const payment = await this.payments.actionRequired(
      id,
      z.object({ note: z.string().min(1) }).parse(b).note,
    );
    return { id: payment.id, status: payment.status, version: payment.version };
  }
  @Post('admin/payments/:id/approve') @UseGuards(AdminSessionGuard, AdminCsrfGuard) async approve(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() req: FastifyRequest,
  ) {
    const v = z.object({ startDate: z.coerce.date().optional() }).parse(b);
    const subscription = await this.payments.approve(id, req.admin!.id, v.startDate);
    return {
      id: subscription.id,
      status: subscription.status,
      startDate: subscription.startDate.toISOString(),
      endExclusive: subscription.endExclusive.toISOString(),
    };
  }
}
