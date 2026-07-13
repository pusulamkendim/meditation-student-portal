import { describe, expect, it } from 'vitest';

import { shouldRouteToPractice } from './inbound-routing.js';

describe('shouldRouteToPractice', () => {
  it('routes explicit and typed practice responses', () => {
    expect(
      shouldRouteToPractice({ text: 'practice:session:nonce:COMPLETED', hasAwaitingPractice: false }),
    ).toBe(true);
    expect(shouldRouteToPractice({ text: 'yaptım', hasAwaitingPractice: true })).toBe(true);
  });

  it('routes replies only for response-bearing practice events', () => {
    expect(
      shouldRouteToPractice({
        text: 'Bugün yapamadım',
        replyEvent: 'PRACTICE_CHECKIN',
        hasAwaitingPractice: true,
      }),
    ).toBe(true);
    expect(
      shouldRouteToPractice({
        text: 'Teşekkürler',
        replyEvent: 'PRACTICE_RESUMED',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
  });

  it('does not let an unrelated awaiting session capture general messages', () => {
    expect(
      shouldRouteToPractice({
        text: 'İlk görüşmemiz ne zaman?',
        recentEvent: 'PRACTICE_RESCHEDULED',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
  });

  it('uses the latest response-bearing event when there is no explicit reply', () => {
    expect(
      shouldRouteToPractice({
        text: 'Odaklanmakta zorlandım',
        recentEvent: 'PRACTICE_REFLECTION_REQUEST',
        hasAwaitingPractice: false,
      }),
    ).toBe(true);
  });
});
