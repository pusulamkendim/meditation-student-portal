import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyTelegramWebhookSecret, verifyWhatsAppSignature } from './webhook-security.js';

describe('webhook security', () => {
  it('verifies the WhatsApp signature against exact raw bytes', () => {
    const body = Buffer.from('{"message":"ğ"}');
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifyWhatsAppSignature(body, signature, 'secret')).toBe(true);
    expect(verifyWhatsAppSignature(Buffer.from('{"message":"g"}'), signature, 'secret')).toBe(
      false,
    );
  });

  it('rejects malformed signatures and compares Telegram secrets', () => {
    expect(verifyWhatsAppSignature(Buffer.from('{}'), 'invalid', 'secret')).toBe(false);
    expect(verifyTelegramWebhookSecret('received', 'received')).toBe(true);
    expect(verifyTelegramWebhookSecret('wrong', 'received')).toBe(false);
  });
});
