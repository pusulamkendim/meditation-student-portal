import { describe, expect, it } from 'vitest';

import { defaultRegistrationMessages } from './registration-messages.js';

describe('default registration messages', () => {
  it('uses the production privacy notice copy without draft markers', () => {
    const privacyNotice = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'PRIVACY_NOTICE_SENT',
    );

    expect(privacyNotice?.content).toBe(
      'Merhaba, hoş geldin. Sana programını hazırlayabilmem ve süreç boyunca yanında olabilmem için bazı bilgilerini güvenle saklamam gerekiyor.\n\nKVKK bilgilendirmesi: {{privacyNoticeUrl}}\n\nDevam etmek için ONAYLIYORUM yazabilir veya aşağıdaki butonu kullanabilirsin.',
    );
    expect(defaultRegistrationMessages.map((message) => message.content).join('\n')).not.toMatch(
      /\b(?:taslak|draft-v1)\b/iu,
    );
  });

  it('keeps the optional AI consent request concise', () => {
    const aiConsent = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'AGENT_REPLY_AI_CONSENT_REQUEST',
    );

    expect(aiConsent?.content).toBe(
      'Bir tercih daha: Sorularına destek olmak ve pratik sonrası paylaşımlarını değerlendirmek için yapay zekadan yararlanabilirim. Bu özellik isteğe bağlıdır; onay vermesen de programın aynı şekilde devam eder. {{privacyNoticeUrl}} Kabul ediyorsan EVET, istemiyorsan HAYIR yazabilir veya aşağıdaki seçeneği kullanabilirsin.',
    );
  });

  it('uses the exact date instead of a fixed relative day in meeting reminders', () => {
    const meetingReminder = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'MEETING_REMINDER_24H',
    );

    expect(meetingReminder?.content).toContain(
      'Merhaba{{studentDisplayName}}, {{startsAtText}} tarihinde online görüşmemiz var.',
    );
    expect(meetingReminder?.content).not.toMatch(/\b(?:bugün|yarın)\b/iu);
  });

  it('includes weekly and lifetime practice totals in the one-hour meeting reminder', () => {
    const meetingReminder = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'MEETING_REMINDER_1H',
    );

    expect(meetingReminder?.content).toContain(
      '{{weeklyCompletedPracticeCountText}} / {{weeklyPlannedPracticeCountText}}',
    );
    expect(meetingReminder?.content).toContain('{{weeklyCompletedMinutesText}} dakika');
    expect(meetingReminder?.content).toContain('{{weeklyReflectionCountText}}');
    expect(meetingReminder?.content).toContain('{{totalCompletedPracticeCountText}}');
    expect(meetingReminder?.content).toContain('{{totalCompletedMinutesText}} dakika');
  });

  it('combines practice completion acknowledgement and reflection request', () => {
    const reflectionRequest = defaultRegistrationMessages.find(
      (message) => message.eventKey === 'PRACTICE_REFLECTION_REQUEST',
    );

    expect(reflectionRequest?.content).toContain('bugünkü pratiğini tamamladın');
    expect(reflectionRequest?.content).toContain('fark ettiklerini');
    expect(reflectionRequest?.content).toContain('yazılı veya sesli olarak paylaşabilirsin');
    expect(reflectionRequest?.content).not.toContain('?');
    expect(reflectionRequest?.content).not.toContain('Bir sonraki pratiğin');
  });
});
