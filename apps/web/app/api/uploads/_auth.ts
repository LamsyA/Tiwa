import type { Actor, GallerySessionActor } from '@tiwa/core';
import { verifyGuestSessionCookie } from '@tiwa/core';
import { env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { getCtx } from '@/lib/ctx.js';

export type UploadActor = Extract<Actor, { kind: 'user' }> | GallerySessionActor;

/** Client IP for rate-limit keys (mirrors lib/ctx.ts). */
export function ipOf(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function sessionFromRequest(request: Request, galleryId: string): string | null {
  const secret = env.AUTH_SECRET;
  if (!secret) return null;
  const raw = request.headers.get('cookie') ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)tiwa_gs_${galleryId}=([^;]+)`));
  return verifyGuestSessionCookie(match ? decodeURIComponent(match[1] as string) : undefined, secret);
}

/**
 * Resolve who is uploading. Logged-in members come from their session;
 * guests come from a signed gallery-session cookie (`tiwa_gs_{galleryId}`).
 * Core re-verifies ownership per call (`loadOwnUpload`); this only
 * establishes identity. The gallery id is never trusted from the client
 * except via the signed session.
 */
export async function actorForUpload(
  request: Request,
  opts: { key: string } | { eventId: string } | { mediaId: string },
): Promise<UploadActor | null> {
  const ctx = await getCtx();
  if (ctx.actor && ctx.actor.kind === 'user') return ctx.actor;
  let galleryId: string | undefined;
  if ('key' in opts) {
    const parts = opts.key.split('/');
    galleryId = parts[0] === 'galleries' && parts[1] ? parts[1] : undefined;
  } else if ('mediaId' in opts) {
    const item = await prisma.mediaItem.findUnique({ where: { id: opts.mediaId }, select: { galleryId: true } });
    galleryId = item?.galleryId;
  } else {
    const gallery = await prisma.gallery.findUnique({ where: { eventId: opts.eventId }, select: { id: true } });
    galleryId = gallery?.id;
  }
  if (!galleryId) return null;

  const sessionId = sessionFromRequest(request, galleryId);
  if (!sessionId) return null;
  const session = await prisma.guestSession.findUnique({ where: { id: sessionId } });
  if (!session || session.galleryId !== galleryId || session.blockedAt) return null;
  return { kind: 'gallery-session', sessionId, galleryId };
}
