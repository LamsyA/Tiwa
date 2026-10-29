import { NextResponse, type NextRequest } from 'next/server';
import { fakeOutbox } from '@/lib/senders.js';
import { isTestHookEnabled } from '@/lib/test-hooks.js';

/** E2E test hook: the latest message the Fake SMS/email sender "sent" to `to`. 404 unless enabled. */
export function GET(request: NextRequest) {
  if (!isTestHookEnabled()) return new NextResponse(null, { status: 404 });
  const to = request.nextUrl.searchParams.get('to');
  if (!to) return NextResponse.json({ error: 'to is required' }, { status: 400 });
  const latest = fakeOutbox()
    .filter((message) => message.to === to)
    .at(-1);
  if (!latest) return new NextResponse(null, { status: 404 });
  return NextResponse.json(latest, { headers: { 'Cache-Control': 'no-store' } });
}
