import { describe, expect, it } from 'vitest';

import { shouldRouteToPractice } from './inbound-routing.js';

describe('shouldRouteToPractice', () => {
  it('routes only signed or legacy callback payloads directly to practice', () => {
    expect(
      shouldRouteToPractice({
        text: 'practice:session:nonce:COMPLETED',
        hasAwaitingPractice: false,
      }),
    ).toBe(true);
    expect(
      shouldRouteToPractice({
        text: 'p:EAAAAAAAAAAAAAAAAAAAAw:1234567890123456:c',
        hasAwaitingPractice: true,
      }),
    ).toBe(true);
    expect(shouldRouteToPractice({ text: 'yaptım', hasAwaitingPractice: true })).toBe(false);
  });

  it('sends human-written replies through channel intent classification', () => {
    expect(
      shouldRouteToPractice({
        text: 'Bugün yapamadım',
        replyEvent: 'PRACTICE_CHECKIN',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
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
    expect(
      shouldRouteToPractice({
        text: 'Görüşmem ne zaman?',
        recentEvent: 'PRACTICE_CHECKIN',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
    expect(
      shouldRouteToPractice({
        text: 'Ödemem onaylandı mı?',
        replyEvent: 'PRACTICE_CHECKIN',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
    expect(
      shouldRouteToPractice({
        text: 'Teşekkür ederim',
        recentEvent: 'PRACTICE_CHECKIN',
        hasAwaitingPractice: true,
      }),
    ).toBe(false);
  });

  it('does not route recent practice context without a callback payload', () => {
    expect(
      shouldRouteToPractice({
        text: 'Odaklanmakta zorlandım',
        recentEvent: 'PRACTICE_REFLECTION_REQUEST',
        hasAwaitingPractice: false,
      }),
    ).toBe(false);
  });
});
