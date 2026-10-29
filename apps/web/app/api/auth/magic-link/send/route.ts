import { isDomainError } from '@tiwa/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sendMagicLink } from '@/lib/otp.js';

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== 'string') {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address' }, { status: 400 });
  }
  try {
    await sendMagicLink(body.email, clientIp(request));
    // Same response whether or not the address exists (no account enumeration).
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
}
