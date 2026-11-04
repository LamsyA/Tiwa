import path from 'node:path';
import { withSentryConfig } from '@sentry/nextjs/config';
import withBundleAnalyzer from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const withAnalyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === '1' });
const withSerwist = withSerwistInit({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' });

const nextConfig: NextConfig = {
  // The dev badge adds a "Next.js Dev Tools" button that collides with "Next" in e2e locators.
  ...(process.env.E2E_TEST_HOOKS === '1' ? { devIndicators: false as const } : {}),
  reactStrictMode: true,
  // Sign-in photo uses quality 90 (D-X63); everything else the default 75.
  images: { qualities: [75, 90] },
  // Playwright boots `next dev` locally (CI uses `next start`); keep dev
  // output out of `.next` so perf/size always see the production build.
  // Set via the Playwright webServer env below.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Workspace packages ship TypeScript source (consumed via @tiwa/* aliases).
  transpilePackages: [
    '@tiwa/ai',
    '@tiwa/config',
    '@tiwa/core',
    '@tiwa/db',
    '@tiwa/messaging',
    '@tiwa/moderation',
    '@tiwa/payments',
    '@tiwa/storage',
    '@tiwa/ui',
  ],
  // Vercel: trace from the monorepo root and ship Prisma's query engine with
  // every function; pnpm keeps it outside apps/web, so it is not found otherwise.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**'],
  },
  webpack(config) {
    // Packages are authored NodeNext-style (./x.js for ./x.ts). Teach webpack
    // the same mapping TS/tsx already understand.
    // NOTE: dev/build are pinned to webpack (`--webpack` in package.json)
    // because Turbopack (Next 16 default) cannot express extensionAlias yet.
    // Revisit when it can; then delete this hook and the flags.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default withSentryConfig(withAnalyzer(withNextIntl(withSerwist(nextConfig))), {
  // No org/auth in P0: sourcemap upload stays off so builds are hermetic.
  // org/project/sentryUrl land with real keys (P17 production config).
  telemetry: false,
  sourcemaps: { disable: true },
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
