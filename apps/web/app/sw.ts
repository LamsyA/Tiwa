import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, type RuntimeCaching } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

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
