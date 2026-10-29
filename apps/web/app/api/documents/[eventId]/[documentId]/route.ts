import { documentDownloadUrl, isDomainError } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { getCtx } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

export const dynamic = 'force-dynamic';

/** Download: permission check, then a 5-minute signed URL. Links never outlive membership. */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string; documentId: string }> }) {
  const { eventId, documentId } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const url = await documentDownloadUrl(privateStorage(), ctx.actor, { eventId, documentId });
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.status });
  }
}
