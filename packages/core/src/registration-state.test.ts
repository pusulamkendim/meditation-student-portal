import { describe, expect, it } from 'vitest';
import { normalizeExactCommand, transitionRegistration } from './registration-state.js';
describe('registration state machine', () => {
  it('allows registration without AI consent', () => {
    expect(transitionRegistration('AI_PREFERENCE', 'AI_DECLINED')).toBe('NAME');
    expect(() => transitionRegistration('PAYMENT_REVIEW', 'NAME_RECEIVED')).toThrow('invalid');
  });
  it('normalizes only exact critical commands', () => {
    expect(normalizeExactCommand(' kayıt ')).toBe('KAYIT');
    expect(normalizeExactCommand('riza iptal')).toBe('RIZA_IPTAL');
    expect(normalizeExactCommand('rıza iptal')).toBe('RIZA_IPTAL');
  });
});
