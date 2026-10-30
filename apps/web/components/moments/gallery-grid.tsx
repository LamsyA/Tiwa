'use client';

import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@tiwa/ui';

export interface GalleryGridItem {
  id: string;
  album: 'OFFICIAL' | 'GUEST';
  kind: 'PHOTO' | 'VIDEO';
  thumbUrl: string | null;
  largeUrl: string | null;
  posterUrl: string | null;
  blurDataUrl: string | null;
  width: number | null;
  height: number | null;
  featured: boolean;
  mine: boolean;
  createdAt: string;
}

interface ApiPage {
  ok: boolean;
  data?: { items: GalleryGridItem[]; nextCursor: string | null };
}

async function fetchPage(code: string, album: string, cursor: string | null, access: string): Promise<ApiPage> {
  const params = new URLSearchParams({ album, limit: '60' });
  if (cursor) params.set('cursor', cursor);
  if (access) params.set('access', access);
  const response = await fetch(`/api/gallery/${code}/media?${params.toString()}`);
  return (await response.json().catch(() => ({ ok: false }))) as ApiPage;
}

const COLS = 3;

function tileSrc(item: GalleryGridItem): string | null {
  return item.thumbUrl ?? item.largeUrl ?? item.posterUrl;
}

function Tile({ item, index, onOpen }: { item: GalleryGridItem; index: number; onOpen: (index: number) => void }) {
  const src = tileSrc(item);
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      data-mine={item.mine ? 'true' : undefined}
      aria-label={`Open photo ${item.id}`}
      className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-2"
    >
      {src ? (
        // Plain img (not next/image): CDN-signed URLs with
        // per-item tokens can't use the global loader, and
        // thumbs are already sized 320px server-side.
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span className="text-muted flex size-full items-center justify-center text-xs">Processing…</span>
      )}
      {item.kind === 'VIDEO' && (
        <span aria-hidden className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[11px] text-white">
          ▶
        </span>
      )}
    </button>
  );
}

/**
 * Virtualised guest gallery grid (P5-T06, UF-10-6): windowed rows keep the
 * DOM near ~200 tiles with thousands of items; off-screen rows recycle.
 * Square thumbs (object-cover) keep row math exact; the lightbox shows the
 * full 1080 derivative. "My uploads" filters to the viewer's session rows.
 */
export function GalleryGrid({
  code,
  album,
  access,
  initialItems,
  initialCursor,
}: {
  code: string;
  album: 'OFFICIAL' | 'GUEST';
  access: string;
  initialItems: GalleryGridItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = React.useState(initialItems);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [mineOnly, setMineOnly] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Static-first render: the server and the first paint show plain grid
  // HTML (photos visible with no JS); after mount the virtualizer takes
  // over and recycles rows. Hydration matches because the first client
  // render is also static.
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Album switches remount via key, but keep state in sync for refreshes.
  const firstLoad = React.useRef(true);
  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setItems(initialItems);
    setCursor(initialCursor);
    setLightbox(null);
  }, [initialItems, initialCursor]);

  const visible = React.useMemo(() => (mineOnly ? items.filter((item) => item.mine) : items), [items, mineOnly]);
  const mineCount = React.useMemo(() => items.filter((item) => item.mine).length, [items]);
  const rowCount = Math.ceil(visible.length / COLS);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual's API intentionally returns unstable functions
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 128,
    overscan: 4,
  });

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(code, album, cursor, access);
      if (page.ok && page.data) {
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...(page.data?.items ?? []).filter((item) => !seen.has(item.id))];
        });
        setCursor(page.data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [code, album, access, cursor, loadingMore]);

  // Live pill (gallery-live.tsx) broadcasts refreshes on this event bus.
  React.useEffect(() => {
    const refresh = async () => {
      const page = await fetchPage(code, album, null, access);
      if (page.ok && page.data) {
        setItems(page.data.items);
        setCursor(page.data.nextCursor);
      }
    };
    const onRefresh = () => void refresh();
    window.addEventListener('gallery:refresh', onRefresh);
    return () => window.removeEventListener('gallery:refresh', onRefresh);
  }, [code, album, access]);

  const virtualRows = virtualizer.getVirtualItems();
  const lastRow = virtualRows[virtualRows.length - 1];
  React.useEffect(() => {
    if (lastRow && lastRow.index >= rowCount - 2) void loadMore();
  }, [lastRow, rowCount, loadMore]);

  const openAt = (index: number) => setLightbox(index);
  const close = () => setLightbox(null);
  const step = (delta: number) =>
    setLightbox((current) => (current === null ? current : (current + delta + visible.length) % visible.length));

  React.useEffect(() => {
    if (lightbox === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (visible.length === 0) {
    return (
      <EmptyState
        title={mineOnly ? 'No uploads from you yet' : 'No photos yet'}
        body={mineOnly ? 'Tap Add photos to share the first one.' : 'Be the first to share a moment.'}
      />
    );
  }

  const active = lightbox !== null ? visible[lightbox] : undefined;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMineOnly(false)}
          aria-pressed={!mineOnly}
          className={
            !mineOnly
              ? 'rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium'
              : 'rounded-full px-3 py-1.5 text-sm text-muted'
          }
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setMineOnly(true)}
          aria-pressed={mineOnly}
          className={
            mineOnly
              ? 'rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium'
              : 'rounded-full px-3 py-1.5 text-sm text-muted'
          }
        >
          My uploads{mineCount > 0 ? ` (${mineCount})` : ''}
        </button>
      </div>
      <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto" role="feed" aria-label="Gallery photos">
        {!mounted ? (
          <div className="grid grid-cols-3 gap-1">
            {visible.map((item, index) => (
              <Tile key={item.id} item={item} index={index} onOpen={openAt} />
            ))}
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualRows.map((row) => (
              <div
                key={row.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <div className="grid grid-cols-3 gap-1 pb-1">
                  {Array.from({ length: COLS }, (_, col) => {
                    const item = visible[row.index * COLS + col];
                    if (!item) return <div key={`empty-${col}`} />;
                    return <Tile key={item.id} item={item} index={row.index * COLS + col} onOpen={openAt} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {cursor && !mineOnly && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-3 w-full rounded-md border border-border py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Show more'}
        </button>
      )}
      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close viewer"
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-2 text-white"
          >
            ✕
          </button>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            className="absolute left-2 rounded-full bg-white/10 px-3 py-2 text-white"
          >
            ‹
          </button>
          <div onClick={(event) => event.stopPropagation()} className="max-h-full max-w-full">
            {active.kind === 'VIDEO' ? (
              <video
                src={active.largeUrl ?? active.thumbUrl ?? ''}
                poster={active.posterUrl ?? undefined}
                controls
                playsInline
                className="max-h-[85vh] max-w-full rounded-lg"
              />
            ) : (
              <img
                src={active.largeUrl ?? active.thumbUrl ?? ''}
                alt=""
                className="max-h-[85vh] max-w-full rounded-lg object-contain"
              />
            )}
          </div>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            className="absolute right-2 rounded-full bg-white/10 px-3 py-2 text-white"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
