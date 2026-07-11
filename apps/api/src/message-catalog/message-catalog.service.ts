import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  assertNoPublishedVariantConflict,
  canonicalizeLocale,
  getSystemEvent,
  renderMessageTemplate,
  systemEventKeySchema,
  systemEventKeys,
  systemEventRegistry,
  validateMessageTemplate,
  type SystemEventKey,
  type ApplicationConfig,
  CLOCK_TOKEN,
  type Clock,
} from '@meditation/core';
import {
  NotificationChannel,
  ProviderTemplateStatus,
  StandardMessageVersionStatus,
  syncSystemEventRegistry,
} from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';

@Injectable()
export class MessageCatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    await syncSystemEventRegistry(this.prisma);
  }

  listEvents() {
    return systemEventKeys.map((key) => systemEventRegistry.get(key)!);
  }

  getEvent(key: string) {
    return getSystemEvent(key);
  }

  preview(eventKey: SystemEventKey, content: string, variables: Record<string, unknown>) {
    const placeholders = validateMessageTemplate(eventKey, content);
    return {
      rendered: renderMessageTemplate(eventKey, content, variables),
      placeholders,
    };
  }

  testSend(
    eventKey: SystemEventKey,
    content: string,
    variables: Record<string, unknown>,
    recipient: string,
  ) {
    const allowlist = new Set(
      this.config.ALLOWED_RECIPIENTS.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!allowlist.has(recipient)) throw new Error('Test recipient is not allowlisted.');
    const preview = this.preview(eventKey, content, variables);
    const providerMessageId = `fake-${createHash('sha256').update(`${recipient}:${preview.rendered}`).digest('hex').slice(0, 16)}`;
    return { ...preview, recipient, providerMessageId, productionStateCreated: false };
  }

  listMessages() {
    return this.prisma.standardMessage.findMany({
      include: { variants: { include: { versions: true, providerBinding: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMessage(eventKey: SystemEventKey, name: string) {
    const event = getSystemEvent(eventKey);
    return this.prisma.standardMessage.create({
      data: { eventKey, name, audience: event.audience, protected: event.protected },
    });
  }

  async createVariant(input: {
    messageId: string;
    channel: NotificationChannel;
    locale: string;
    stage?: 'WEEK_1' | 'WEEK_2' | 'WEEK_3' | 'WEEK_4' | 'INTERMEDIATE' | 'ADVANCED';
    slot?: string;
    priority?: number;
    requiresStudentName?: boolean;
  }) {
    return this.prisma.standardMessageVariant.create({
      data: {
        standardMessageId: input.messageId,
        channel: input.channel,
        locale: canonicalizeLocale(input.locale),
        curriculumStage: input.stage,
        slot: input.slot,
        priority: input.priority ?? 0,
        requiresStudentName: input.requiresStudentName ?? false,
      },
    });
  }

  async createVersion(variantId: string, content: string, expertApproved = false) {
    const variant = await this.prisma.standardMessageVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { standardMessage: true, versions: true },
    });
    const eventKey = systemEventKeySchema.parse(variant.standardMessage.eventKey);
    const placeholders = validateMessageTemplate(eventKey, content);
    if (variant.requiresStudentName && !placeholders.includes('studentDisplayName')) {
      throw new Error('Named variant requires the studentDisplayName placeholder.');
    }
    const version = Math.max(0, ...variant.versions.map((item) => item.version)) + 1;
    return this.prisma.standardMessageVersion.create({
      data: { variantId, version, content, placeholders, expertApproved },
    });
  }

  async publish(versionId: string, sessionId: string) {
    const version = await this.prisma.standardMessageVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { variant: { include: { standardMessage: true } } },
    });
    if (version.variant.standardMessage.protected) {
      if (!version.expertApproved) throw new Error('Protected message requires expert approval.');
      await this.assertRecentStepUp(sessionId);
    }
    const published = await this.prisma.standardMessageVersion.findMany({
      where: {
        status: StandardMessageVersionStatus.PUBLISHED,
        variant: { standardMessageId: version.variant.standardMessageId },
      },
      include: { variant: true },
    });
    assertNoPublishedVariantConflict(
      published.map((item) => ({
        id: item.id,
        locale: item.variant.locale,
        stage: item.variant.curriculumStage,
        slot: item.variant.slot,
        priority: item.variant.priority,
        requiresStudentName: item.variant.requiresStudentName,
        effectiveAt: item.effectiveAt ?? item.createdAt,
      })),
      {
        id: version.id,
        locale: version.variant.locale,
        stage: version.variant.curriculumStage,
        slot: version.variant.slot,
        priority: version.variant.priority,
        requiresStudentName: version.variant.requiresStudentName,
        effectiveAt: version.effectiveAt ?? version.createdAt,
      },
    );
    const now = this.clock.now();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.standardMessageVersion.updateMany({
        where: { variantId: version.variantId, status: StandardMessageVersionStatus.PUBLISHED },
        data: { status: StandardMessageVersionStatus.ARCHIVED, archivedAt: now },
      });
      return transaction.standardMessageVersion.update({
        where: { id: versionId },
        data: {
          status: StandardMessageVersionStatus.PUBLISHED,
          publishedAt: now,
          effectiveAt: now,
        },
      });
    });
  }

  archive(versionId: string) {
    return this.prisma.standardMessageVersion.update({
      where: { id: versionId },
      data: { status: StandardMessageVersionStatus.ARCHIVED, archivedAt: this.clock.now() },
    });
  }

  async rollback(variantId: string, versionId: string, sessionId: string) {
    const version = await this.prisma.standardMessageVersion.findFirstOrThrow({
      where: { id: versionId, variantId },
    });
    if (version.status === StandardMessageVersionStatus.DRAFT) {
      throw new Error('Cannot rollback to a draft version.');
    }
    return this.publish(versionId, sessionId);
  }

  upsertProviderBinding(
    variantId: string,
    input: {
      templateName: string;
      providerLocale: string;
      category: string;
      status: ProviderTemplateStatus;
      providerVersion?: string;
    },
  ) {
    return this.prisma.providerTemplateBinding.upsert({
      where: { variantId },
      create: { variantId, ...input, providerLocale: canonicalizeLocale(input.providerLocale) },
      update: {
        ...input,
        providerLocale: canonicalizeLocale(input.providerLocale),
        lastSyncedAt: this.clock.now(),
      },
    });
  }

  private async assertRecentStepUp(sessionId: string): Promise<void> {
    const session = await this.prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
    const threshold = new Date(this.clock.now().getTime() - 10 * 60 * 1000);
    if (!session.stepUpVerifiedAt || session.stepUpVerifiedAt < threshold) {
      throw new Error('Recent TOTP step-up is required.');
    }
  }
}
