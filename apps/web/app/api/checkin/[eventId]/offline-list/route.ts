import { offlineList } from '@tiwa/core';
import { env } from '@tiwa/config';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Signed offline pass list for door devices (P11-T07; Backend.md §11). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const list = await offlineList(ctx.actor, eventId, env.AUTH_SECRET || 'dev-secret');
    // Cache-busting, not caching: the list is per-second fresh at the door.
    return NextResponse.json({ ok: true, data: list }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FORBIDDEN') return NextResponse.json({ ok: false, error: { code } }, { status: 403 });
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
