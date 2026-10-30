'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Invite-link handoff island (P5-T07): the pass page links
 * `/m/{code}?guest={token}`. Server Components can't set cookies, so this
 * island exchanges the token via the claim route, then reloads the clean
 * gallery URL. Failures fall through to the access-code form behind it.
 */
export function ClaimInvite({ code, token, album }: { code: string; token: string; album: string }) {
  const router = useRouter();
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/gallery/${code}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) throw new Error('claim failed');
        router.replace(`/m/${code}?album=${album}`);
        router.refresh();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, token, album, router]);

  if (failed) return null;
  return (
    <p className="text-muted py-8 text-center text-sm" role="status">
      Joining the gallery…
    </p>
  );
}
