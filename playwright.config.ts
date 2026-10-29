import { defineConfig, devices } from '@playwright/test';

/**
 * P0-T10: smoke coverage only — every user flow gets full e2e from P2 onwards.
 * mobile (390×844 touch) and desktop (1280×800) run every spec in e2e/.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 15'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm --filter @tiwa/web start' : 'pnpm --filter @tiwa/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Local dev output goes to .next-dev so `.next` always holds the
    // production build perf/size run against. CI tests the prod build.
    ...(process.env.CI ? {} : { env: { NEXT_DIST_DIR: '.next-dev' } }),
  },
});
