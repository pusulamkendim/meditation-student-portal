#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { URLSearchParams } from 'node:url';

const RESOURCES = {
  api: 'pc393rw7valhdz3mo8n0q7zn',
  worker: 'pky94uoyi5r2lm1qsdsduobc',
  admin: 'wd45ufa1ta1zkougz081a3qv',
};

if (process.env.SAKINZIHIN_WEB_COOLIFY_RESOURCE) {
  RESOURCES['sakinzihin-web'] = process.env.SAKINZIHIN_WEB_COOLIFY_RESOURCE;
}

const TERMINAL_STATUSES = new Set(['finished', 'failed', 'cancelled', 'cancelled-by-user']);
const SUCCESS_STATUS = 'finished';
const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 30 * 60 * 1_000;

const args = process.argv.slice(2);
const force = args.includes('--force');
const noWait = args.includes('--no-wait');
const requested = args.filter((arg) => !arg.startsWith('--'));
const targets = requested.includes('all')
  ? ['api', 'worker', 'admin', ...(RESOURCES['sakinzihin-web'] ? ['sakinzihin-web'] : [])]
  : requested;

if (targets.length === 0 || targets.some((target) => !(target in RESOURCES))) {
  console.error(
    'Kullanim: pnpm deploy:coolify <api|worker|admin|sakinzihin-web|all> [--no-wait] [--force]',
  );
  process.exit(1);
}

const token = process.env.COOLIFY_TOKEN ?? process.env.COOLIFY_ACCESS_TOKEN;
const baseUrl = (process.env.COOLIFY_BASE_URL ?? 'https://coolify.pusulamkendim.com').replace(
  /\/$/,
  '',
);

if (!token) {
  console.error('COOLIFY_TOKEN veya COOLIFY_ACCESS_TOKEN tanimli degil.');
  process.exit(1);
}

async function coolify(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Coolify HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function waitForDeployment(target, deploymentUuid) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await delay(POLL_INTERVAL_MS);
    const deployment = await coolify(`/api/v1/deployments/${deploymentUuid}`);
    const status = deployment.status;

    process.stdout.write(`\r${target}: ${status}   `);
    if (!TERMINAL_STATUSES.has(status)) {
      continue;
    }

    process.stdout.write('\n');
    if (status !== SUCCESS_STATUS) {
      throw new Error(`${target} deploy basarisiz: ${status}`);
    }
    return;
  }

  throw new Error(`${target} deploy 30 dakika icinde tamamlanmadi.`);
}

for (const target of targets) {
  const params = new URLSearchParams({ uuid: RESOURCES[target] });

  // Coolify's API coerces the non-empty query string "false" to true.
  // Preserve cache by omitting force entirely unless explicitly requested.
  if (force) {
    params.set('force', '1');
  }

  const result = await coolify(`/api/v1/deploy?${params.toString()}`);
  const deployment = result?.deployments?.[0];
  const deploymentUuid = deployment?.deployment_uuid;

  if (!deploymentUuid) {
    throw new Error(`${target} icin deployment UUID donmedi: ${JSON.stringify(result)}`);
  }

  console.log(`${target}: ${deploymentUuid} kuyruga alindi.`);
  if (!noWait) {
    await waitForDeployment(target, deploymentUuid);
  }
}
