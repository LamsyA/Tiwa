import { invitePage } from '@tiwa/core';
import { env } from '@tiwa/config';
import { NextResponse } from 'next/server';
import { icsEvent } from '@/lib/ics.js';

export const dynamic = 'force-dynamic';

/** GET /api/ics/{token} — calendar file for an invite (UF-08-5). No auth: the token is the capability. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await invitePage(decodeURIComponent(token)).catch(() => null);
  if (!page || !page.event.startsAt) return new NextResponse('Not found', { status: 404 });
  const text = icsEvent({
    uid: `${page.guest.id}@tiwa.app`,
    summary: page.event.name,
    description: page.event.description ?? undefined,
    location: page.event.venueName ?? undefined,
    startsAt: page.event.startsAt,
    endsAt: page.event.endsAt,
    url: `${env.APP_URL.replace(/\/$/, '')}/i/${page.token}`,
  });
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${page.event.name}.ics`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
