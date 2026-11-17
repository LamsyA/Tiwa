'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLive } from '@/hooks/use-live.js';

/**
 * Live new-items pill (UF-10-5): the worker publishes to `gallery:{id}` on
 * every processed upload; the pill counts notices and refreshes the grid
 * through the `gallery:refresh` window event (no layout jump).
 */
export function GalleryLivePill({ galleryId, access }: { galleryId: string; access: string }) {
  const t = useTranslations('gallery');
  const router = useRouter();
  const [pending, setPending] = React.useState(0);
  const url = `/api/sse/gallery/${galleryId}${access ? `?access=${encodeURIComponent(access)}` : ''}`;
  useLive(
    url,
    React.useCallback(() => setPending((count) => count + 1), []),
  );
  if (pending === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setPending(0);
        window.dispatchEvent(new CustomEvent('gallery:refresh'));
        // D-X78: album counts are server-rendered; refresh them with the grid.
        router.refresh();
      }}
      className="bg-text text-bg fixed left-1/2 top-16 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-2"
    >
      {pending === 1 ? t('newPhotosOne') : t('newPhotos', { count: pending })}
    </button>
  );
}
