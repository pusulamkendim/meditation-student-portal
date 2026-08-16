import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default (phase) => ({
  // Production builds must not overwrite chunks used by a running local dev server.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(appDirectory, '../..'),
});
