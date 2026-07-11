import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { systemEventKeySchema } from '@meditation/core';
import { NotificationChannel, ProviderTemplateStatus } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { MessageCatalogService } from './message-catalog.service.js';

const previewSchema = z.object({
  eventKey: systemEventKeySchema,
  content: z.string().min(1).max(4096),
  variables: z.record(z.unknown()),
});
const testSendSchema = previewSchema.extend({ recipient: z.string().min(3).max(320) });
const messageSchema = z.object({
  eventKey: systemEventKeySchema,
  name: z.string().min(1).max(120),
});
const variantSchema = z.object({
  channel: z.nativeEnum(NotificationChannel),
  locale: z.string().min(2).max(35),
  stage: z.enum(['WEEK_1', 'WEEK_2', 'WEEK_3', 'WEEK_4', 'INTERMEDIATE', 'ADVANCED']).optional(),
  slot: z.string().max(40).optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  requiresStudentName: z.boolean().optional(),
});
const versionSchema = z.object({
  content: z.string().min(1).max(4096),
  expertApproved: z.boolean().optional(),
});
const rollbackSchema = z.object({ versionId: z.string().uuid() });
const bindingSchema = z.object({
  templateName: z.string().min(1).max(512),
  providerLocale: z.string().min(2).max(35),
  category: z.string().min(1).max(80),
  status: z.nativeEnum(ProviderTemplateStatus),
  providerVersion: z.string().max(120).optional(),
});

@Controller('v1/admin')
@UseGuards(AdminSessionGuard)
export class MessageCatalogController {
  constructor(private readonly catalog: MessageCatalogService) {}

  @Get('system-events')
  listEvents() {
    return { items: this.catalog.listEvents() };
  }

  @Get('system-events/:eventKey')
  getEvent(@Param('eventKey') eventKey: string) {
    try {
      return this.catalog.getEvent(eventKey);
    } catch {
      throw new BadRequestException('Unsupported system event.');
    }
  }

  @Get('standard-messages')
  async listMessages() {
    return { items: await this.catalog.listMessages() };
  }

  @Post('standard-messages')
  @UseGuards(AdminCsrfGuard)
  createMessage(@Body() body: unknown) {
    const value = messageSchema.parse(body);
    return this.catalog.createMessage(value.eventKey, value.name);
  }

  @Post('standard-messages/:id/variants')
  @UseGuards(AdminCsrfGuard)
  createVariant(@Param('id') id: string, @Body() body: unknown) {
    const value = variantSchema.parse(body);
    return this.catalog.createVariant({ messageId: id, ...value });
  }

  @Post('standard-message-variants/:id/versions')
  @UseGuards(AdminCsrfGuard)
  createVersion(@Param('id') id: string, @Body() body: unknown) {
    const value = versionSchema.parse(body);
    return this.catalog.createVersion(id, value.content, value.expertApproved);
  }

  @Post('standard-message-versions/:id/publish')
  @UseGuards(AdminCsrfGuard)
  publish(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.catalog.publish(id, request.admin!.sessionId);
  }

  @Post('standard-message-versions/:id/archive')
  @UseGuards(AdminCsrfGuard)
  archive(@Param('id') id: string) {
    return this.catalog.archive(id);
  }

  @Post('standard-message-variants/:id/rollback')
  @UseGuards(AdminCsrfGuard)
  rollback(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const value = rollbackSchema.parse(body);
    return this.catalog.rollback(id, value.versionId, request.admin!.sessionId);
  }

  @Put('standard-message-variants/:id/provider-binding')
  @UseGuards(AdminCsrfGuard)
  providerBinding(@Param('id') id: string, @Body() body: unknown) {
    return this.catalog.upsertProviderBinding(id, bindingSchema.parse(body));
  }

  @Post('standard-message-versions/preview')
  @UseGuards(AdminCsrfGuard)
  preview(@Body() body: unknown) {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid preview payload.');
    try {
      return this.catalog.preview(parsed.data.eventKey, parsed.data.content, parsed.data.variables);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Preview failed.');
    }
  }

  @Post('standard-message-versions/test-send')
  @UseGuards(AdminCsrfGuard)
  testSend(@Body() body: unknown) {
    const parsed = testSendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid test-send payload.');
    try {
      return this.catalog.testSend(
        parsed.data.eventKey,
        parsed.data.content,
        parsed.data.variables,
        parsed.data.recipient,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Test send failed.');
    }
  }
}
