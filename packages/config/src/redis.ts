// Redis connection options from a URL (D-X57). Managed hosts that route by TLS
// servername (Layerbase) refuse connections without SNI, and ioredis does not
// send it from a `rediss://` URL on its own. Spread this into every client:
//   new Redis(url, { ...redisTls(url), maxRetriesPerRequest: null })

export function redisTls(url: string): { tls?: { servername: string } } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'rediss:') return {};
    return { tls: { servername: parsed.hostname } };
  } catch {
    return {};
  }
}
