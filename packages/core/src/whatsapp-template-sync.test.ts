import { describe, expect, it, vi } from 'vitest';

import { defaultRegistrationMessages } from './registration-messages.js';
import {
  bindingMatchesWhatsAppTemplate,
  buildWhatsAppTemplateDefinition,
  syncWhatsAppTemplates,
  type PublishedWhatsAppMessageVariant,
  type WhatsAppTemplateBindingInput,
  type WhatsAppTemplateSyncStore,
} from './whatsapp-template-sync.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function storeFor(
  variants: PublishedWhatsAppMessageVariant[],
): WhatsAppTemplateSyncStore & { bindings: WhatsAppTemplateBindingInput[] } {
  const bindings: WhatsAppTemplateBindingInput[] = [];
  return {
    bindings,
    listPublishedWhatsAppVariants: vi.fn().mockResolvedValue(variants),
    upsertWhatsAppTemplateBinding: vi.fn(async (input) => {
      bindings.push(input);
    }),
  };
}

describe('WhatsApp template definitions', () => {
  it('creates a stable versioned name and changes it with the message content', () => {
    const first = buildWhatsAppTemplateDefinition(
      'MEETING_REMINDER_1H',
      'Merhaba {{studentDisplayName}}, görüşme {{startsAtText}}.',
      'tr-TR',
    );
    const repeated = buildWhatsAppTemplateDefinition(
      'MEETING_REMINDER_1H',
      'Merhaba {{studentDisplayName}}, görüşme {{startsAtText}}.',
      'tr-TR',
    );
    const changed = buildWhatsAppTemplateDefinition(
      'MEETING_REMINDER_1H',
      'Merhaba {{studentDisplayName}}, görüşmemiz {{startsAtText}}.',
      'tr-TR',
    );

    expect(first.templateName).toMatch(/^meeting_reminder_1h_[a-f0-9]{12}_tr$/);
    expect(repeated).toEqual(first);
    expect(changed.templateName).not.toBe(first.templateName);
    expect(first.components[0]).toMatchObject({
      type: 'BODY',
      text: 'Merhaba {{1}}, görüşme {{2}}.',
      example: { body_text: [['Ayşe', '12 Ağustos 2026 Çarşamba 10:00']] },
    });
  });

  it('can generate a Meta definition for every default message without a target list', () => {
    const definitions = defaultRegistrationMessages.map((message) =>
      buildWhatsAppTemplateDefinition(message.eventKey, message.content, 'tr-TR'),
    );

    expect(definitions).toHaveLength(defaultRegistrationMessages.length);
    expect(new Set(definitions.map((definition) => definition.templateName)).size).toBe(
      definitions.length,
    );
  });

  it('keeps variables away from Meta template body boundaries', () => {
    const startsWithVariable = buildWhatsAppTemplateDefinition(
      'CHANNEL_LINK_CONFIRMED',
      '{{channelName}} numaran doğrulandı.',
      'tr-TR',
    );
    const endsWithVariable = buildWhatsAppTemplateDefinition(
      'PRACTICE_REMINDER',
      'Pratiğini buradan başlatabilirsin: {{practiceUrl}}',
      'tr-TR',
    );

    expect(startsWithVariable.components[0]).toMatchObject({
      type: 'BODY',
      text: 'Merhaba. {{1}} numaran doğrulandı.',
    });
    expect(endsWithVariable.components[0]).toMatchObject({
      type: 'BODY',
      text: 'Pratiğini buradan başlatabilirsin: {{1}}\n\nBu mesaj, planlanan programınla ilgili bilgi vermek amacıyla gönderilmiştir.',
    });
  });

  it('adds fixed text when the Meta variable-to-word ratio would be too high', () => {
    const definition = buildWhatsAppTemplateDefinition(
      'GROUP_MEDITATION_REMINDER_24H',
      '{{studentDisplayName}}, {{groupTitle}} etkinliği {{startsAtText}}: {{meetUrl}} bağlantısı.',
      'tr-TR',
    );

    expect(definition.components[0]).toMatchObject({
      type: 'BODY',
      text: 'Merhaba. {{1}}, {{2}} etkinliği {{3}}: {{4}} bağlantısı.\n\nBu mesaj, planlanan programınla ilgili bilgi vermek amacıyla gönderilmiştir.',
    });
  });
});

describe('WhatsApp template synchronization', () => {
  it('adopts an approved existing template when its remote body still matches', async () => {
    const content = 'Pratik programını güncelledim: {{scheduleSummary}}.';
    const definition = buildWhatsAppTemplateDefinition('PRACTICE_PLAN_UPDATED', content, 'tr-TR');
    const store = storeFor([
      {
        variantId: 'variant-1',
        eventKey: 'PRACTICE_PLAN_UPDATED',
        locale: 'tr-TR',
        content,
        binding: {
          templateName: 'practice_plan_updated_tr',
          providerLocale: 'tr',
          status: 'APPROVED',
          contentFingerprint: null,
        },
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'meta-1',
            name: 'practice_plan_updated_tr',
            language: 'tr',
            category: 'UTILITY',
            status: 'APPROVED',
            components: definition.components,
          },
        ],
      }),
    );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ scanned: 1, submitted: 0, approved: 1, failed: 0 });
    expect(store.bindings[0]).toMatchObject({
      templateName: 'practice_plan_updated_tr',
      status: 'APPROVED',
      contentFingerprint: definition.contentFingerprint,
    });
    expect(
      bindingMatchesWhatsAppTemplate(store.bindings[0], 'PRACTICE_PLAN_UPDATED', content, 'tr-TR'),
    ).toBe(true);
  });

  it('submits a new version and marks it pending when an existing message changes', async () => {
    const content = 'Yeni içerik: {{scheduleSummary}}.';
    const definition = buildWhatsAppTemplateDefinition('PRACTICE_PLAN_UPDATED', content, 'tr-TR');
    const store = storeFor([
      {
        variantId: 'variant-1',
        eventKey: 'PRACTICE_PLAN_UPDATED',
        locale: 'tr-TR',
        content,
        binding: {
          templateName: 'practice_plan_updated_tr',
          providerLocale: 'tr',
          status: 'APPROVED',
          contentFingerprint: 'old-fingerprint',
        },
      },
    ]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'meta-old',
              name: 'practice_plan_updated_tr',
              language: 'tr',
              category: 'UTILITY',
              status: 'APPROVED',
              components: [{ type: 'BODY', text: 'Eski içerik: {{1}}.' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'meta-new', status: 'PENDING', category: 'UTILITY' }),
      );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ scanned: 1, submitted: 1, pending: 1, failed: 0 });
    expect(store.bindings[0]).toMatchObject({
      templateName: definition.templateName,
      status: 'PENDING',
      providerVersion: 'meta-new',
      contentFingerprint: definition.contentFingerprint,
    });
  });

  it('retains a compatible approved practice template while the exact candidate is pending', async () => {
    const content = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'PRACTICE_REMINDER',
    )!.content;
    const definition = buildWhatsAppTemplateDefinition('PRACTICE_REMINDER', content, 'tr-TR');
    const store = storeFor([
      {
        variantId: 'practice-reminder-variant',
        eventKey: 'PRACTICE_REMINDER',
        locale: 'tr-TR',
        content,
        binding: {
          templateName: definition.templateName,
          providerLocale: 'tr',
          status: 'PENDING',
          contentFingerprint: definition.contentFingerprint,
        },
      },
    ]);
    const approvedLegacyTemplate = {
      id: 'meta-approved',
      name: 'practice_reminder_v2_tr',
      language: 'tr',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        {
          type: 'BODY',
          text: 'Merhaba{{1}}, {{2}} saatindeki {{3}} pratiğine 10 dakika kaldı. Hazır olduğunda pratiğini buradan başlatabilirsin: {{4}} Bağlantı 24 saat boyunca kullanılabilir.',
        },
      ],
    };
    const pendingCandidate = {
      id: 'meta-pending',
      name: definition.templateName,
      language: 'tr',
      category: 'UTILITY',
      status: 'PENDING',
      components: definition.components,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [approvedLegacyTemplate, pendingCandidate] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [approvedLegacyTemplate, { ...pendingCandidate, status: 'APPROVED' }],
        }),
      );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ scanned: 1, submitted: 0, approved: 1, pending: 0, failed: 0 });
    expect(result.entries[0]).toMatchObject({
      action: 'retained-approved',
      templateName: 'practice_reminder_v2_tr',
      status: 'APPROVED',
    });
    expect(store.bindings[0]).toMatchObject({
      templateName: 'practice_reminder_v2_tr',
      status: 'APPROVED',
      providerVersion: 'meta-approved',
      contentFingerprint: definition.contentFingerprint,
    });
    expect(
      bindingMatchesWhatsAppTemplate(store.bindings[0], 'PRACTICE_REMINDER', content, 'tr-TR'),
    ).toBe(true);

    const promoted = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(promoted.entries[0]).toMatchObject({
      action: 'synchronized',
      templateName: definition.templateName,
      status: 'APPROVED',
    });
    expect(store.bindings[1]).toMatchObject({
      templateName: definition.templateName,
      status: 'APPROVED',
      providerVersion: 'meta-pending',
      contentFingerprint: definition.contentFingerprint,
    });
  });

  it('does not retain a critical template when its parameter contract is incompatible', async () => {
    const content = 'Pratiğini buradan başlatabilirsin: {{practiceUrl}}';
    const definition = buildWhatsAppTemplateDefinition('PRACTICE_REMINDER', content, 'tr-TR');
    const store = storeFor([
      {
        variantId: 'practice-reminder-variant',
        eventKey: 'PRACTICE_REMINDER',
        locale: 'tr-TR',
        content,
        binding: {
          templateName: definition.templateName,
          providerLocale: 'tr',
          status: 'PENDING',
          contentFingerprint: definition.contentFingerprint,
        },
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'meta-approved',
            name: 'practice_reminder_v2_tr',
            language: 'tr',
            category: 'UTILITY',
            status: 'APPROVED',
            components: [
              {
                type: 'BODY',
                text: 'Merhaba{{1}}, {{2}} saatindeki {{3}} pratiğine 10 dakika kaldı: {{4}}',
              },
            ],
          },
          {
            id: 'meta-pending',
            name: definition.templateName,
            language: 'tr',
            category: 'UTILITY',
            status: 'PENDING',
            components: definition.components,
          },
        ],
      }),
    );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(result).toMatchObject({ scanned: 1, approved: 0, pending: 1, failed: 0 });
    expect(store.bindings[0]).toMatchObject({
      templateName: definition.templateName,
      status: 'PENDING',
      providerVersion: 'meta-pending',
    });
  });

  it('retains a compatible approved meeting template while the exact candidate is pending', async () => {
    const content = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'MEETING_REMINDER_1H',
    )!.content;
    const definition = buildWhatsAppTemplateDefinition('MEETING_REMINDER_1H', content, 'tr-TR');
    const desiredBody = definition.components.find((component) => component.type === 'BODY')!;
    const store = storeFor([
      {
        variantId: 'meeting-reminder-variant',
        eventKey: 'MEETING_REMINDER_1H',
        locale: 'tr-TR',
        content,
        binding: {
          templateName: definition.templateName,
          providerLocale: 'tr',
          status: 'PENDING',
          contentFingerprint: definition.contentFingerprint,
        },
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'meta-approved-meeting',
            name: 'meeting_reminder_1h_v2_tr',
            language: 'tr',
            category: 'UTILITY',
            status: 'APPROVED',
            components: [{ ...desiredBody, text: `${desiredBody.text} Görüşme hatırlatması.` }],
          },
          {
            id: 'meta-pending-meeting',
            name: definition.templateName,
            language: 'tr',
            category: 'UTILITY',
            status: 'PENDING',
            components: definition.components,
          },
        ],
      }),
    );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(result.entries[0]).toMatchObject({
      action: 'retained-approved',
      templateName: 'meeting_reminder_1h_v2_tr',
      status: 'APPROVED',
    });
    expect(store.bindings[0]).toMatchObject({
      templateName: 'meeting_reminder_1h_v2_tr',
      status: 'APPROVED',
      providerVersion: 'meta-approved-meeting',
    });
  });

  it('keeps an approved historical meeting version active until a new parameter contract is approved', async () => {
    const content = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'MEETING_REMINDER_1H',
    )!.content;
    const historicalContent =
      'Merhaba{{studentDisplayName}}, görüşmemize 1 saat kaldı. Görüşme saati: {{startsAtText}}\n\nHazır olduğunda şu Google Meet bağlantısından katılabilirsin:\n{{meetUrl}}\n\nGörüşmede buluşmak üzere.';
    const definition = buildWhatsAppTemplateDefinition('MEETING_REMINDER_1H', content, 'tr-TR');
    const historicalDefinition = buildWhatsAppTemplateDefinition(
      'MEETING_REMINDER_1H',
      historicalContent,
      'tr-TR',
    );
    const store = storeFor([
      {
        variantId: 'meeting-reminder-variant',
        eventKey: 'MEETING_REMINDER_1H',
        locale: 'tr-TR',
        content,
        candidateVersionId: 'meeting-v3',
        candidateStatus: 'PUBLISHED',
        versions: [
          { versionId: 'meeting-v3', content, status: 'PUBLISHED' },
          { versionId: 'meeting-v2', content: historicalContent, status: 'ARCHIVED' },
        ],
        binding: {
          templateName: definition.templateName,
          providerLocale: 'tr',
          status: 'PENDING',
          contentFingerprint: definition.contentFingerprint,
        },
      },
    ]);
    const approvedHistorical = {
      id: 'meta-approved-historical',
      name: 'meeting_reminder_1h_tr',
      language: 'tr',
      category: 'UTILITY',
      status: 'APPROVED',
      components: historicalDefinition.components,
    };
    const pendingCandidate = {
      id: 'meta-pending-candidate',
      name: definition.templateName,
      language: 'tr',
      category: 'UTILITY',
      status: 'PENDING',
      components: definition.components,
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [approvedHistorical, pendingCandidate],
      }),
    );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(result).toMatchObject({ scanned: 1, approved: 1, pending: 0, failed: 0 });
    expect(result.entries[0]).toMatchObject({
      action: 'retained-approved',
      templateName: 'meeting_reminder_1h_tr',
      status: 'APPROVED',
    });
    expect(store.bindings[0]).toMatchObject({
      templateName: 'meeting_reminder_1h_tr',
      status: 'APPROVED',
      contentFingerprint: historicalDefinition.contentFingerprint,
      candidateVersionId: 'meeting-v3',
      activeVersionId: 'meeting-v2',
    });
  });

  it('automatically submits a newly published message that has no hard-coded target', async () => {
    const store = storeFor([
      {
        variantId: 'variant-new',
        eventKey: 'BRAND_NEW_MESSAGE',
        locale: 'tr-TR',
        content: 'Yeni mesaj {{newValue}}',
        binding: null,
      },
    ]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'meta-new', status: 'PENDING' }));

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(result).toMatchObject({ scanned: 1, submitted: 1, pending: 1, failed: 0 });
    expect(store.bindings[0]?.templateName).toMatch(/^brand_new_message_[a-f0-9]{12}_tr$/);
  });

  it('polls approval and promotes the matching template on a later run', async () => {
    const content = 'Yeni mesaj {{newValue}}';
    const definition = buildWhatsAppTemplateDefinition('BRAND_NEW_MESSAGE', content, 'tr-TR');
    const store = storeFor([
      {
        variantId: 'variant-new',
        eventKey: 'BRAND_NEW_MESSAGE',
        locale: 'tr-TR',
        content,
        candidateVersionId: 'message-v2',
        candidateStatus: 'DRAFT',
        versions: [{ versionId: 'message-v2', content, status: 'DRAFT' }],
        binding: {
          templateName: definition.templateName,
          providerLocale: 'tr',
          status: 'PENDING',
          contentFingerprint: definition.contentFingerprint,
        },
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'meta-new',
            name: definition.templateName,
            language: 'tr',
            category: 'UTILITY',
            status: 'APPROVED',
            components: definition.components,
          },
        ],
      }),
    );

    const result = await syncWhatsAppTemplates(store, {
      accessToken: 'token',
      businessAccountId: 'waba-1',
      fetchImpl,
    });

    expect(result.approved).toBe(1);
    expect(store.bindings[0]?.status).toBe('APPROVED');
    expect(store.bindings[0]).toMatchObject({
      candidateVersionId: 'message-v2',
      activeVersionId: 'message-v2',
    });
    expect(
      bindingMatchesWhatsAppTemplate(store.bindings[0], 'BRAND_NEW_MESSAGE', content, 'tr-TR'),
    ).toBe(true);
  });
});
