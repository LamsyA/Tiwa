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
    // Both CI and local runs serve the production build (D-X09): `next dev`
    // recompiles mid-test and Fast Refresh remounts forms, breaking flows.
    // Locally, scripts/e2e-server.mjs rebuilds only when sources changed.
    command: process.env.CI ? 'pnpm --filter @tiwa/web start' : 'node scripts/e2e-server.mjs',
    url: 'http://localhost:3000',
    // Never reuse a server we didn't start: it may lack the test hooks or be a dev server.
    reuseExistingServer: false,
    timeout: 300_000,
    // E2E_TEST_HOOKS exposes the Fake senders' outbox (codes, links) to tests; see lib/test-hooks.ts.
    env: { E2E_TEST_HOOKS: '1' },
  },
});
