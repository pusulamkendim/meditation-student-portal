import { randomBytes } from 'node:crypto';
import process from 'node:process';

const encryptionKeyId = 'local-m1';
const encryptionKey = randomBytes(32).toString('base64');

process.stdout.write(
  [
    `DATA_ENCRYPTION_KEYS_JSON={"${encryptionKeyId}":"${encryptionKey}"}`,
    `ACTIVE_DATA_KEY_ID=${encryptionKeyId}`,
    `LOOKUP_HMAC_KEY=${randomBytes(32).toString('base64')}`,
    `ADMIN_SESSION_HMAC_KEY=${randomBytes(32).toString('base64')}`,
  ].join('\n') + '\n',
);
