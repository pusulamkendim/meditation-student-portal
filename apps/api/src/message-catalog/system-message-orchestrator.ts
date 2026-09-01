import { Inject, Injectable } from '@nestjs/common';
import {
  bindingMatchesWhatsAppTemplate,
  CLOCK_TOKEN,
  getSystemEvent,
  renderMessageTemplate,
  resolveMessageVariant,
  validateEventVariables,
  type Clock,
  type SystemEventKey,
} from '@meditation/core';
import {
  MessageIntentStatus,
  NotificationChannel,
  StandardMessageVersionStatus,
  type Prisma,
} from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';

export interface SystemMessageCommand {
  eventKey: SystemEventKey;
  studentId: string;
  channelIdentityId: string;
  inboundMessageId?: string;
  idempotencyKey: string;
  locale: string;
  stage?: string;
  slot?: string;
  variables: Record<string, unknown>;
}

@Injectable()
export class SystemMessageOrchestrator {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async createIntent(
    command: SystemMessageCommand,
  ): Promise<{ occurrenceId: string; intentId: string }> {
    const event = getSystemEvent(command.eventKey);
    if (event.audience !== 'STUDENT')
      throw new Error('Student message orchestration requires a student event.');
    validateEventVariables(event, command.variables);
    const now = this.clock.now();

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.systemEventOccurrence.findUnique({
        where: { idempotencyKey: command.idempotencyKey },
      });
      if (existing) {
        const intent = await transaction.messageIntent.findUniqueOrThrow({
          where: { idempotencyKey: `system-event:${existing.id}` },
        });
        return { occurrenceId: existing.id, intentId: intent.id };
      }

      if (command.inboundMessageId) {
        const owner = await transaction.inboundResponseOwnership.findUnique({
          where: { inboundMessageId: command.inboundMessageId },
        });
        if (owner) throw new Error(`Inbound message already has response owner: ${owner.owner}`);
      }

      const channelIdentity = await transaction.studentChannelIdentity.findUniqueOrThrow({
        where: { id: command.channelIdentityId },
        select: {
          studentId: true,
          channelAccount: { select: { type: true } },
        },
      });
      if (channelIdentity.studentId !== command.studentId) {
        throw new Error('Channel identity does not belong to the message student.');
      }
      const channel =
        channelIdentity.channelAccount.type === 'WHATSAPP'
          ? NotificationChannel.WHATSAPP
          : NotificationChannel.TELEGRAM;
      const variant = await this.resolveVariant(transaction, command, now, channel);
      if (!variant) throw new Error(`No published message variant for ${command.eventKey}`);
      const rendered = renderMessageTemplate(command.eventKey, variant.content, command.variables);
      const binding = variant.variant.providerBinding;
      const approvedBinding = bindingMatchesWhatsAppTemplate(
        binding,
        command.eventKey,
        variant.content,
        variant.variant.locale,
      )
        ? binding
        : undefined;
      const student = await transaction.student.findUniqueOrThrow({
        where: { id: command.studentId },
      });
      const occurrence = await transaction.systemEventOccurrence.create({
        data: {
          eventKey: command.eventKey,
          studentId: command.studentId,
          inboundMessageId: command.inboundMessageId,
          idempotencyKey: command.idempotencyKey,
          variables: command.variables as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      const intent = await transaction.messageIntent.create({
        data: {
          studentId: command.studentId,
          channelIdentityId: command.channelIdentityId,
          category: 'SYSTEM_STANDARD_MESSAGE',
          status: MessageIntentStatus.PENDING,
          idempotencyKey: `system-event:${occurrence.id}`,
          dueAt: now,
          expiresAt: new Date(now.getTime() + event.defaultTtlSeconds * 1000),
          aggregateVersion: student.version,
          payload: {
            eventKey: command.eventKey,
            standardMessageVersionId: variant.id,
            rendered,
            locale: variant.variant.locale,
            providerTemplateName: approvedBinding?.templateName,
            providerTemplateLocale: approvedBinding?.providerLocale,
            providerTemplateParameters: approvedBinding
              ? (variant.placeholders as string[]).map((key) =>
                  String(command.variables[key] ?? ''),
                )
              : undefined,
          },
        },
      });
      if (command.inboundMessageId) {
        await transaction.inboundResponseOwnership.create({
          data: {
            inboundMessageId: command.inboundMessageId,
            owner: 'SYSTEM_STANDARD_MESSAGE',
            referenceId: occurrence.id,
          },
        });
      }
      await transaction.outboxEvent.create({
        data: {
          topic: 'message.intents',
          aggregateType: 'MessageIntent',
          aggregateId: intent.id,
          eventType: 'MessageIntentCreated',
          payload: { intentId: intent.id },
        },
      });
      return { occurrenceId: occurrence.id, intentId: intent.id };
    });
  }

  private async resolveVariant(
    transaction: Prisma.TransactionClient,
    command: SystemMessageCommand,
    now: Date,
    channel: NotificationChannel,
  ) {
    const versions = await transaction.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        effectiveAt: { lte: now },
        variant: {
          channel,
          standardMessage: { eventKey: command.eventKey, audience: 'STUDENT' },
        },
      },
      include: { variant: { include: { providerBinding: true } } },
    });
    return resolveMessageVariant(
      versions.map((version) => ({
        ...version,
        locale: version.variant.locale,
        stage: version.variant.curriculumStage,
        slot: version.variant.slot,
        priority: version.variant.priority,
        requiresStudentName: version.variant.requiresStudentName,
        effectiveAt: version.effectiveAt!,
      })),
      {
        locale: command.locale,
        stage: command.stage,
        slot: command.slot,
        hasStudentName: typeof command.variables.studentDisplayName === 'string',
      },
    );
  }
}
