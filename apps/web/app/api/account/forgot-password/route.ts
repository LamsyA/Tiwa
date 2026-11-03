import { isDomainError } from '@tiwa/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/otp.js';

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

/** Forgot password (D-X51, D-X53): username or email in; clear errors out. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { identifier?: unknown };
  if (typeof body.identifier !== 'string') {
    return NextResponse.json({ ok: false, error: 'Enter your username or email' }, { status: 400 });
  }
  try {
    await requestPasswordReset(body.identifier, clientIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const status =
      error.code === 'RATE_LIMITED' ? 429 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 502 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
}
