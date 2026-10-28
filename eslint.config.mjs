// ESLint flat config (P0-T03). Next.js rules land with apps/web in P0-T04.
// Dependency boundaries from arc.md §3 are enforced with core
// `no-restricted-imports` (works on both relative and `@tiwa/*` specifiers,
// no resolver needed). Import ordering/cycle rules arrive with the web app.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Boundary matrix: which internal packages each area may import.
// apps/web may import everything. apps/worker may import everything except UI.
const boundary = (allowed) => [
  {
    group: ['@tiwa/*'],
    message: `Boundary violation: this area may only import ${allowed.join(', ')}.`,
  },
  {
    group: ['../*', '../../*', '../../../*'],
    message: `Boundary violation: do not reach across packages with relative imports — use ${allowed.join(', ')}.`,
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // packages/config: leaf, no internal imports
  {
    files: ['packages/config/**/*.{ts,tsx,mjs,cjs,js}'],
    rules: { 'no-restricted-imports': ['error', ...boundary(['(nothing — leaf package)'])] },
  },
  // packages/db: config only
  {
    files: ['packages/db/**/*.{ts,tsx,mjs,cjs,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tiwa/*', '!@tiwa/config', '!@tiwa/config/*'],
              message: 'packages/db may only import @tiwa/config.',
            },
            { group: ['../*'], message: 'packages/db must not reach across packages with relative imports.' },
          ],
        },
      ],
    },
  },
  // packages/core: config + db only
  {
    files: ['packages/core/**/*.{ts,tsx,mjs,cjs,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tiwa/*', '!@tiwa/config', '!@tiwa/config/*', '!@tiwa/db', '!@tiwa/db/*'],
              message: 'packages/core may only import @tiwa/config and @tiwa/db.',
            },
            { group: ['../*'], message: 'packages/core must not reach across packages with relative imports.' },
          ],
        },
      ],
    },
  },
  // packages/ui: config only (shared components stay presentation-only)
  {
    files: ['packages/ui/**/*.{ts,tsx,mjs,cjs,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tiwa/*', '!@tiwa/config', '!@tiwa/config/*'],
              message: 'packages/ui may only import @tiwa/config.',
            },
            { group: ['../*'], message: 'packages/ui must not reach across packages with relative imports.' },
          ],
        },
      ],
    },
  },
  // Infra packages: config only
  ...['storage', 'messaging', 'payments', 'moderation', 'ai'].map((pkg) => ({
    files: [`packages/${pkg}/**/*.{ts,tsx,mjs,cjs,js}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tiwa/*', '!@tiwa/config', '!@tiwa/config/*'],
              message: `packages/${pkg} may only import @tiwa/config.`,
            },
            { group: ['../*'], message: `packages/${pkg} must not reach across packages with relative imports.` },
          ],
        },
      ],
    },
  })),
  // apps/worker: everything except UI
  {
    files: ['apps/worker/**/*.{ts,tsx,mjs,cjs,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@tiwa/ui', '@tiwa/ui/*'], message: 'apps/worker must not import @tiwa/ui.' }],
        },
      ],
    },
  },
  // apps/web: may import everything (no boundary rule; Next rules added in P0-T04)
  // scripts: tooling, unrestricted
  {
    files: ['scripts/**/*.{ts,mjs,cjs,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
