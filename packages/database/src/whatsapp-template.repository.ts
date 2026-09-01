import {
  requiresZeroDowntimeWhatsAppTemplate,
  type PublishedWhatsAppMessageVariant,
  type WhatsAppTemplateBindingInput,
  type WhatsAppTemplateSyncStore,
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
      const now = new Date();
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
            where: { expertApproved: true },
            orderBy: { version: 'desc' },
            select: {
              id: true,
              version: true,
              content: true,
              status: true,
              effectiveAt: true,
            },
          },
        },
      });

      return variants.flatMap((variant) => {
        const publishedVersion = variant.versions.find(
          (version) =>
            version.status === StandardMessageVersionStatus.PUBLISHED &&
            version.effectiveAt !== null &&
            version.effectiveAt <= now,
        );
        const stagedVersion = requiresZeroDowntimeWhatsAppTemplate(variant.standardMessage.eventKey)
          ? variant.versions.find(
              (version) =>
                version.status === StandardMessageVersionStatus.DRAFT &&
                (!publishedVersion || version.version > publishedVersion.version),
            )
          : undefined;
        const version = stagedVersion ?? publishedVersion;
        if (!version) return [];
        return [
          {
            variantId: variant.id,
            eventKey: variant.standardMessage.eventKey,
            locale: variant.locale,
            content: version.content,
            candidateVersionId: version.id,
            candidateStatus: version.status,
            versions: variant.versions.map((candidate) => ({
              versionId: candidate.id,
              content: candidate.content,
              status: candidate.status,
            })),
            binding: variant.providerBinding,
          },
        ];
      });
    },

    async upsertWhatsAppTemplateBinding(input: WhatsAppTemplateBindingInput): Promise<void> {
      const status = ProviderTemplateStatus[input.status];
      const synchronize = async (transaction: Prisma.TransactionClient): Promise<void> => {
        const synchronizedAt = new Date();
        await transaction.providerTemplateBinding.upsert({
          where: { variantId: input.variantId },
          create: {
            variantId: input.variantId,
            templateName: input.templateName,
            providerLocale: input.providerLocale,
            category: input.category,
            status,
            providerVersion: input.providerVersion,
            contentFingerprint: input.contentFingerprint,
            lastSyncedAt: synchronizedAt,
          },
          update: {
            templateName: input.templateName,
            providerLocale: input.providerLocale,
            category: input.category,
            status,
            providerVersion: input.providerVersion,
            contentFingerprint: input.contentFingerprint,
            lastSyncedAt: synchronizedAt,
          },
        });

        if (!input.activeVersionId) return;
        await transaction.standardMessageVersion.updateMany({
          where: {
            variantId: input.variantId,
            status: StandardMessageVersionStatus.PUBLISHED,
            id: { not: input.activeVersionId },
          },
          data: { status: StandardMessageVersionStatus.ARCHIVED, archivedAt: synchronizedAt },
        });
        if (input.candidateVersionId && input.candidateVersionId !== input.activeVersionId) {
          await transaction.standardMessageVersion.update({
            where: { id: input.candidateVersionId },
            data: {
              status: StandardMessageVersionStatus.DRAFT,
              effectiveAt: null,
              publishedAt: null,
              archivedAt: null,
            },
          });
        }
        await transaction.standardMessageVersion.updateMany({
          where: {
            id: input.activeVersionId,
            status: { not: StandardMessageVersionStatus.PUBLISHED },
          },
          data: {
            status: StandardMessageVersionStatus.PUBLISHED,
            effectiveAt: synchronizedAt,
            publishedAt: synchronizedAt,
            archivedAt: null,
          },
        });
      };
      if ('$transaction' in database) {
        await database.$transaction(synchronize, { maxWait: 5_000, timeout: 30_000 });
      } else {
        await synchronize(database);
      }
    },
  };
}
