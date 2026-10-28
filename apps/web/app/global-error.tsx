'use client';

// NOTE: no next-intl hook here — global-error replaces the whole tree
// (including providers), so it reads the catalog directly.
// Sentry is dynamically imported so the SDK never joins the First Load
// bundle (the boundary only renders after a crash).
import en from '@/messages/en.json';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            margin: '0 auto',
            maxWidth: 560,
            padding: 24,
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1>{en.errors.genericTitle}</h1>
          <p>{en.errors.genericBody}</p>
          <button type="button" onClick={reset}>
            {en.errors.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
