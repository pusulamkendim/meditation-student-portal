/* global process, URL */

import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const apiImagePattern = (() => {
  try {
    const url = new URL(apiOrigin);
    return {
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
  } catch {
    return undefined;
  }
})();

/** @type {import('next').NextConfig} */
export default (phase) => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
  poweredByHeader: false,
  images: apiImagePattern ? { remotePatterns: [apiImagePattern] } : undefined,
});
