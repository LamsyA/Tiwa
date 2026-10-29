import { isDomainError, safeNextPath } from '@tiwa/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sendMagicLink } from '@/lib/otp.js';

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
  if (typeof body.email !== 'string') {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address' }, { status: 400 });
  }
  try {
    // The link lands on onboarding triage, which forwards finished profiles to `next` (UF-02-2).
    const next = safeNextPath(typeof body.next === 'string' ? body.next : null, '');
    await sendMagicLink(
      body.email,
      clientIp(request),
      next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding',
    );
    // Same response whether or not the address exists (no account enumeration).
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
}
