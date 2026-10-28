import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component tests (Testing Library + jsdom) arrive in P1; node env covers
    // shared logic until then.
    include: ['{app,lib,components}/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
