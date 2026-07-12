import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ApplicationConfig } from '@meditation/core';
import { MeetingStatus } from '@meditation/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { MeetingService } from './meeting.service.js';

const date = z.coerce.date();
const createSeriesSchema = z.object({ firstStartsAt: date });
const rescheduleSchema = z.object({
  startsAt: date,
  expectedVersion: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});
const statusSchema = z.object({
  status: z.nativeEnum(MeetingStatus),
  expectedVersion: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});
const noteSchema = z.object({ content: z.string().min(1).max(10_000) });
const meetOverrideSchema = z.object({ url: z.string().url().max(2000) });
const summaryDraftSchema = z.object({ content: z.string().trim().min(1).max(20_000) });

@Controller('v1/admin')
@UseGuards(AdminSessionGuard)
export class MeetingController {
  constructor(
    @Inject(MeetingService) private readonly meetings: MeetingService,
    @Inject(GoogleCalendarService) private readonly google: GoogleCalendarService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {}

  @Get('meetings')
  async list(@Query() query: Record<string, string | undefined>) {
    const parsed = z
      .object({
        status: z.nativeEnum(MeetingStatus).optional(),
        from: date.optional(),
        to: date.optional(),
      })
      .safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid meeting filters.');
    const result = await this.meetings.list(parsed.data);
    return { ...result, connection: await this.google.status() };
  }

  @Get('meeting-subscriptions')
  subscriptions() {
    return this.meetings.subscriptions();
  }

  @Get('meetings/:id')
  get(@Param('id') id: string) {
    return this.meetings.get(id);
  }

  @Post('subscriptions/:id/meeting-series')
  @UseGuards(AdminCsrfGuard)
  createSeries(
    @Param('id') subscriptionId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = createSeriesSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid meeting series payload.');
    return this.meetings.createSeries(subscriptionId, parsed.data.firstStartsAt, request.admin!.id);
  }

  @Patch('meetings/:id')
  @UseGuards(AdminCsrfGuard)
  reschedule(
    @Param('id') meetingId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid meeting reschedule payload.');
    return this.meetings.rescheduleMeeting(
      meetingId,
      parsed.data.startsAt,
      parsed.data.expectedVersion,
      parsed.data.reason,
      request.admin!.id,
    );
  }

  @Post('meetings/:id/status')
  @UseGuards(AdminCsrfGuard)
  setStatus(@Param('id') meetingId: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid meeting status payload.');
    return this.meetings.setStatus(
      meetingId,
      parsed.data.status,
      parsed.data.expectedVersion,
      parsed.data.reason,
      request.admin!.id,
    );
  }

  @Get('meetings/:id/summary')
  async summary(@Param('id') meetingId: string) {
    const meeting = await this.meetings.get(meetingId);
    return { summary: meeting.summary ?? null };
  }

  @Get('summary-drafts')
  summaryDrafts(@Query('meetingId') meetingId?: string) {
    return this.meetings.listSummaryDrafts(meetingId);
  }

  @Post('meetings/:id/summary-drafts')
  @UseGuards(AdminCsrfGuard)
  editSummaryDraft(
    @Param('id') meetingId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = summaryDraftSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid summary draft payload.');
    return this.meetings.editSummaryDraft(meetingId, parsed.data.content, request.admin!.id);
  }

  @Post('summary-drafts/:id/approve')
  @UseGuards(AdminCsrfGuard)
  approveSummaryDraft(@Param('id') draftId: string, @Req() request: FastifyRequest) {
    return this.meetings.approveSummaryDraft(draftId, request.admin!.id);
  }

  @Put('meetings/:id/coach-note')
  @UseGuards(AdminCsrfGuard)
  coachNote(@Param('id') meetingId: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid coach note payload.');
    return this.meetings.saveCoachNote(meetingId, parsed.data.content, request.admin!.id);
  }

  @Post('meeting-series/:id/reschedule')
  @UseGuards(AdminCsrfGuard)
  rescheduleSeries(
    @Param('id') seriesId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid series reschedule payload.');
    return this.meetings.rescheduleSeries(
      seriesId,
      parsed.data.startsAt,
      parsed.data.expectedVersion,
      parsed.data.reason,
      request.admin!.id,
    );
  }

  @Put('meeting-series/:id/meet-link')
  @UseGuards(AdminCsrfGuard)
  meetOverride(
    @Param('id') seriesId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = meetOverrideSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Meet link payload.');
    return this.meetings.setMeetOverride(seriesId, parsed.data.url, request.admin!.id);
  }

  @Post('calendar-discrepancies/:id/resolve')
  @UseGuards(AdminCsrfGuard)
  resolveDiscrepancy(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.meetings.resolveDiscrepancy(id, request.admin!.id);
  }

  @Get('google-calendar')
  connection() {
    return this.google.status();
  }

  @Get('google-calendar/oauth/start')
  startOauth(@Req() request: FastifyRequest) {
    return this.google.start(request.admin!.id);
  }

  @Get('google-calendar/oauth/callback')
  async callback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    if (!state || !code) throw new BadRequestException('Google OAuth callback is incomplete.');
    const result = await this.google.callback(state, code, request.admin!.id);
    if (this.config.ADMIN_ORIGIN) {
      return reply.redirect(`${this.config.ADMIN_ORIGIN}/meetings?calendar=connected`);
    }
    return reply.send(result);
  }

  @Post('google-calendar/disconnect')
  @UseGuards(AdminCsrfGuard)
  async disconnect() {
    await this.google.disconnect();
    return { status: 'DISCONNECTED' };
  }
}
