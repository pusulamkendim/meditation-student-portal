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
});
