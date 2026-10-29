import { isDomainError } from '@tiwa/core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/otp.js';

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
  if (typeof body.phone !== 'string' || typeof body.code !== 'string') {
    return NextResponse.json({ ok: false, error: 'Enter the 6-digit code' }, { status: 400 });
  }
  try {
    const { setCookies, ...result } = await verifyOtp(body.phone, body.code, clientIp(request));
    const response = NextResponse.json({ ok: true, ...result });
    for (const cookie of setCookies) response.headers.append('set-cookie', cookie);
    return response;
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const status = error.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
  }
}
