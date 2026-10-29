import { isDomainError } from '@tiwa/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requestOtp } from '@/lib/otp.js';

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { phone?: unknown };
  if (typeof body.phone !== 'string') {
    return NextResponse.json({ ok: false, error: 'Enter a valid phone number' }, { status: 400 });
  }
  try {
    await requestOtp(body.phone, clientIp(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
}
