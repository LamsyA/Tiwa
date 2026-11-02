import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate, type RuntimeCaching } from 'serwist';

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
 * document-only (never RSC — see the P3-T13 note below) so the page opens
 * after one visit with no network. Mutations queue in localStorage and the
 * cache revalidates on every online visit, so it is never older than the
 * last visit; entries expire after 7 days to bound storage.
 */
const dayPages: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && request.mode === 'navigate' && /^\/events\/[^/]+\/day$/.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: 'day-pages',
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
