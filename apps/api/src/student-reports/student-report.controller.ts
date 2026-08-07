import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StudentReportType } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { StudentReportService } from './student-report.service.js';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const createSchema = z.object({
  type: z.nativeEnum(StudentReportType).default(StudentReportType.WEEKLY),
  periodStart: dateOnly,
  periodEndExclusive: dateOnly,
});

const editSchema = z.object({
  version: z.number().int().positive(),
  subtitle: z.string().trim().min(1).max(180),
  featuredReflectionId: z.string().uuid().nullable(),
  gentleObservation: z.string().trim().min(1).max(1600),
  supportPoint: z.string().trim().min(1).max(1600),
  weeklyEvaluation: z.string().trim().min(1).max(2400),
});

@Controller('v1')
export class StudentReportController {
  constructor(@Inject(StudentReportService) private readonly reports: StudentReportService) {}

  @Get('admin/students/:studentId/reports')
  @UseGuards(AdminSessionGuard)
  list(@Param('studentId') studentId: string, @Req() request: FastifyRequest) {
    return this.reports.list(studentId, request.admin!.id);
  }

  @Post('admin/students/:studentId/reports')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  create(
    @Param('studentId') studentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    return this.reports.create(studentId, request.admin!.id, createSchema.parse(body));
  }

  @Get('admin/student-reports/:reportId')
  @UseGuards(AdminSessionGuard)
  detail(@Param('reportId') reportId: string, @Req() request: FastifyRequest) {
    return this.reports.detail(reportId, request.admin!.id);
  }

  @Patch('admin/student-reports/:reportId')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  edit(@Param('reportId') reportId: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    return this.reports.edit(reportId, request.admin!.id, editSchema.parse(body));
  }

  @Post('admin/student-reports/:reportId/generate-ai')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  generateAi(@Param('reportId') reportId: string, @Req() request: FastifyRequest) {
    return this.reports.requestAi(reportId, request.admin!.id);
  }

  @Post('admin/student-reports/:reportId/approve')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  approve(
    @Param('reportId') reportId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const input = z
      .object({
        version: z.number().int().positive(),
        acknowledgeSafety: z.boolean().default(false),
      })
      .parse(body);
    return this.reports.approve(
      reportId,
      request.admin!.id,
      input.version,
      input.acknowledgeSafety,
    );
  }

  @Post('admin/student-reports/:reportId/share')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  share(
    @Param('reportId') reportId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const input = z
      .object({ expiresAt: z.string().datetime().nullable().default(null) })
      .parse(body);
    return this.reports.createShare(
      reportId,
      request.admin!.id,
      input.expiresAt ? new Date(input.expiresAt) : null,
    );
  }

  @Post('admin/student-reports/:reportId/share/revoke')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  revokeShare(@Param('reportId') reportId: string, @Req() request: FastifyRequest) {
    return this.reports.revokeShare(reportId, request.admin!.id);
  }

  @Post('admin/student-reports/:reportId/share/send')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  sendShare(@Param('reportId') reportId: string, @Req() request: FastifyRequest) {
    return this.reports.sendShare(reportId, request.admin!.id);
  }

  @Get('public/student-reports/:token')
  publicReport(@Param('token') token: string) {
    return this.reports.publicReport(token);
  }
}
