import type { Prisma } from '@tiwa/db';
import { shortCode } from '../shared/ids.js';
import { syncGalleryPlanTx } from './plans.js';

// Gallery auto-creation (Backend.md §6: finalizeEvent creates the gallery).
// Codes are short for URLs (/m/{code}) and printed cards; collisions retry.
// Going live also stamps plan limits + retention (P5-T12) — never downgrades.

export async function ensureGallery(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<{ id: string; code: string }> {
  const existing = await tx.gallery.findUnique({ where: { eventId }, select: { id: true, code: true } });
  if (existing) {
    await syncGalleryPlanTx(tx, eventId);
    return existing;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await tx.gallery.create({
        data: { eventId, code: shortCode(8), accessCode: shortCode(6) },
        select: { id: true, code: true },
      });
      await syncGalleryPlanTx(tx, eventId);
      return created;
    } catch (error) {
      if (attempt === 2) throw error;
      continue;
    }
  }
  throw new Error('gallery code collision');
}
