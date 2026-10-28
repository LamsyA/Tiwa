// Server-side Sentry. Guarded: no DSN (local dev) means no-op.
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@tiwa/core';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1,
    beforeSend: (event) => scrubSentryEvent(event),
  });
}
