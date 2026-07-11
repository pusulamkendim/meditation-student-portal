import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  return encodeBase32(randomBytes(bytes));
}

export function generateTotpCode(secret: string, instant: Date, periodSeconds = 30): string {
  const counter = Math.floor(instant.getTime() / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, instant: Date): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const provided = Buffer.from(code);
  for (const offset of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(generateTotpCode(secret, new Date(instant.getTime() + offset)));
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(8).toString('hex').toUpperCase());
}

function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 TOTP secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}
