import { findBusinesses } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';

/** Inbox "New chat": published vendors and planners by name or @handle (signed-in only). */
export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ hits: [] }, { status: 401 });
  const q = request.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json({ hits: await findBusinesses({ q }) });
}
