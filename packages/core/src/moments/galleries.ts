import type { Prisma } from '@tiwa/db';
import { shortCode } from '../shared/ids.js';

// Gallery auto-creation (Backend.md §6: finalizeEvent creates the gallery).
// Codes are short for URLs (/m/{code}) and printed cards; collisions retry.

export async function ensureGallery(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<{ id: string; code: string }> {
  const existing = await tx.gallery.findUnique({ where: { eventId }, select: { id: true, code: true } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await tx.gallery.create({
        data: { eventId, code: shortCode(8), accessCode: shortCode(6) },
        select: { id: true, code: true },
      });
    } catch (error) {
      if (attempt === 2) throw error;
      continue;
    }
  }
  throw new Error('gallery code collision');
}
