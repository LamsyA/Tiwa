import { privateStorage } from './storage.js';

// Signed view URLs for gallery derivatives (P5-T06). Keys never reach the
// browser — every tile and lightbox image goes through a short-lived URL.
export const GALLERY_URL_TTL_SEC = 3600;

export interface SignableMediaItem {
  thumbKey: string | null;
  largeKey: string | null;
  posterKey: string | null;
}

export async function withSignedUrls<T extends SignableMediaItem>(
  items: T[],
): Promise<(T & { thumbUrl: string | null; largeUrl: string | null; posterUrl: string | null })[]> {
  const storage = privateStorage();
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      thumbUrl: item.thumbKey ? await storage.getSignedUrl(item.thumbKey, GALLERY_URL_TTL_SEC) : null,
      largeUrl: item.largeKey ? await storage.getSignedUrl(item.largeKey, GALLERY_URL_TTL_SEC) : null,
      posterUrl: item.posterKey ? await storage.getSignedUrl(item.posterKey, GALLERY_URL_TTL_SEC) : null,
    })),
  );
}
