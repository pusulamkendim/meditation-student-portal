import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
const replySchema = z.object({ content: z.string().min(1).max(4096) });
@Controller('v1/admin/conversations')
@UseGuards(AdminSessionGuard)
export class ConversationsController {
  private readonly encryption: FieldEncryption;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Message encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }
  @Get() async list() {
    const students = await this.prisma.student.findMany({
      where: { messages: { some: {} } },
      select: {
        id: true,
        status: true,
        messages: {
          take: 1,
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true, direction: true, status: true },
        },
      },
      take: 100,
    });
    return { items: students };
  }
  @Get(':studentId') async detail(@Param('studentId') studentId: string) {
    return {
      items: await this.prisma.message.findMany({
        where: { studentId },
        orderBy: { occurredAt: 'asc' },
        select: {
          id: true,
          direction: true,
          status: true,
          occurredAt: true,
          channelIdentityId: true,
        },
      }),
    };
  }
  @Post(':studentId/reply')
  @UseGuards(AdminCsrfGuard)
  async reply(@Param('studentId') studentId: string, @Body() body: unknown) {
    const value = replySchema.parse(body);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    if (!student.defaultChannelIdentityId) throw new Error('Student has no default channel.');
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const encrypted = this.encryption.encrypt(value.content, `admin-reply:${studentId}`);
      const intent = await tx.messageIntent.create({
        data: {
          studentId,
          channelIdentityId: student.defaultChannelIdentityId!,
          category: 'ADMIN_REPLY',
          idempotencyKey: `admin-reply:${randomUUID()}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + 3600000),
          aggregateVersion: student.version,
          payload: {
            contentEncrypted: encrypted.ciphertext.toString('base64'),
            contentKeyId: encrypted.keyId,
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: intent.id,
          eventType: 'MessageIntentCreated',
          payload: { intentId: intent.id },
        },
      });
      return intent;
    });
  }
}
