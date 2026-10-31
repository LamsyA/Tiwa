'use client';

import { Maximize, Minimize } from 'lucide-react';
import * as React from 'react';
import { useTranslations } from 'next-intl';

export interface SlideshowSlide {
  id: string;
  kind: 'PHOTO' | 'VIDEO';
  durationSec: number | null;
  thumbUrl: string | null;
  largeUrl: string | null;
  posterUrl: string | null;
  featured: boolean;
}

const REFRESH_MS = 60_000;

function slideSrc(slide: SlideshowSlide): string | null {
  return slide.largeUrl ?? slide.thumbUrl ?? slide.posterUrl;
}

/**
 * Full-screen slideshow player (P5-T09, UF-12): host's delay, CSS crossfade,
 * muted video clips advancing on `ended`, wake lock while open, 60 s feed
 * refresh so moderation lands within seconds, and a reduced-motion mode
 * (first slide + manual nav, no autoplay).
 */
export function SlideshowPlayer({
  code,
  access,
  initialItems,
  delaySec,
}: {
  code: string;
  access: string;
  initialItems: SlideshowSlide[];
  delaySec: number;
}) {
  const t = useTranslations('gallery');
  const [items, setItems] = React.useState(initialItems);
  const [index, setIndex] = React.useState(0);
  const [exiting, setExiting] = React.useState<SlideshowSlide | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [reduced, setReduced] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Reduced motion: no autoplay, no crossfade — manual navigation only.
  // Lazy initial state keeps the first client render honest; the effect
  // only resubscribes afterwards.
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [setReduced]);

  // Wake lock: keep the venue screen awake while the show runs.
  React.useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (kind: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (!nav.wakeLock) return;
        lock = await nav.wakeLock.request('screen');
        if (cancelled && lock) await lock.release();
      } catch {
        // Unsupported or denied — the show runs without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !lock) void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, []);

  // Feed refresh: pick up newly approved photos and drop hidden ones.
  React.useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const params = new URLSearchParams();
        if (access) params.set('access', access);
        const response = await fetch(`/api/gallery/${code}/slideshow${params.size > 0 ? `?${params}` : ''}`);
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: { items?: SlideshowSlide[] };
        } | null;
        if (response.ok && body?.ok && Array.isArray(body.data?.items)) {
          setItems(body.data.items);
        }
      } catch {
        // Offline — keep showing the cached feed.
      }
    };
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [code, access]);

  const total = items.length;
  const clamped = total === 0 ? 0 : index % total;
  const current = total === 0 ? undefined : items[clamped];

  const advance = React.useCallback(() => {
    setIndex((prev) => {
      const nextTotal = items.length;
      return nextTotal === 0 ? 0 : (prev + 1) % nextTotal;
    });
  }, [items.length]);

  // Photo autoplay: host delay; videos advance on `ended` instead.
  const currentKind = current?.kind;
  React.useEffect(() => {
    if (paused || reduced || total === 0 || currentKind === 'VIDEO') return;
    if (document.visibilityState !== 'visible') return;
    const timer = setTimeout(
      () => {
        setExiting(current ?? null);
        advance();
        setTimeout(() => setExiting(null), 1200);
      },
      Math.max(5, delaySec) * 1000,
    );
    return () => clearTimeout(timer);
  }, [paused, reduced, total, currentKind, current, delaySec, advance]);

  const go = (delta: number) => {
    setExiting(current ?? null);
    setIndex((prev) => (total === 0 ? 0 : (prev + delta + total) % total));
    setTimeout(() => setExiting(null), reduced ? 0 : 1200);
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === ' ') {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  React.useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Pause follows the show pause state (autoPlay only starts playback).
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused || reduced) void el.pause();
    else void el.play().catch(() => undefined);
  }, [paused, reduced, current?.id]);

  if (!current) return null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  };

  const renderSlide = (slide: SlideshowSlide, active: boolean) => {
    if (slide.kind === 'VIDEO') {
      const src = slide.largeUrl ?? slide.thumbUrl;
      if (!src) return null;
      // Keyed by id+active so each arrival replays from the start.
      return (
        <video
          key={`${slide.id}-${active ? 'a' : 'b'}`}
          ref={active ? videoRef : undefined}
          src={src}
          poster={slide.posterUrl ?? undefined}
          muted
          autoPlay={active && !paused && !reduced}
          loop={false}
          playsInline
          controls={paused}
          onEnded={() => {
            if (active) go(1);
          }}
          className="max-h-full max-w-full object-contain"
        />
      );
    }
    const src = slideSrc(slide);
    if (!src) return null;
    return <img src={src} alt="" className="max-h-full max-w-full object-contain" />;
  };

  return (
    <div ref={rootRef} className="bg-black fixed inset-0 z-50 flex items-center justify-center text-white">
      {/* Exiting slide fades out beneath the entering one (skipped for reduced motion). */}
      {exiting && !reduced && (
        <div
          key={`exit-${exiting.id}`}
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-1000"
        >
          {renderSlide(exiting, false)}
        </div>
      )}
      <div key={current.id} className="absolute inset-0 flex items-center justify-center">
        {renderSlide(current, true)}
      </div>
      {/* Controls */}
      <div className="absolute left-0 right-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent p-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t('prevSlide')}
          className="rounded-full bg-white/10 px-3 py-2"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('nextSlide')}
          className="rounded-full bg-white/10 px-3 py-2"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? t('play') : t('pause')}
          aria-pressed={paused}
          className="rounded-full bg-white/10 px-3 py-2 text-sm"
        >
          {paused ? '▶' : '⏸'}
        </button>
        <div className="flex-1" />
        <span className="text-sm text-white/80" aria-live="polite">
          {t('slideCounter', { index: clamped + 1, total })}
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          className="rounded-full bg-white/10 px-3 py-2 text-sm"
        >
          {isFullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
