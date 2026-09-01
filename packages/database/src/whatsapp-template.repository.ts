import type {
  PublishedWhatsAppMessageVariant,
  WhatsAppTemplateBindingInput,
  WhatsAppTemplateSyncStore,
} from '@meditation/core';
import {
  NotificationChannel,
  ProviderTemplateStatus,
  StandardMessageVersionStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export function createPrismaWhatsAppTemplateStore(
  database: DatabaseClient,
): WhatsAppTemplateSyncStore {
  return {
    async listPublishedWhatsAppVariants(): Promise<PublishedWhatsAppMessageVariant[]> {
      const variants = await database.standardMessageVariant.findMany({
        where: { channel: NotificationChannel.WHATSAPP },
        select: {
          id: true,
          locale: true,
          standardMessage: { select: { eventKey: true } },
          providerBinding: {
            select: {
              templateName: true,
              providerLocale: true,
              status: true,
              contentFingerprint: true,
            },
          },
          versions: {
            where: {
              status: StandardMessageVersionStatus.PUBLISHED,
              effectiveAt: { lte: new Date() },
            },
            orderBy: { version: 'desc' },
            take: 1,
            select: { content: true },
          },
        },
      });

      return variants.flatMap((variant) => {
        const version = variant.versions[0];
        if (!version) return [];
        return [
          {
            variantId: variant.id,
            eventKey: variant.standardMessage.eventKey,
            locale: variant.locale,
            content: version.content,
            binding: variant.providerBinding,
          },
        ];
      });
    },

    async upsertWhatsAppTemplateBinding(input: WhatsAppTemplateBindingInput): Promise<void> {
      const status = ProviderTemplateStatus[input.status];
      await database.providerTemplateBinding.upsert({
        where: { variantId: input.variantId },
        create: {
          variantId: input.variantId,
          templateName: input.templateName,
          providerLocale: input.providerLocale,
          category: input.category,
          status,
          providerVersion: input.providerVersion,
          contentFingerprint: input.contentFingerprint,
          lastSyncedAt: new Date(),
        },
        update: {
          templateName: input.templateName,
          providerLocale: input.providerLocale,
          category: input.category,
          status,
          providerVersion: input.providerVersion,
          contentFingerprint: input.contentFingerprint,
          lastSyncedAt: new Date(),
        },
      });
    },
  };
}
