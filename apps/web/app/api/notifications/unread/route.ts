import { notificationUnreadCount } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Bell badge polling endpoint (P13-T03). */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const unread = await notificationUnreadCount(ctx.actor);
  return NextResponse.json({ ok: true, data: { unread } }, { headers: { 'Cache-Control': 'no-store' } });
}
