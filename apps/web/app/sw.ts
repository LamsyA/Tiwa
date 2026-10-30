import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist, type RuntimeCaching } from 'serwist';

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
  runtimeCaching: [...networkOnlyDynamic, ...defaultCache],
});

serwist.addEventListeners();
