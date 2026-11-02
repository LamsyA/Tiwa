import { isDomainError, threadPresence } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';

/** Presence for an open chat (D-X37): marks me as here and returns the other side's online / last seen. */
export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const threadId = request.nextUrl.searchParams.get('threadId') ?? '';
  try {
    return NextResponse.json({ ok: true, data: await threadPresence(ctx.actor, threadId) });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.status });
  }
}
