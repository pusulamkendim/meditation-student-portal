import { createHmac, timingSafeEqual } from 'node:crypto';

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeCompare(signatureHeader, expected);
}

export function verifyTelegramWebhookSecret(
  received: string | undefined,
  expected: string,
): boolean {
  return received !== undefined && safeCompare(received, expected);
}
