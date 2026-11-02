import { env } from '@tiwa/config';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** VAPID public key for push subscription (P13-T03). 404 when push is off. */
export async function GET() {
  if (!env.WEB_PUSH_VAPID_PUBLIC_KEY) {
    return NextResponse.json({ ok: false, error: { code: 'PUSH_DISABLED' } }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, data: { publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
