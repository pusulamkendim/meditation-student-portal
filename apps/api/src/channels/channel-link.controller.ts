import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ChannelType } from '@meditation/database';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { ChannelLinkService } from './channel-link.service.js';
const createSchema = z.object({ channel: z.nativeEnum(ChannelType) });
const consumeSchema = z.object({
  token: z.string().min(32),
  accountExternalId: z.string().min(1),
  externalUserId: z.string().min(1),
});
const defaultSchema = z.object({
  identityId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});
@Controller()
export class ChannelLinkController {
  constructor(private readonly links: ChannelLinkService) {}
  @Post('v1/admin/students/:id/channel-links') @UseGuards(AdminSessionGuard, AdminCsrfGuard) create(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const v = createSchema.parse(body);
    return this.links.create(id, v.channel);
  }
  @Post('v1/channel-links/consume') consume(@Body() body: unknown) {
    const v = consumeSchema.parse(body);
    return this.links.consume(v.token, v.accountExternalId, v.externalUserId);
  }
  @Post('v1/admin/students/:id/default-channel')
  @UseGuards(AdminSessionGuard, AdminCsrfGuard)
  setDefault(@Param('id') id: string, @Body() body: unknown) {
    const v = defaultSchema.parse(body);
    return this.links.setDefault(id, v.identityId, v.expectedVersion);
  }
}
