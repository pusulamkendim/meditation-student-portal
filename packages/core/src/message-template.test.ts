import { describe, expect, it } from 'vitest';

import { localeFallbackChain } from './localization.js';
import { defaultRegistrationMessages } from './registration-messages.js';
import { renderMessageTemplate, validateMessageTemplate } from './message-template.js';
import { assertNoPublishedVariantConflict, resolveMessageVariant } from './message-resolver.js';
import { getSystemEvent, systemEventKeys } from './system-events.js';

describe('M2 message catalog domain', () => {
  it('seeds every supported event exactly once', () => {
    expect(new Set(systemEventKeys).size).toBe(systemEventKeys.length);
    expect(getSystemEvent('PRACTICE_REMINDER').audience).toBe('STUDENT');
    expect(getSystemEvent('PAYMENT_INSTRUCTIONS').protected).toBe(true);
  });

  it('renders only declared variables', () => {
    expect(
      renderMessageTemplate(
        'PRACTICE_REMINDER',
        '{{startsAtText}} pratiğiniz {{durationText}} sonra başlayacak.',
        { startsAtText: '08:00', durationText: '15 dakika' },
      ),
    ).toBe('08:00 pratiğiniz 15 dakika sonra başlayacak.');
    expect(() => validateMessageTemplate('PRACTICE_REMINDER', '{{studentName}}')).toThrow(
      'Placeholder is not allowed',
    );
    expect(
      renderMessageTemplate(
        'PRACTICE_REMINDER',
        'Merhaba{{studentDisplayName}}, {{startsAtText}} · {{durationText}}',
        { startsAtText: '08:00', durationText: '15 dakika' },
      ),
    ).toBe('Merhaba, 08:00 · 15 dakika');
  });

  it('rejects missing required placeholders and malformed locales', () => {
    expect(() => validateMessageTemplate('PRACTICE_CHECKIN', 'Pratik nasıldı?')).toThrow(
      'Required placeholder is missing',
    );
    expect(localeFallbackChain('TR-tr')).toEqual(['tr-TR', 'tr']);
    expect(() => localeFallbackChain('not_a_locale')).toThrow('Invalid BCP 47 locale');
  });

  it('has an explicit closed variable schema for every event', () => {
    for (const key of systemEventKeys) {
      const schema = getSystemEvent(key).variableSchema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required.every((name) => schema.properties[name])).toBe(true);
    }
  });

  it('keeps every published system default compatible with its event schema', () => {
    for (const message of defaultRegistrationMessages) {
      expect(() => validateMessageTemplate(message.eventKey, message.content)).not.toThrow();
    }
  });

  it('resolves variants deterministically and rejects publish conflicts', () => {
    const general = { id: 'general', locale: 'tr-TR', priority: 0, effectiveAt: new Date(0) };
    const specific = {
      id: 'specific',
      locale: 'tr-TR',
      stage: 'WEEK_2',
      slot: 'MORNING',
      priority: 0,
      effectiveAt: new Date(0),
    };
    expect(
      resolveMessageVariant([general, specific], {
        locale: 'tr-TR',
        stage: 'WEEK_2',
        slot: 'MORNING',
      })?.id,
    ).toBe('specific');
    expect(() =>
      assertNoPublishedVariantConflict([specific], { ...specific, id: 'other' }),
    ).toThrow('same specificity');
  });
});
