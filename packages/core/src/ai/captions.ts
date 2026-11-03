import { eventTypeLabel } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { isEnabled } from '../flags/flags.js';

// Auto alt text for Moments photos (PRD AI-05, P15-T06). A worker sweep
// captions recent images that have no alt text yet; a caption someone typed
// is never overwritten. Fills accessibility text only — never shown as a
// caption or used to identify people.

export interface Captioner {
  caption(context: { eventType: string; album: 'OFFICIAL' | 'GUEST'; image: string }): Promise<string | null>;
}

const LOOKBACK_MS = 7 * 86_400_000;

/**
 * Caption up to `limit` photos. `readImage` returns a small image (data: URL)
 * for a media item, or null to skip it.
 */
export async function captionPendingMedia(
  captioner: Captioner,
  readImage: (item: { id: string; thumbKey: string | null; largeKey: string | null }) => Promise<string | null>,
  limit = 20,
  now = new Date(),
): Promise<{ captioned: number; skipped: number }> {
  const items = await prisma.mediaItem.findMany({
    where: {
      kind: 'PHOTO',
      deletedAt: null,
      state: { in: ['PUBLISHED', 'PENDING_REVIEW'] },
      altText: null,
      createdAt: { gte: new Date(now.getTime() - LOOKBACK_MS) },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      album: true,
      thumbKey: true,
      largeKey: true,
      gallery: { select: { event: { select: { type: true, typeLabel: true, countryCode: true } } } },
    },
  });
  let captioned = 0;
  let skipped = 0;
  const flags = new Map<string, boolean>();
  for (const item of items) {
    const event = item.gallery.event;
    if (!flags.has(event.countryCode)) flags.set(event.countryCode, await isEnabled('ai.enabled', event.countryCode));
    if (!flags.get(event.countryCode)) {
      skipped += 1;
      continue;
    }
    const image = await readImage(item).catch(() => null);
    if (!image) {
      skipped += 1;
      continue;
    }
    const alt = await captioner
      .caption({ eventType: eventTypeLabel(event), album: item.album as 'OFFICIAL' | 'GUEST', image })
      .catch(() => null);
    if (!alt) {
      skipped += 1;
      continue;
    }
    // Only fill an empty alt text: never overwrite one a person wrote meanwhile.
    const updated = await prisma.mediaItem.updateMany({
      where: { id: item.id, altText: null },
      data: { altText: alt.slice(0, 200) },
    });
    captioned += updated.count;
  }
  return { captioned, skipped };
}
