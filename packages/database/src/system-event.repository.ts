import {
  bindingMatchesWhatsAppTemplate,
  defaultRegistrationMessages,
  requiresZeroDowntimeWhatsAppTemplate,
  systemEventRegistry,
  validateMessageTemplate,
} from '@meditation/core';
import type { Prisma, PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export async function syncSystemEventRegistry(database: DatabaseClient): Promise<void> {
  const synchronize = async (transaction: Prisma.TransactionClient): Promise<void> => {
    for (const event of [...systemEventRegistry.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    )) {
      await transaction.systemEventDefinition.upsert({
        where: { key: event.key },
        create: {
          key: event.key,
          audience: event.audience,
          channels: [...event.channels],
          variableSchema: event.variableSchema as unknown as Prisma.InputJsonValue,
          complianceClass: event.complianceClass,
          protected: event.protected,
          defaultTtlSeconds: event.defaultTtlSeconds,
        },
        update: {
          audience: event.audience,
          channels: [...event.channels],
          variableSchema: event.variableSchema as unknown as Prisma.InputJsonValue,
          complianceClass: event.complianceClass,
          protected: event.protected,
          defaultTtlSeconds: event.defaultTtlSeconds,
        },
      });
    }
  };
  if ('$transaction' in database) {
    await database.$transaction(synchronize, { maxWait: 5_000, timeout: 30_000 });
  } else {
    await synchronize(database);
  }
}

export async function syncDefaultRegistrationMessages(database: DatabaseClient): Promise<void> {
  const now = new Date();
  const synchronize = async (transaction: Prisma.TransactionClient): Promise<void> => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('default-registration-messages'))`;
    for (const definition of defaultRegistrationMessages) {
      const event = systemEventRegistry.get(definition.eventKey)!;
      const message = await transaction.standardMessage.upsert({
        where: {
          eventKey_name: { eventKey: definition.eventKey, name: 'Sistem varsayilani' },
        },
        create: {
          eventKey: definition.eventKey,
          name: 'Sistem varsayilani',
          audience: event.audience,
          protected: event.protected,
        },
        update: {},
      });
      for (const channel of ['TELEGRAM', 'WHATSAPP'] as const) {
        let variant = await transaction.standardMessageVariant.findFirst({
          where: {
            standardMessageId: message.id,
            channel,
            locale: 'tr-TR',
            curriculumStage: null,
            slot: null,
            requiresStudentName: false,
            priority: -100,
          },
          include: { providerBinding: true },
        });
        if (!variant) {
          variant = await transaction.standardMessageVariant.create({
            data: {
              standardMessageId: message.id,
              channel,
              locale: 'tr-TR',
              priority: -100,
            },
            include: { providerBinding: true },
          });
        }
        const existing = await transaction.standardMessageVersion.findFirst({
          where: { variantId: variant.id, content: definition.content },
        });
        const canRestoreApprovedWhatsAppVersion =
          existing &&
          channel === 'WHATSAPP' &&
          requiresZeroDowntimeWhatsAppTemplate(definition.eventKey) &&
          bindingMatchesWhatsAppTemplate(
            variant.providerBinding,
            definition.eventKey,
            existing.content,
            variant.locale,
          );
        if (canRestoreApprovedWhatsAppVersion) {
          if (existing.status !== 'PUBLISHED') {
            await transaction.standardMessageVersion.updateMany({
              where: { variantId: variant.id, status: 'PUBLISHED' },
              data: { status: 'ARCHIVED', archivedAt: now },
            });
            await transaction.standardMessageVersion.update({
              where: { id: existing.id },
              data: {
                status: 'PUBLISHED',
                effectiveAt: now,
                publishedAt: now,
                archivedAt: null,
              },
            });
          }
          await transaction.standardMessageVersion.updateMany({
            where: {
              variantId: variant.id,
              status: 'DRAFT',
              id: { not: existing.id },
            },
            data: { status: 'ARCHIVED', archivedAt: now },
          });
        }
        if (!existing) {
          const latest = await transaction.standardMessageVersion.aggregate({
            where: { variantId: variant.id },
            _max: { version: true },
          });
          const currentPublished = await transaction.standardMessageVersion.findFirst({
            where: {
              variantId: variant.id,
              status: 'PUBLISHED',
              effectiveAt: { lte: now },
            },
            orderBy: { version: 'desc' },
          });
          const stageUntilWhatsAppApproval =
            channel === 'WHATSAPP' &&
            requiresZeroDowntimeWhatsAppTemplate(definition.eventKey) &&
            currentPublished !== null &&
            bindingMatchesWhatsAppTemplate(
              variant.providerBinding,
              definition.eventKey,
              currentPublished.content,
              variant.locale,
            );
          if (!stageUntilWhatsAppApproval) {
            await transaction.standardMessageVersion.updateMany({
              where: { variantId: variant.id, status: 'PUBLISHED' },
              data: { status: 'ARCHIVED', archivedAt: now },
            });
          }
          await transaction.standardMessageVersion.create({
            data: {
              variantId: variant.id,
              version: (latest._max.version ?? 0) + 1,
              content: definition.content,
              placeholders: validateMessageTemplate(definition.eventKey, definition.content),
              status: stageUntilWhatsAppApproval ? 'DRAFT' : 'PUBLISHED',
              expertApproved: true,
              effectiveAt: stageUntilWhatsAppApproval ? null : now,
              publishedAt: stageUntilWhatsAppApproval ? null : now,
            },
          });
        }
      }
    }
  };
  if ('$transaction' in database) {
    await database.$transaction(synchronize, { maxWait: 5_000, timeout: 30_000 });
  } else {
    await synchronize(database);
  }
}
