import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import process from 'node:process';

const databaseName = `meditation_e2e_${randomBytes(6).toString('hex')}`;
const databaseUrl = `postgresql://meditation:meditation@localhost:5433/${databaseName}?schema=public`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status ?? 'no status'}`);
}

function dockerSql(sql) {
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'meditation',
    '-d',
    'postgres',
    '-c',
    sql,
  ]);
}

try {
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
  dockerSql(`CREATE DATABASE ${databaseName}`);
  run('pnpm', ['--filter', '@meditation/database', 'exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  run('pnpm', ['--filter', '@meditation/core', 'build']);
  run('pnpm', ['--filter', '@meditation/database', 'build']);
  run('pnpm', ['exec', 'vitest', 'run', 'apps/api/src/e2e/registration.e2e.test.ts'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, RUN_REGISTRATION_E2E: 'true' },
  });
} finally {
  try {
    dockerSql(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  } catch {
    process.exitCode = 1;
  }
}
