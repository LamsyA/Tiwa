import { env } from '@tiwa/config';
import { createGuestSession, getGalleryPage, signGuestSession } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

const sessionSchema = z.object({
  name: z.string().trim().max(80).optional(),
  access: z.string().trim().max(12).optional(),
});

/**
 * POST /api/gallery/{code}/session — name the guest (first upload only,
 * UF-10-2) and set the signed `tiwa_gs_{galleryId}` cookie. GUESTS_ONLY
 * galleries need the printed access code; LINK/PUBLIC open with the code.
 * Invite holders skip this entirely via `?guest=` (claimed in the page).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:session:ip:${ip}`, 10, 60);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const input = sessionSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  if (!env.AUTH_SECRET) {
    return NextResponse.json({ ok: false, error: { code: 'MISCONFIGURED' } }, { status: 500 });
  }
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);
  let galleryId: string;
  try {
    const page = await getGalleryPage(code, viewer, {
      ...(input.data.access ? { accessCode: input.data.access } : {}),
      ...(sessionIds.length > 0 ? { sessionIds } : {}),
    });
    galleryId = page.gallery.id;
  } catch (error) {
    const errorCode = (error as { code?: string }).code ?? 'FORBIDDEN';
    return NextResponse.json(
      { ok: false, error: { code: errorCode } },
      { status: errorCode === 'NOT_FOUND' ? 404 : 403 },
    );
  }
  const name = input.data.name?.trim().slice(0, 80) || null;
  const { sessionId } = await prisma.$transaction((tx) => createGuestSession(tx, galleryId, name ?? undefined));
  const response = NextResponse.json({ ok: true, data: { sessionId } });
  response.cookies.set(`tiwa_gs_${galleryId}`, signGuestSession(sessionId, env.AUTH_SECRET), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
