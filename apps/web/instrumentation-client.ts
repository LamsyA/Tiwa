// Client-side Sentry, loaded lazily so error telemetry never costs
// First Load JS (Frontend.md §9 budgets). Guarded: no DSN means no-op.
// Trade-off: errors in the first ~100 ms before the SDK chunk arrives are missed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void Promise.all([import('@sentry/nextjs'), import('@tiwa/core/shared/sentry.js')]).then(
    ([Sentry, { scrubSentryEvent }]) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        beforeSend: (event) => scrubSentryEvent(event),
      });
    },
  );
}
