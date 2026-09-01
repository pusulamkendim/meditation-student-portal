import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { createPrismaWhatsAppTemplateStore } from './whatsapp-template.repository.js';

describe('Prisma WhatsApp template store', () => {
  it('offers the newest staged critical version while retaining published history', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'variant-1',
        locale: 'tr-TR',
        standardMessage: { eventKey: 'MEETING_REMINDER_1H' },
        providerBinding: {
          templateName: 'meeting_reminder_1h_tr',
          providerLocale: 'tr',
          status: 'APPROVED',
          contentFingerprint: 'old-fingerprint',
        },
        versions: [
          {
            id: 'version-3',
            version: 3,
            content: 'Yeni {{studentDisplayName}} {{startsAtText}} {{meetUrl}}',
            status: 'DRAFT',
            effectiveAt: null,
          },
          {
            id: 'version-2',
            version: 2,
            content: 'Eski {{studentDisplayName}} {{startsAtText}} {{meetUrl}}',
            status: 'PUBLISHED',
            effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
      },
    ]);
    const database = {
      standardMessageVariant: { findMany },
    } as unknown as Prisma.TransactionClient;

    const variants =
      await createPrismaWhatsAppTemplateStore(database).listPublishedWhatsAppVariants();

    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      content: 'Yeni {{studentDisplayName}} {{startsAtText}} {{meetUrl}}',
      candidateVersionId: 'version-3',
      candidateStatus: 'DRAFT',
      versions: [
        { versionId: 'version-3', status: 'DRAFT' },
        { versionId: 'version-2', status: 'PUBLISHED' },
      ],
    });
  });

  it('atomically reactivates the approved historical version and stages the candidate', async () => {
    const bindingUpsert = vi.fn().mockResolvedValue(undefined);
    const versionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const versionUpdate = vi.fn().mockResolvedValue(undefined);
    const database = {
      providerTemplateBinding: { upsert: bindingUpsert },
      standardMessageVersion: {
        updateMany: versionUpdateMany,
        update: versionUpdate,
      },
    } as unknown as Prisma.TransactionClient;

    await createPrismaWhatsAppTemplateStore(database).upsertWhatsAppTemplateBinding({
      variantId: 'variant-1',
      templateName: 'meeting_reminder_1h_tr',
      providerLocale: 'tr',
      category: 'UTILITY',
      status: 'APPROVED',
      providerVersion: 'meta-template-1',
      contentFingerprint: 'historical-fingerprint',
      candidateVersionId: 'version-3',
      activeVersionId: 'version-2',
    });

    expect(bindingUpsert).toHaveBeenCalledOnce();
    expect(versionUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          variantId: 'variant-1',
          id: { not: 'version-2' },
        }),
      }),
    );
    expect(versionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'version-3' },
        data: expect.objectContaining({ status: 'DRAFT', effectiveAt: null }),
      }),
    );
    expect(versionUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'version-2' }),
        data: expect.objectContaining({ status: 'PUBLISHED', archivedAt: null }),
      }),
    );
  });
});
