import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { InternalChannelGuard } from '../registration/internal-channel.guard.js';
import { PracticeService } from './practice.service.js';

const slots = z
  .array(
    z.object({
      slotKey: z.enum(['MORNING', 'EVENING']),
      localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      active: z.boolean(),
    }),
  )
  .min(1);
@Controller('v1')
export class PracticeController {
  constructor(
    @Inject(PracticeService) private readonly practice: PracticeService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  @Get('admin/practice-sessions') @UseGuards(AdminSessionGuard) async sessions() {
    const items = await this.prisma.practiceSession.findMany({
      where: {
        OR: [{ cancellationReason: null }, { cancellationReason: { not: 'PLAN_SUPERSEDED' } }],
      },
      take: 200,
      orderBy: { startAt: 'desc' },
      include: {
        student: { select: { timezone: true } },
        practiceSlot: true,
        practicePlan: true,
        reflection: { include: { tags: true } },
      },
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        studentId: item.studentId,
        status: item.status,
        version: item.version,
        startAt: item.startAt.toISOString(),
        durationMinutes: item.durationMinutes,
        slot: item.practiceSlot?.slotKey,
        localTime: new Intl.DateTimeFormat('en-GB', {
          timeZone: item.student.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(item.startAt),
        planRevision: item.practicePlan.revision,
        cancellationReason: item.cancellationReason,
        reflectionTags:
          item.reflection?.tags.map((tag) => ({
            tag: tag.tag,
            confidence: tag.confidence,
            taxonomyVersion: tag.taxonomyVersion,
          })) ?? [],
      })),
    };
  }
  @Get('admin/students/:id/practice-plan') @UseGuards(AdminSessionGuard) async plan(
    @Param('id') id: string,
  ) {
    const plan = await this.prisma.practicePlan.findFirst({
      where: { studentId: id, status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
      orderBy: { revision: 'desc' },
      include: { slots: true, sessions: { take: 120, orderBy: { startAt: 'asc' } } },
    });
    const subscriptions = await this.prisma.subscriptionPeriod.findMany({
      where: { studentId: id, status: { in: ['ACTIVE', 'SCHEDULED'] } },
      orderBy: { startDate: 'asc' },
      select: { id: true, status: true, startDate: true, endExclusive: true },
    });
    return { plan, subscriptions };
  }
  @Get('practice/students/:id/program')
  @UseGuards(InternalChannelGuard)
  async currentProgram(@Param('id') id: string) {
    return this.practice.currentProgram(id);
  }
  @Post('admin/students/:id/practice-plan/versions')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  create(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const value = z
      .object({
        subscriptionId: z.string().uuid(),
        slots,
        effectiveFrom: z.coerce.date().optional(),
        durationOverride: z.number().int().min(1).max(180).optional(),
      })
      .parse(body);
    return this.practice.createPlan(
      id,
      value.subscriptionId,
      value.slots,
      value.effectiveFrom,
      value.durationOverride,
      request.admin!.id,
    );
  }
  @Post('practice/students/:id/program')
  @UseGuards(InternalChannelGuard)
  createFromChannel(@Param('id') id: string, @Body() body: unknown) {
    const value = z
      .object({
        subscriptionId: z.string().uuid(),
        slots,
        durationOverride: z.number().int().min(1).max(180).optional(),
      })
      .parse(body);
    return this.practice.createPlan(
      id,
      value.subscriptionId,
      value.slots,
      undefined,
      value.durationOverride,
    );
  }
  @Post('admin/students/:id/practice/pause') @UseGuards(AdminSessionGuard, AdminCsrfGuard) pause(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const value = z.object({ paused: z.boolean(), reason: z.string().min(1).max(500) }).parse(body);
    return this.practice.pause(id, value.paused, value.reason, request.admin!.id);
  }
  @Post('admin/practice-sessions/:id/cancel') @UseGuards(AdminSessionGuard, AdminCsrfGuard) cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    return this.practice.cancel(
      id,
      z.object({ reason: z.string().min(1) }).parse(body).reason,
      request.admin!.id,
    );
  }
  @Patch('admin/practice-sessions/:id')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  reschedule(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const value = z
      .object({
        startAt: z.coerce.date(),
        expectedVersion: z.number().int().positive(),
        reason: z.string().min(1).max(500),
      })
      .parse(body);
    return this.practice.reschedule(
      id,
      value.startAt,
      value.expectedVersion,
      value.reason,
      request.admin!.id,
    );
  }
  @Post('admin/practice-sessions/:id/restore')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  restore(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    return this.practice.restore(
      id,
      z.object({ reason: z.string().min(1) }).parse(body).reason,
      request.admin!.id,
    );
  }
  @Post('admin/students/:id/practice-sessions/cancel-range')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  cancelRange(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const value = z
      .object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        slotKey: z.enum(['MORNING', 'EVENING']).optional(),
        reason: z.string().min(1),
      })
      .parse(body);
    return this.practice.cancelRange(
      id,
      value.from,
      value.to,
      value.slotKey,
      value.reason,
      request.admin!.id,
    );
  }
  @Post('practice-sessions/:id/respond') @UseGuards(InternalChannelGuard) respond(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const value = z
      .object({
        studentId: z.string().uuid(),
        replyNonce: z.string().min(16).max(256),
        response: z.enum(['COMPLETED', 'SKIPPED']),
        reflection: z.string().max(4000).optional(),
      })
      .parse(body);
    return this.practice.respond(
      id,
      value.studentId,
      value.replyNonce,
      value.response,
      value.reflection,
    );
  }
}
