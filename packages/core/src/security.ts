import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const algorithm = 'aes-256-gcm';
const nonceLength = 12;
const tagLength = 16;

export interface EncryptedValue {
  ciphertext: Buffer;
  keyId: string;
}

export class FieldEncryption {
  constructor(
    private readonly keys: ReadonlyMap<string, Buffer>,
    private readonly activeKeyId: string,
  ) {
    const activeKey = keys.get(activeKeyId);
    if (!activeKey || activeKey.length !== 32) {
      throw new Error('Active encryption key must exist and contain exactly 32 bytes.');
    }
    for (const key of keys.values()) {
      if (key.length !== 32) throw new Error('Every encryption key must contain exactly 32 bytes.');
    }
  }

  encrypt(plaintext: string, associatedData?: string): EncryptedValue {
    const nonce = randomBytes(nonceLength);
    const cipher = createCipheriv(algorithm, this.keys.get(this.activeKeyId)!, nonce, {
      authTagLength: tagLength,
    });
    if (associatedData) cipher.setAAD(Buffer.from(associatedData));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      keyId: this.activeKeyId,
      ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
    };
  }

  decrypt(value: EncryptedValue, associatedData?: string): string {
    const key = this.keys.get(value.keyId);
    if (!key) throw new Error(`Encryption key is unavailable: ${value.keyId}`);
    const nonce = value.ciphertext.subarray(0, nonceLength);
    const tag = value.ciphertext.subarray(nonceLength, nonceLength + tagLength);
    const encrypted = value.ciphertext.subarray(nonceLength + tagLength);
    const decipher = createDecipheriv(algorithm, key, nonce, { authTagLength: tagLength });
    if (associatedData) decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}

export class LookupHmac {
  constructor(private readonly key: Buffer) {
    if (key.length < 32) throw new Error('HMAC key must contain at least 32 bytes.');
  }

  digest(value: string): string {
    return createHmac('sha256', this.key).update(value.normalize('NFKC')).digest('hex');
  }

  verify(value: string, expectedHexDigest: string): boolean {
    const actual = Buffer.from(this.digest(value), 'hex');
    const expected = Buffer.from(expectedHexDigest, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

const sensitiveAuditKey = /(password|secret|token|content|message|phone|email|proof|url)/i;

export function sanitizeAuditDiff(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveAuditKey.test(key) ? '[REDACTED]' : entry,
    ]),
  );
}
