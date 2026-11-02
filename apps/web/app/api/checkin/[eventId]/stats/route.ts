import { checkinStats } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Live counter polling fallback for the check-in page (SSE-first, poll every 10 s). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const stats = await checkinStats(ctx.actor, eventId);
    return NextResponse.json({ ok: true, data: stats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
