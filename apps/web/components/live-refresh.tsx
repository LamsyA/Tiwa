'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * Re-renders the server page every `ms` while the tab is visible (UF-20-2,
 * D-X28): figures update within seconds of a payment without SSE or Redis.
 */
export function LiveRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, ms]);
  return null;
}
