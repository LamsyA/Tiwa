// Door check-in (P11-T06–T08; DAY-07, UF-23; Backend.md §5 checkin + §11).
// One scanner accepts both kinds of pass: ticket QRs (`ticket:…`, P11-T05)
// and invitation pass QRs (`checkin:…`, guests/rsvp). Results are `OK`
// (first scan), `DUPLICATE` (already scanned — shows who and when) or
// `INVALID` (unknown/expired/wrong event). Every scan writes a CheckIn row;
// the first OK scan also fills the `checkedInAt` cache on the Ticket/Guest.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma, type CheckInResult } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { verifyCheckinQr } from '../guests/rsvp.js';
import { uuidv7 } from '../shared/ids.js';
import { verifyTicketQr } from '../tickets/tokens.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

export const checkInSchema = z.object({
  eventId: z.string().uuid(),
  qrValue: z.string().min(8).max(500),
  deviceId: z.string().trim().min(1).max(80),
});

export const checkInByIdSchema = z.object({
  eventId: z.string().uuid(),
  entryId: z.string().uuid(),
  kind: z.enum(['ticket', 'guest']),
  deviceId: z.string().trim().min(1).max(80),
});

export interface CheckInOutcome {
  result: CheckInResult;
  holderName: string | null;
  kind: 'ticket' | 'guest' | null;
  checkedInAt: string | null;
  checkedInBy: string | null;
  messageKey: string;
}

async function logScan(input: {
  eventId: string;
  ticketId: string | null;
  guestId: string | null;
  deviceId: string;
  byUserId: string;
  result: CheckInResult;
  scannedAt?: Date;
}): Promise<void> {
  await prisma.checkIn.create({
    data: {
      id: uuidv7(),
      eventId: input.eventId,
      ticketId: input.ticketId,
      guestId: input.guestId,
      deviceId: input.deviceId,
      scannedAt: input.scannedAt ?? new Date(),
      byUserId: input.byUserId,
      result: input.result,
    },
  });
}

function checkinChannel(eventId: string): string {
  return `checkin:${eventId}`;
}

export const checkinEventChannel = checkinChannel;

export async function checkIn(
  actor: UserActor,
  raw: z.input<typeof checkInSchema>,
  secret: string,
  scannedAt?: Date,
): Promise<CheckInOutcome> {
  const input = checkInSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'checkin.scan');
  const now = scannedAt ?? new Date();

  // 1. Ticket passes.
  const ticket = verifyTicketQr(input.qrValue, secret);
  if (ticket) {
    if (ticket.eventId !== input.eventId) {
      await logScan({
        eventId: input.eventId,
        ticketId: null,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'INVALID',
      });
      return {
        result: 'INVALID',
        holderName: null,
        kind: null,
        checkedInAt: null,
        checkedInBy: null,
        messageKey: 'wrongEvent',
      };
    }
    const row = await prisma.ticket.findUnique({
      where: { id: ticket.ticketId },
      include: { order: { select: { status: true, eventId: true } } },
    });
    if (!row || row.eventId !== input.eventId || row.order.status !== 'PAID' || row.order.eventId !== input.eventId) {
      await logScan({
        eventId: input.eventId,
        ticketId: ticket.ticketId,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'INVALID',
      });
      return {
        result: 'INVALID',
        holderName: null,
        kind: null,
        checkedInAt: null,
        checkedInBy: null,
        messageKey: 'notValid',
      };
    }
    if (row.checkedInAt) {
      const first = await prisma.checkIn.findFirst({
        where: { eventId: input.eventId, ticketId: row.id, result: 'OK' },
        orderBy: { scannedAt: 'asc' },
      });
      await logScan({
        eventId: input.eventId,
        ticketId: row.id,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'DUPLICATE',
      });
      return {
        result: 'DUPLICATE',
        holderName: row.holderName,
        kind: 'ticket',
        checkedInAt: (first?.scannedAt ?? row.checkedInAt).toISOString(),
        checkedInBy: first?.byUserId ?? null,
        messageKey: 'alreadyIn',
      };
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.ticket.findUniqueOrThrow({ where: { id: row.id } });
      if (current.checkedInAt) return;
      await tx.ticket.update({ where: { id: row.id }, data: { checkedInAt: now } });
      await tx.checkIn.create({
        data: {
          id: uuidv7(),
          eventId: input.eventId,
          ticketId: row.id,
          deviceId: input.deviceId,
          scannedAt: now,
          byUserId: actor.userId,
          result: 'OK',
        },
      });
    });
    const raced = await prisma.ticket.findUniqueOrThrow({ where: { id: row.id } });
    if (raced.checkedInAt && raced.checkedInAt.getTime() !== now.getTime()) {
      await logScan({
        eventId: input.eventId,
        ticketId: row.id,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'DUPLICATE',
      });
      return {
        result: 'DUPLICATE',
        holderName: row.holderName,
        kind: 'ticket',
        checkedInAt: raced.checkedInAt.toISOString(),
        checkedInBy: null,
        messageKey: 'alreadyIn',
      };
    }
    return {
      result: 'OK',
      holderName: row.holderName,
      kind: 'ticket',
      checkedInAt: now.toISOString(),
      checkedInBy: actor.userId,
      messageKey: 'welcome',
    };
  }

  // 2. Invitation passes (P11-T08).
  const guest = verifyCheckinQr(input.qrValue, secret);
  if (guest) {
    if (guest.eventId !== input.eventId) {
      await logScan({
        eventId: input.eventId,
        ticketId: null,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'INVALID',
      });
      return {
        result: 'INVALID',
        holderName: null,
        kind: null,
        checkedInAt: null,
        checkedInBy: null,
        messageKey: 'wrongEvent',
      };
    }
    const row = await prisma.guest.findUnique({ where: { id: guest.guestId } });
    if (!row || row.eventId !== input.eventId || row.deletedAt) {
      await logScan({
        eventId: input.eventId,
        ticketId: null,
        guestId: guest.guestId,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'INVALID',
      });
      return {
        result: 'INVALID',
        holderName: null,
        kind: null,
        checkedInAt: null,
        checkedInBy: null,
        messageKey: 'notValid',
      };
    }
    if (row.checkedInAt) {
      const first = await prisma.checkIn.findFirst({
        where: { eventId: input.eventId, guestId: row.id, result: 'OK' },
        orderBy: { scannedAt: 'asc' },
      });
      await logScan({
        eventId: input.eventId,
        ticketId: null,
        guestId: row.id,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'DUPLICATE',
      });
      return {
        result: 'DUPLICATE',
        holderName: row.name,
        kind: 'guest',
        checkedInAt: (first?.scannedAt ?? row.checkedInAt).toISOString(),
        checkedInBy: first?.byUserId ?? null,
        messageKey: 'alreadyIn',
      };
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.guest.findUniqueOrThrow({ where: { id: row.id } });
      if (current.checkedInAt) return;
      await tx.guest.update({ where: { id: row.id }, data: { checkedInAt: now } });
      await tx.checkIn.create({
        data: {
          id: uuidv7(),
          eventId: input.eventId,
          guestId: row.id,
          deviceId: input.deviceId,
          scannedAt: now,
          byUserId: actor.userId,
          result: 'OK',
        },
      });
    });
    return {
      result: 'OK',
      holderName: row.name,
      kind: 'guest',
      checkedInAt: now.toISOString(),
      checkedInBy: actor.userId,
      messageKey: 'welcome',
    };
  }

  await logScan({
    eventId: input.eventId,
    ticketId: null,
    guestId: null,
    deviceId: input.deviceId,
    byUserId: actor.userId,
    result: 'INVALID',
  });
  return {
    result: 'INVALID',
    holderName: null,
    kind: null,
    checkedInAt: null,
    checkedInBy: null,
    messageKey: 'notValid',
  };
}

/** Manual fallback (Frontend.md §6.3): find passes by holder name, then check in by id. */
export interface PassHit {
  kind: 'ticket' | 'guest';
  id: string;
  name: string;
  checkedIn: boolean;
}

export async function searchPasses(actor: UserActor, eventId: string, query: string): Promise<PassHit[]> {
  await requireEventAccess(actor, eventId, 'checkin.scan');
  const q = query.trim();
  if (q.length < 2) return [];
  const [tickets, guests] = await Promise.all([
    prisma.ticket.findMany({
      where: { eventId, holderName: { contains: q, mode: 'insensitive' }, order: { status: 'PAID' } },
      select: { id: true, holderName: true, checkedInAt: true },
      take: 20,
    }),
    prisma.guest.findMany({
      where: { eventId, name: { contains: q, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, checkedInAt: true },
      take: 20,
    }),
  ]);
  return [
    ...tickets.map((row) => ({
      kind: 'ticket' as const,
      id: row.id,
      name: row.holderName,
      checkedIn: !!row.checkedInAt,
    })),
    ...guests.map((row) => ({ kind: 'guest' as const, id: row.id, name: row.name, checkedIn: !!row.checkedInAt })),
  ];
}

/** Check in one pass found by name search (same rules as a scan). */
export async function checkInById(
  actor: UserActor,
  raw: z.input<typeof checkInByIdSchema>,
  secret: string,
): Promise<CheckInOutcome> {
  const input = checkInByIdSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'checkin.scan');
  if (input.kind === 'ticket') {
    const row = await prisma.ticket.findUnique({ where: { id: input.entryId } });
    if (!row || row.eventId !== input.eventId) {
      await logScan({
        eventId: input.eventId,
        ticketId: null,
        guestId: null,
        deviceId: input.deviceId,
        byUserId: actor.userId,
        result: 'INVALID',
      });
      return {
        result: 'INVALID',
        holderName: null,
        kind: null,
        checkedInAt: null,
        checkedInBy: null,
        messageKey: 'notValid',
      };
    }
    return checkIn(actor, { eventId: input.eventId, qrValue: row.qrToken, deviceId: input.deviceId }, secret);
  }
  const row = await prisma.guest.findUnique({ where: { id: input.entryId } });
  if (!row || row.eventId !== input.eventId || row.deletedAt) {
    await logScan({
      eventId: input.eventId,
      ticketId: null,
      guestId: null,
      deviceId: input.deviceId,
      byUserId: actor.userId,
      result: 'INVALID',
    });
    return {
      result: 'INVALID',
      holderName: null,
      kind: null,
      checkedInAt: null,
      checkedInBy: null,
      messageKey: 'notValid',
    };
  }
  const { checkinQrValue } = await import('../guests/rsvp.js');
  return checkIn(
    actor,
    { eventId: input.eventId, qrValue: checkinQrValue(row.id, input.eventId, secret), deviceId: input.deviceId },
    secret,
  );
}

export interface CheckinStats {
  ticketsTotal: number;
  ticketsIn: number;
  guestsIn: number;
  expected: number;
}

/** Live counter for the check-in page (P11-T06): tickets + invited guests. */
export async function checkinStats(actor: UserActor, eventId: string): Promise<CheckinStats> {
  await requireEventAccess(actor, eventId, 'checkin.scan');
  const [ticketsTotal, ticketsIn, guestsIn, guestsYes] = await Promise.all([
    prisma.ticket.count({ where: { eventId, order: { status: 'PAID' } } }),
    prisma.ticket.count({ where: { eventId, checkedInAt: { not: null }, order: { status: 'PAID' } } }),
    prisma.guest.count({ where: { eventId, checkedInAt: { not: null }, deletedAt: null } }),
    prisma.guest.count({ where: { eventId, rsvp: 'YES', deletedAt: null } }),
  ]);
  return { ticketsTotal, ticketsIn, guestsIn, expected: ticketsTotal + guestsYes };
}

// ───────────── Offline check-in (P11-T07) ─────────────
// The organiser downloads a signed list before the doors; the scanner verifies
// the signature offline, queues scans in IndexedDB, and POSTs them to
// `syncOfflineCheckins` when back online. Duplicates across two devices are
// both stored — the second resolves to DUPLICATE with the first scan's data.

export function signOfflineList(eventId: string, issuedAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`offline-v1:${eventId}:${issuedAt}`, 'utf8').digest('base64url');
}

export interface OfflineEntry {
  kind: 'ticket' | 'guest';
  id: string;
  name: string;
  qr: string;
  checkedIn: boolean;
}

export async function offlineList(actor: UserActor, eventId: string, secret: string) {
  await requireEventAccess(actor, eventId, 'checkin.scan');
  const [tickets, guests] = await Promise.all([
    prisma.ticket.findMany({
      where: { eventId, order: { status: 'PAID' } },
      select: { id: true, holderName: true, qrToken: true, checkedInAt: true },
      take: 5000,
    }),
    prisma.guest.findMany({
      where: { eventId, deletedAt: null, rsvp: { in: ['YES', 'MAYBE'] } },
      select: { id: true, name: true, checkedInAt: true },
      take: 5000,
    }),
  ]);
  const { checkinQrValue } = await import('../guests/rsvp.js');
  const entries: OfflineEntry[] = [
    ...tickets.map((ticket) => ({
      kind: 'ticket' as const,
      id: ticket.id,
      name: ticket.holderName,
      qr: ticket.qrToken,
      checkedIn: !!ticket.checkedInAt,
    })),
    ...guests.map((guest) => ({
      kind: 'guest' as const,
      id: guest.id,
      name: guest.name,
      qr: checkinQrValue(guest.id, eventId, secret),
      checkedIn: !!guest.checkedInAt,
    })),
  ];
  const issuedAt = Date.now();
  return { eventId, issuedAt, signature: signOfflineList(eventId, issuedAt, secret), entries };
}

export function verifyOfflineList(eventId: string, issuedAt: number, signature: string, secret: string): boolean {
  const expected = Buffer.from(signOfflineList(eventId, issuedAt, secret), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const syncOfflineSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().trim().min(1).max(80),
  scans: z
    .array(z.object({ qrValue: z.string().min(8).max(500), scannedAt: z.string().datetime() }))
    .max(1000, 'tooManyScans'),
});

/** Upload queued offline scans (P11-T07): each resolves through the same rules as a live scan. */
export async function syncOfflineCheckins(actor: UserActor, raw: z.input<typeof syncOfflineSchema>, secret: string) {
  const input = syncOfflineSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'checkin.scan');
  const results: CheckInOutcome[] = [];
  for (const scan of input.scans.slice(0, 1000)) {
    // Scanned-at is preserved for the record; duplicates still resolve against the first OK scan.
    const scannedAt = new Date(scan.scannedAt);
    results.push(
      await checkIn(
        actor,
        { eventId: input.eventId, qrValue: scan.qrValue, deviceId: input.deviceId },
        secret,
        Number.isNaN(scannedAt.getTime()) ? undefined : scannedAt,
      ),
    );
  }
  return {
    synced: results.length,
    ok: results.filter((r) => r.result === 'OK').length,
    duplicates: results.filter((r) => r.result === 'DUPLICATE').length,
    invalid: results.filter((r) => r.result === 'INVALID').length,
  };
}
