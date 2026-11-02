import { dayContacts, dayIncidents, runOfShow } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Day data snapshot for offline use (P12-T06; Frontend.md §7.6): everything
 * the timeline renders, permission-checked like the page. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const [day, incidents, contacts] = await Promise.all([
      runOfShow(ctx.actor, eventId),
      dayIncidents(ctx.actor, eventId),
      dayContacts(ctx.actor, eventId),
    ]);
    const participants = await prisma.eventParticipant.findMany({
      where: { eventId, removedAt: null, userId: { not: null } },
      select: { userId: true, orgId: true },
    });
    return NextResponse.json(
      {
        ok: true,
        data: {
          savedAt: new Date().toISOString(),
          items: day.items.map((row) => ({ ...row, startsAt: row.startsAt.toISOString() })),
          dependencies: day.dependencies,
          checkins: day.checkins.map((row) => ({ ...row, at: row.at.toISOString() })),
          incidents: incidents.incidents.map((row) => ({
            ...row,
            resolvedAt: iso(row.resolvedAt),
            createdAt: row.createdAt.toISOString(),
          })),
          contacts: contacts.contacts,
          onsiteVendors: contacts.onsiteVendors,
          memberUserIds: [...new Set(participants.map((row) => row.userId as string))],
          memberOrgIds: [...new Set(participants.map((row) => row.orgId).filter((id): id is string => id !== null))],
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
