import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const examplePath = resolve(root, '.env.example');
const targetPath = resolve(root, '.env');

if (existsSync(targetPath)) {
  process.stderr.write('.env already exists; no changes were made.\n');
  process.exit(1);
}

copyFileSync(examplePath, targetPath, constants.COPYFILE_EXCL);
const encryptionKeyId = 'local-m1';
const values = {
  DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({
    [encryptionKeyId]: randomBytes(32).toString('base64'),
  }),
  ACTIVE_DATA_KEY_ID: encryptionKeyId,
  LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
  ADMIN_SESSION_HMAC_KEY: randomBytes(32).toString('base64'),
  ADMIN_EMAIL_FROM: 'admin@example.com',
  ADMIN_ALERT_EMAIL: 'coach@example.com',
};

let environment = readFileSync(targetPath, 'utf8');
for (const [key, value] of Object.entries(values)) {
  environment = environment.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
writeFileSync(targetPath, environment, { encoding: 'utf8', mode: 0o600 });
chmodSync(targetPath, 0o600);
process.stdout.write('Created .env with local-only encryption and HMAC keys.\n');
