import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tiwa/db';
import type { Actor, EventAccess } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Headcount report (GST-17): aggregates only — no names, phones or emails —
// so the same payload renders in-app and behind the vendor share link
// (UF-06-3). Group/table names are host-defined labels, not guest PII.

export interface HeadcountReport {
  eventName: string;
  generatedAt: string;
  rsvp: { yes: number; no: number; maybe: number; none: number; total: number };
  /** YES guests plus their plus-ones: the number to cater for. */
  expectedAttendance: number;
  plusOnes: number;
  meals: { meal: string; count: number }[];
  dietary: { need: string; count: number }[];
  groups: { name: string; total: number; yes: number }[];
  tables: { name: string; capacity: number | null; assigned: number; overCapacity: boolean }[];
  unseated: number;
}

export async function headcount(actor: UserActor, eventId: string, preloaded?: EventAccess): Promise<HeadcountReport> {
  await resolveEventAccess(actor, eventId, 'guests.manage', preloaded);
  return buildHeadcount(eventId);
}

/** The same aggregates for the public vendor link (already authorised by token). */
export async function headcountForVendor(eventId: string): Promise<HeadcountReport> {
  return buildHeadcount(eventId);
}

async function buildHeadcount(eventId: string): Promise<HeadcountReport> {
  const [event, guests, groups, tables] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } }),
    prisma.guest.findMany({
      where: { eventId, deletedAt: null },
      select: { rsvp: true, plusOnes: true, meal: true, dietary: true, groupIds: true, tableId: true },
    }),
    prisma.guestGroup.findMany({ where: { eventId }, select: { id: true, name: true } }),
    prisma.seatingTable.findMany({ where: { eventId }, select: { id: true, name: true, capacity: true } }),
  ]);
  const count = (rsvp: string) => guests.filter((guest) => guest.rsvp === rsvp).length;
  const attending = guests.filter((guest) => guest.rsvp === 'YES');
  const tally = (values: (string | null)[]): { key: string; count: number }[] => {
    const map = new Map<string, { label: string; count: number }>();
    for (const value of values) {
      if (!value) continue;
      const key = value.trim().toLowerCase();
      const row = map.get(key) ?? { label: value.trim(), count: 0 };
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({ key: row.label, count: row.count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  return {
    eventName: event.name,
    generatedAt: new Date().toISOString(),
    rsvp: { yes: count('YES'), no: count('NO'), maybe: count('MAYBE'), none: count('NONE'), total: guests.length },
    expectedAttendance: attending.length + attending.reduce((sum, guest) => sum + guest.plusOnes, 0),
    plusOnes: guests.reduce((sum, guest) => sum + guest.plusOnes, 0),
    meals: tally(attending.map((guest) => guest.meal)).map((row) => ({ meal: row.key, count: row.count })),
    dietary: tally(attending.map((guest) => guest.dietary)).map((row) => ({ need: row.key, count: row.count })),
    groups: groups.map((group) => {
      const members = guests.filter((guest) => guest.groupIds.includes(group.id));
      return { name: group.name, total: members.length, yes: members.filter((guest) => guest.rsvp === 'YES').length };
    }),
    tables: tables.map((table) => {
      const assigned = guests.filter((guest) => guest.tableId === table.id).length;
      return { name: table.name, capacity: table.capacity, assigned, overCapacity: assigned > table.capacity };
    }),
    unseated: guests.filter((guest) => guest.tableId === null).length,
  };
}

// ───────────── Vendor share link ─────────────
// Stateless HMAC token (`eventId.exp.sig`, base64url parts), like the ticket
// QR scheme (Backend.md §12). 90-day expiry; no per-link revoke in the MVP —
// the host stops sharing the URL. The page it opens renders aggregates only.

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const b64u = {
  encode(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
  },
  decode(part: string): string | null {
    try {
      return Buffer.from(part, 'base64url').toString('utf8');
    } catch {
      return null;
    }
  },
};

function sign(eventId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`headcount-v1:${eventId}:${exp}`, 'utf8').digest('base64url');
}

export function issueHeadcountToken(
  eventId: string,
  secret: string,
  now = new Date(),
): { token: string; expiresAt: Date } {
  const exp = now.getTime() + TOKEN_TTL_MS;
  const token = `${b64u.encode(eventId)}.${b64u.encode(String(exp))}.${sign(eventId, exp, secret)}`;
  return { token, expiresAt: new Date(exp) };
}

/** Returns the event id, or null when the token is forged, malformed or expired. */
export function verifyHeadcountToken(token: string, secret: string, now = new Date()): string | null {
  const [eventPart, expPart, sig] = token.split('.');
  if (!eventPart || !expPart || !sig) return null;
  const eventId = b64u.decode(eventPart);
  const expRaw = b64u.decode(expPart);
  if (!eventId || !expRaw || !/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= now.getTime()) return null;
  const expected = Buffer.from(sign(eventId, exp, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return eventId;
}
