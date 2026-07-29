import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/admin/e2e',
  outputDir: './test-results/playwright',
  fullyParallel: false,
  workers: 2,
  timeout: 60_000,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3001',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm dev:admin',
    url: 'http://localhost:3001/read',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
