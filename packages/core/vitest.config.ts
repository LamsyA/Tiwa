import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests (accounts, orgs, flags) reach Postgres like the apps do.
// CI sets DATABASE_URL in the job env; locally it comes from the root .env.
const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    // DB tests share one database; run files one at a time.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
