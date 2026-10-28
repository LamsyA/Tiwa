import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
  webpack(config) {
    // Packages are authored NodeNext-style (./x.js for ./x.ts). Teach webpack
    // the same mapping TS/tsx already understand.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  // No org/auth in P0: sourcemap upload stays off so builds are hermetic.
  // org/project/sentryUrl land with real keys (P17 production config).
  telemetry: false,
  sourcemaps: { disable: true },
});
