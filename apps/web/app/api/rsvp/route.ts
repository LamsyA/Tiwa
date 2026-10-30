import { answerRsvp, answerRsvpSchema, UNDO_WINDOW_MS_PUBLIC } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { checkRedisRateLimit } from '@/lib/rate-store.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rsvp — JSON twin of the guest one-tap island (UF-08, no-JS
 * clients and scanners that POST deliberately). Plain GETs of email links
 * never reach here: the email buttons are URLs, and only the invite page's
 * client-side POST records an RSVP (UF-08-3).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const input = answerRsvpSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION', message: 'Invalid RSVP' } }, { status: 400 });
  }
  const check = await checkRedisRateLimit(`rsvp:token:${input.data.token.slice(0, 12)}`, 10, 3600);
  if (!check.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: 'RATE_LIMITED', retryAfterSec: check.retryAfterSec } },
      { status: 429 },
    );
  }
  try {
    const result = await answerRsvp(input.data);
    const res = NextResponse.json({ ok: true, data: { ...result, undoMs: UNDO_WINDOW_MS_PUBLIC } });
    // The token lives in the URL path and request body — never plant a guest cookie.
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'INTERNAL';
    const status = code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : code === 'VALIDATION' ? 400 : 500;
    return NextResponse.json({ ok: false, error: { code } }, { status });
  }
}
