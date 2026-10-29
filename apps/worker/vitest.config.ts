import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
// Job tests reach Postgres; CI sets DATABASE_URL, locally it comes from the root .env.
const rootEnv = path.join(here, '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  // Test against core's source, not a possibly stale dist build.
  resolve: { alias: { '@tiwa/core': path.join(here, '..', '..', 'packages', 'core', 'src', 'index.ts') } },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
