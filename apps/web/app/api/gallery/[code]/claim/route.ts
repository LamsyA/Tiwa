import { env } from '@tiwa/config';
import { claimGallerySessionFromInvite, guestSessionCookieName, signGuestSession } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

const claimSchema = z.object({ token: z.string().trim().min(1).max(200) });

/**
 * POST /api/gallery/{code}/claim — invite-link handoff (UF-08 → UF-10).
 * Exchanges a valid, unrevoked invite token for a named gallery session
 * cookie, so invite holders skip the access code and the name form.
 * Server Components can't set cookies, so the `?guest=` pages call this
 * from a tiny client island and reload on success.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipCheck = await checkRedisRateLimit(`gallery:claim:ip:${ip}`, 20, 3600);
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED' } }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as unknown;
  const input = claimSchema.safeParse(body);
  if (!input.success || !env.AUTH_SECRET) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  let claimed: Awaited<ReturnType<typeof claimGallerySessionFromInvite>>;
  try {
    claimed = await claimGallerySessionFromInvite(input.data.token);
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  if (claimed.galleryCode !== code) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  const response = NextResponse.json({ ok: true, data: { sessionId: claimed.sessionId } });
  response.cookies.set(
    guestSessionCookieName(claimed.galleryId),
    signGuestSession(claimed.sessionId, env.AUTH_SECRET),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    },
  );
  return response;
}
