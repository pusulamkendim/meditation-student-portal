import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FieldEncryption, LookupHmac, sanitizeAuditDiff } from './security.js';

describe('security primitives', () => {
  it('encrypts with a key id and rejects incorrect associated data', () => {
    const encryption = new FieldEncryption(new Map([['key-1', randomBytes(32)]]), 'key-1');
    const encrypted = encryption.encrypt('hassas veri', 'student:1');

    expect(encrypted.keyId).toBe('key-1');
    expect(encryption.decrypt(encrypted, 'student:1')).toBe('hassas veri');
    expect(() => encryption.decrypt(encrypted, 'student:2')).toThrow();
  });

  it('creates deterministic lookup digests and constant-time compatible verification', () => {
    const hmac = new LookupHmac(randomBytes(32));
    const digest = hmac.digest('+905428078429');

    expect(hmac.verify('+905428078429', digest)).toBe(true);
    expect(hmac.verify('+905428078420', digest)).toBe(false);
  });

  it('redacts sensitive audit fields', () => {
    expect(sanitizeAuditDiff({ status: 'ACTIVE', phone: '+90542', tokenHash: 'x' })).toEqual({
      status: 'ACTIVE',
      phone: '[REDACTED]',
      tokenHash: '[REDACTED]',
    });
  });
});
