import { describe, expect, it } from 'vitest';

import { generateRecoveryCodes, generateTotpCode, verifyTotpCode } from './totp.js';

describe('TOTP', () => {
  it('generates and verifies a code with a one-step clock tolerance', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const instant = new Date('2026-07-10T18:00:00.000Z');
    const code = generateTotpCode(secret, instant);

    expect(verifyTotpCode(secret, code, new Date(instant.getTime() + 30_000))).toBe(true);
    expect(verifyTotpCode(secret, '000000', instant)).toBe(false);
  });

  it('creates unique one-time recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes)).toHaveLength(10);
  });
});
