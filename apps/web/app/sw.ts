import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, type RuntimeCaching } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & {
  registration: {
    showNotification: (title: string, options?: Record<string, unknown>) => Promise<void>;
    scope: string;
  };
  clients: {
    matchAll: (options?: Record<string, unknown>) => Promise<{ url: string; focus: () => Promise<unknown> }[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
};

interface ExtendableEventLike extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Dynamic requests are NEVER cached (P3-T13 root cause): Serwist's
 * defaultCache puts header-less NetworkFirst over RSC payloads, page HTML
 * and API GETs. Replaying streamed RSC from cache intermittently wedged
 * client navigations (URL changed, content never arrived) and stored
 * per-user pages on the device for 24 h. Static hashed assets keep the
 * default strategies; offline event pages get targeted caching in P12.
 */
/**
 * Targeted offline shell (P12-T06, UF-24-1): the day timeline is cached
 * document-only (never RSC — see the P3-T13 note below) so a pinned page
 * opens with no network. NetworkFirst (not StaleWhileRevalidate): the cache
 * only ever holds a response that was actually served, so a background
 * revalidation can never regress it behind the live timeline. The pin
 * button stores the current HTML explicitly; entries expire after 7 days.
 */
const dayPages: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && request.mode === 'navigate' && /^\/events\/[^/]+\/day$/.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'day-pages',
      networkTimeoutSeconds: 3,
      plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 3600 })],
    }),
  },
];

const networkOnlyDynamic: RuntimeCaching[] = [
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.headers.get('RSC') === '1',
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
];

const precacheEntries = self.__SW_MANIFEST ?? [];
const serwist = new Serwist({
  precacheEntries,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...dayPages, ...networkOnlyDynamic, ...defaultCache],
});

serwist.addEventListeners();

/** Web push display + tap-through (P13-T03, MSG-15). Payload comes from
 * `messaging/notify`: { title, body, url }. */
self.addEventListener('push', (event) => {
  const data = (event as unknown as { data?: { json?: () => unknown } }).data?.json?.() as
    { title?: string; body?: string; url?: string } | undefined;
  const title = typeof data?.title === 'string' ? data.title : 'Tiwa';
  const body = typeof data?.body === 'string' ? data.body : '';
  const url = typeof data?.url === 'string' ? data.url : '/notifications';
  (event as ExtendableEventLike).waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const target = (event as unknown as { notification: { data?: { url?: string }; close: () => void } }).notification;
  const url = target.data?.url ?? '/notifications';
  target.close();
  (event as ExtendableEventLike).waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client && client.url.includes(self.registration.scope)) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
