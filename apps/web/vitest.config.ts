import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Server-side tests only (lib/**). Loads the root .env so integration tests
// can reach Postgres/Redis like the apps do.
process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'));

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    testTimeout: 60000,
    passWithNoTests: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
