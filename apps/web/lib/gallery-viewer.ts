import { env } from '@tiwa/config';
import { verifyGuestSessionCookie, type GalleryViewer } from '@tiwa/core';
import { getCtx } from './ctx.js';

// Resolve who is looking at a gallery (P5-T06). Members come from the
// session; guests come from any signed `tiwa_gs_*` cookie. Core checks that
// a session belongs to the gallery being viewed — this only collects
// candidates, so a cookie for gallery A never opens gallery B.
export async function galleryViewer(): Promise<{ viewer: GalleryViewer; sessionIds: string[] }> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return viewerFromCookies(store.getAll().map((c) => `${c.name}=${c.value}`));
}

export async function galleryViewerFromRequest(request: Request): Promise<{
  viewer: GalleryViewer;
  sessionIds: string[];
}> {
  return viewerFromCookies((request.headers.get('cookie') ?? '').split(';'));
}

async function viewerFromCookies(raw: string[]): Promise<{ viewer: GalleryViewer; sessionIds: string[] }> {
  const ctx = await getCtx();
  if (ctx.actor && ctx.actor.kind === 'user') {
    return { viewer: { kind: 'user', userId: ctx.actor.userId, isAdmin: ctx.actor.isAdmin }, sessionIds: [] };
  }
  const secret = env.AUTH_SECRET;
  const sessionIds: string[] = [];
  if (secret) {
    for (const part of raw) {
      const [name, ...rest] = part.split('=');
      if (!name?.trim().startsWith('tiwa_gs_')) continue;
      const id = verifyGuestSessionCookie(decodeURIComponent(rest.join('=').trim()), secret);
      if (id) sessionIds.push(id);
    }
  }
  const [first] = sessionIds;
  if (first) return { viewer: { kind: 'gallery-session', sessionId: first }, sessionIds };
  return { viewer: { kind: 'anonymous' }, sessionIds };
}
