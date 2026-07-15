import { describe, expect, it } from 'vitest';

import { registrationQuickReplies } from './registration-inbound.js';

describe('registrationQuickReplies', () => {
  it('offers choices that the registration state machine accepts', () => {
    expect(registrationQuickReplies('PRIVACY_NOTICE_SENT')).toEqual([
      { id: 'ONAYLIYORUM', title: 'Onaylıyorum' },
    ]);
    expect(registrationQuickReplies('CHANNEL_OPT_IN_REQUEST')).toEqual([
      { id: 'EVET', title: 'Evet' },
    ]);
    expect(registrationQuickReplies('AGENT_REPLY_AI_CONSENT_REQUEST')).toEqual([
      { id: 'EVET', title: 'Evet' },
      { id: 'HAYIR', title: 'Hayır' },
    ]);
    expect(registrationQuickReplies('PAYMENT_INSTRUCTIONS')).toEqual([
      { id: 'ÖDEME YAPTIM', title: 'Ödeme yaptım' },
    ]);
  });

  it('does not add decorative buttons to events without a deterministic action', () => {
    expect(registrationQuickReplies('NAME_REQUEST')).toBeUndefined();
    expect(registrationQuickReplies('PAYMENT_REPORTED')).toBeUndefined();
  });
});
