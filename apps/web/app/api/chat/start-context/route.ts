import { fromStoredPermissions, utcToZoned } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';

/**
 * What the [Message] sheet on a cached public profile needs (UF-30 step 1):
 * am I signed in, is this my own business, and which of my upcoming events
 * I may chat for (host, or co-host with the chat permission).
 */
export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ signedIn: false, own: false, events: [] });
  const [membership, rows] = await Promise.all([
    orgId
      ? prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: ctx.actor.userId } } })
      : Promise.resolve(null),
    prisma.eventParticipant.findMany({
      where: {
        userId: ctx.actor.userId,
        removedAt: null,
        role: { in: ['HOST', 'CO_HOST'] },
        event: { status: 'ACTIVE', deletedAt: null, OR: [{ startsAt: null }, { startsAt: { gte: new Date() } }] },
      },
      select: {
        role: true,
        permissions: true,
        event: { select: { id: true, name: true, startsAt: true, timezone: true, expectedGuests: true } },
      },
      orderBy: { event: { startsAt: 'asc' } },
      take: 20,
    }),
  ]);
  const events = rows
    .filter((row) => row.role === 'HOST' || fromStoredPermissions(row.permissions).chat)
    .map(({ event }) => ({
      id: event.id,
      name: event.name,
      date: event.startsAt ? utcToZoned(event.startsAt, event.timezone).date : null,
      guests: event.expectedGuests,
    }));
  return NextResponse.json(
    { signedIn: true, own: membership !== null, events },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
