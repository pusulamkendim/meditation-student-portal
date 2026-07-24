import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FieldEncryption, type ApplicationConfig } from '@meditation/core';
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
import { StudentNoteService } from './student-note.service.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
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
  private readonly encryption: FieldEncryption;

  constructor(
    @Inject(RegistrationService) private readonly registration: RegistrationService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StudentAdminService) private readonly studentAdmin: StudentAdminService,
    @Inject(StudentNoteService) private readonly studentNotes: StudentNoteService,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Student encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }
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
        student: {
          select: { id: true, fullNameEncrypted: true, fullNameKeyId: true },
        },
      },
    });
    return {
      items: payments.map(({ student, ...payment }) => {
        let studentName: string | undefined;
        if (student.fullNameEncrypted && student.fullNameKeyId) {
          try {
            studentName = this.encryption.decrypt(
              {
                ciphertext: Buffer.from(student.fullNameEncrypted),
                keyId: student.fullNameKeyId,
              },
              `student:${student.id}:name`,
            );
          } catch {
            studentName = undefined;
          }
        }
        return {
          ...payment,
          studentName,
          amountMinor: payment.amountMinor.toString(),
          reportedAt: payment.reportedAt.toISOString(),
        };
      }),
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
  @Get('admin/students/:studentId/notes')
  @UseGuards(AdminSessionGuard)
  listStudentNotes(@Param('studentId') studentId: string, @Req() request: FastifyRequest) {
    return this.studentNotes.list(studentId, request.admin!.id);
  }
  @Post('admin/students/:studentId/notes')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  createStudentNote(
    @Param('studentId') studentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const value = z.object({ content: z.string().trim().min(1).max(5000) }).parse(body);
    return this.studentNotes.create(studentId, request.admin!.id, value.content);
  }
  @Patch('admin/students/:studentId/notes/:noteId')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  updateStudentNote(
    @Param('studentId') studentId: string,
    @Param('noteId') noteId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const value = z
      .object({
        content: z.string().trim().min(1).max(5000),
        version: z.number().int().positive(),
      })
      .parse(body);
    return this.studentNotes.update(
      studentId,
      noteId,
      request.admin!.id,
      value.content,
      value.version,
    );
  }
  @Delete('admin/students/:studentId/notes/:noteId')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  deleteStudentNote(
    @Param('studentId') studentId: string,
    @Param('noteId') noteId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const value = z.object({ version: z.number().int().positive() }).parse(body);
    return this.studentNotes.delete(studentId, noteId, request.admin!.id, value.version);
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
