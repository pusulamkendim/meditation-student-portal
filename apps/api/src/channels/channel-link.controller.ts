import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ChannelType } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { ChannelLinkService } from './channel-link.service.js';
const createSchema = z.object({ channel: z.nativeEnum(ChannelType) });
const statusSchema = z.object({ channel: z.nativeEnum(ChannelType) });
const defaultSchema = z.object({
  identityId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});
@Controller()
export class ChannelLinkController {
  constructor(@Inject(ChannelLinkService) private readonly links: ChannelLinkService) {}
  @Get('v1/admin/students/:id/channel-links/status') @UseGuards(AdminSessionGuard) status(
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const value = statusSchema.parse(query);
    return this.links.status(id, value.channel);
  }
  @Post('v1/admin/students/:id/channel-links') @UseGuards(AdminSessionGuard, AdminCsrfGuard) create(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const v = createSchema.parse(body);
    return this.links.create(id, v.channel, request.admin!.id);
  }
  @Post('v1/admin/students/:id/default-channel')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  setDefault(@Param('id') id: string, @Body() body: unknown) {
    const v = defaultSchema.parse(body);
    return this.links.setDefault(id, v.identityId, v.expectedVersion);
  }
}
