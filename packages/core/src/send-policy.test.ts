import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import { evaluateSendPolicy } from './send-policy.js';
describe('send policy', () => {
  it('requires an approved template outside the WhatsApp window', () => {
    const clock = new FakeClock('2026-07-11T12:00:00Z');
    const base = {
      dueAt: new Date('2026-07-11T11:00:00Z'),
      expiresAt: new Date('2026-07-11T13:00:00Z'),
      studentActive: true,
      messagingEnabled: true,
      identityActive: true,
      channel: 'WHATSAPP' as const,
      lastInboundAt: new Date('2026-07-10T10:00:00Z'),
      approvedTemplate: false,
      aggregateVersionMatches: true,
    };
    expect(evaluateSendPolicy(base, clock)).toEqual({
      allowed: false,
      reason: 'WHATSAPP_TEMPLATE_REQUIRED',
    });
    expect(evaluateSendPolicy({ ...base, approvedTemplate: true }, clock)).toEqual({
      allowed: true,
    });
  });
});
