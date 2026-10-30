import type { Actor, GallerySessionActor } from '@tiwa/core';
import { verifyGuestSessionCookie } from '@tiwa/core';
import { env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { getCtx } from '@/lib/ctx.js';

/** Client IP for rate-limit keys (mirrors lib/ctx.ts). */
export function ipOf(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

type UserActor = Extract<Actor, { kind: 'user' }>;
export type UploadActor = UserActor | GallerySessionActor;

/**
 * Resolve who is uploading: a logged-in member (session cookie) or a guest
 * with a signed gallery-session cookie (`tiwa_gs_{galleryId}`). Returns null
 * when neither is present/valid. Core re-verifies ownership per call.
 */
export async function actorFromRequest(
  request: Request,
  opts: { eventId: string } | { mediaId: string },
): Promise<UploadActor | null> {
  const ctx = await getCtx();
  if (ctx.actor && ctx.actor.kind === 'user') return ctx.actor as UserActor;

  let galleryId: string | null = null;
  if ('mediaId' in opts) {
    const item = await prisma.mediaItem.findUnique({
      where: { id: opts.mediaId },
      select: { galleryId: true },
    });
    galleryId = item?.galleryId ?? null;
  } else {
    const gallery = await prisma.gallery.findUnique({ where: { eventId: opts.eventId }, select: { id: true } });
    galleryId = gallery?.id ?? null;
  }
  if (!galleryId) return null;
  const secret = env.AUTH_SECRET;
  if (!secret) return null;
  const raw = request.headers.get('cookie') ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)tiwa_gs_${galleryId}=([^;]+)`));
  const sessionId = verifyGuestSessionCookie(match ? decodeURIComponent(match[1] as string) : undefined, secret);
  if (!sessionId) return null;
  const session = await prisma.guestSession.findUnique({ where: { id: sessionId } });
  if (!session || session.galleryId !== galleryId) return null;
  return { kind: 'gallery-session', sessionId, galleryId };
}
