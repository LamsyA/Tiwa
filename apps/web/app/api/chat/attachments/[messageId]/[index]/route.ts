import { attachmentKey, isDomainError } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { getCtx } from '@/lib/ctx.js';
import { privateStorage } from '@/lib/storage.js';

export const dynamic = 'force-dynamic';

/** File N of a chat message: participants only, then a 5-minute signed URL (`?download=1` saves it). */
export async function GET(request: Request, { params }: { params: Promise<{ messageId: string; index: string }> }) {
  const { messageId, index } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0) {
    return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  }
  try {
    const attachment = await attachmentKey(ctx.actor, messageId, position);
    const download = new URL(request.url).searchParams.get('download') === '1';
    const url = await privateStorage().getSignedUrl(attachment.key, 300, download ? attachment.name : undefined);
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=240' } });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.status });
  }
}
