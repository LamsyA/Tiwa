import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { EventAccess } from '../auth/authorize.js';
import type { Actor } from '../auth/authorize.js';
import { resolveEventAccess } from '../events/access.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';

type UserActor = Extract<Actor, { kind: 'user' }>;

// Guest answers on their personal link (/i/[token], UF-08).
// GET never answers (UF-08-3): links only ever render the answer form;
// answering always takes a server-action form POST.

export type RsvpAnswer = 'YES' | 'NO';

const GUEST_TOKEN_BYTES = 32;

/** Tokens are generateToken(32): 43 unpadded base64url chars. */
function tokenUrlSafe(token: string): boolean {
  return /^[A-Za-z0-9\-_]{43}$/.test(token);
}

/** Invite-row lookup by personal token: null unless exactly one active guest holds it. */
async function guestByToken(token: string) {
  if (!tokenUrlSafe(token)) return null;
  const guest = await prisma.guest.findUnique({ where: { inviteToken: token } });
  if (!guest || guest.inviteRevokedAt || guest.deletedAt) return null;
  return guest;
}

export interface InvitePage {
  token: string;
  guest: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    rsvp: string;
    plusOnes: number;
    meal: string | null;
    dietary: string | null;
    respondedAt: Date | null;
    answers: Record<string, unknown>;
  };
  event: {
    id: string;
    name: string;
    description: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    timezone: string;
    status: string;
    coverKey: string | null;
    themeColor: string | null;
    venueName: string | null;
    dressCode: string | null;
    hostName: string;
    momentsOn: boolean;
    allowForwarding: boolean;
    cancelled: boolean;
    over: boolean;
  };
}

/** Public read for the invite page: token, validity and guest state. */
export async function invitePage(token: string): Promise<InvitePage> {
  if (!tokenUrlSafe(token)) throw new NotFoundError('Invitation not found', { token: 'invalid' });
  const guest = await prisma.guest.findUnique({
    where: { inviteToken: tokenUrlSafe(token) ? token : '' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      rsvp: true,
      plusOnes: true,
      meal: true,
      dietary: true,
      respondedAt: true,
      answers: true,
      inviteRevokedAt: true,
      event: {
        select: {
          id: true,
          name: true,
          description: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          status: true,
          coverKey: true,
          themeColor: true,
          days: { orderBy: { sortOrder: 'asc' }, take: 1, select: { venueName: true } },
          createdBy: { select: { name: true } },
          momentsEnabled: true,
          allowForwarding: true,
        },
      },
    },
  });
  if (!guest || guest.inviteRevokedAt || !guest.event)
    throw new NotFoundError('Invitation not found', { token: 'missing' });
  const event = guest.event;
  const now = new Date();
  const answers = (guest.answers ?? {}) as Record<string, unknown>;
  return {
    token,
    guest: {
      id: guest.id,
      name: guest.name,
      phone: guest.phone,
      email: guest.email,
      rsvp: guest.rsvp,
      plusOnes: guest.plusOnes,
      meal: guest.meal,
      dietary: guest.dietary,
      respondedAt: guest.respondedAt,
      answers,
    },
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      status: event.status,
      coverKey: event.coverKey,
      themeColor: event.themeColor,
      venueName: event.days[0]?.venueName ?? null,
      dressCode: typeof answers.dressCode === 'string' ? (answers.dressCode as string) : null,
      hostName: event.createdBy.name,
      momentsOn: event.momentsEnabled,
      allowForwarding: event.allowForwarding,
      cancelled: event.status === 'CANCELLED',
      over: event.endsAt
        ? event.endsAt < now
        : event.startsAt
          ? event.startsAt < new Date(now.getTime() - 6 * 60 * 60 * 1000)
          : false,
    },
  };
}

export const answerRsvpSchema = z.object({
  token: z.string().min(1).max(64),
  response: z.enum(['YES', 'NO']),
  plusOnes: z.number().int().min(0).max(20).optional(),
  meal: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(280).optional(),
  message: z.string().trim().max(500).optional(),
});

export interface AnswerResult {
  guestId: string;
  rsvp: RsvpAnswer;
  respondedAt: Date;
  undoUntil: Date;
}

const UNDO_WINDOW_MS = 10_000;

/** Record an RSVP answer (idempotent per value: re-answering the same is a no-op). */
export async function answerRsvp(input: z.infer<typeof answerRsvpSchema>): Promise<AnswerResult> {
  const guest = await guestByToken(input.token);
  if (!guest) throw new NotFoundError('Invitation not found', { token: 'missing' });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: guest.eventId } });
  if (event.status === 'CANCELLED' || event.status === 'COMPLETED') {
    throw new ConflictError('RSVP is closed for this event', { key: 'rsvpClosed' });
  }
  const respondedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.guest.update({
      where: { id: guest.id },
      data: {
        rsvp: input.response,
        respondedAt,
        ...(input.plusOnes !== undefined ? { plusOnes: input.plusOnes } : {}),
        ...(input.meal !== undefined ? { meal: input.meal || null } : {}),
        ...(input.dietary !== undefined ? { dietary: input.dietary || null } : {}),
        inviteOpenedAt: guest.inviteOpenedAt ?? respondedAt,
      },
    });
    await audit(tx, {
      actor: { kind: 'guest', guestId: guest.id, eventId: guest.eventId },
      action: 'invites.answerRsvp',
      targetType: 'Guest',
      targetId: guest.id,
      data: { response: input.response },
    });
  });
  return {
    guestId: guest.id,
    rsvp: input.response,
    respondedAt,
    undoUntil: new Date(respondedAt.getTime() + UNDO_WINDOW_MS),
  };
}

export const UNDO_WINDOW_MS_PUBLIC = UNDO_WINDOW_MS;

/** Undo window: flip YES↔NO without losing the guest's plus-ones/meal (UF-08-5). Fields stay as last answered. */
export async function undoRsvp(token: string): Promise<AnswerResult> {
  const guest = await guestByToken(token);
  if (!guest) throw new NotFoundError('Invitation not found', { token: 'missing' });
  const flipped = guest.rsvp === 'YES' ? 'NO' : 'YES';
  return answerRsvp({ token, response: flipped });
}

export const revokeInviteSchema = z.object({ eventId: z.string().uuid(), guestId: z.string().uuid() });

/** Revoke a guest's link and issue a fresh token (Backend §4.4; old links 404). */
export async function revokeInvite(
  actor: UserActor,
  input: z.infer<typeof revokeInviteSchema>,
  preloaded?: EventAccess,
): Promise<{ token: string }> {
  await resolveEventAccess(actor, input.eventId, 'guests.manage', preloaded);
  const guest = await prisma.guest.findFirst({
    where: { id: input.guestId, eventId: input.eventId, deletedAt: null },
    select: { id: true },
  });
  if (!guest) throw new NotFoundError('Guest not found', { guestId: input.guestId });
  const { generateToken } = await import('../shared/ids.js');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateToken(GUEST_TOKEN_BYTES);
    const clash = await prisma.guest.findUnique({ where: { inviteToken: token }, select: { id: true } });
    if (clash) {
      if (attempt === 2) throw new Error('invite token collision');
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.guest.update({ where: { id: guest.id }, data: { inviteToken: token, inviteRevokedAt: null } });
      await audit(tx, { actor, action: 'invites.revokeInvite', targetType: 'Guest', targetId: guest.id, data: {} });
    });
    return { token };
  }
  throw new Error('invite token collision');
}

// ───────────── Check-in signing ─────────────
// The pass QR encodes `ticketId.exp.sig`-style HMAC material (Backend.md §12):
// `checkin:{guestId}:{eventId}:{exp}`. Offline check-in (P5-T11) verifies it
// without a server round-trip. Not a secret — just tamper-evidence + expiry.

export function signCheckin(guestId: string, eventId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`checkin-v1:${guestId}:${eventId}:${exp}`, 'utf8').digest('base64url');
}

export function checkinQrValue(guestId: string, eventId: string, secret: string, ttlDays = 30): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  return `checkin:${guestId}:${eventId}:${exp}:${signCheckin(guestId, eventId, exp, secret)}`;
}

export function verifyCheckinQr(value: string, secret: string): { guestId: string; eventId: string } | null {
  const parts = value.split(':');
  if (parts.length !== 5 || parts[0] !== 'checkin') return null;
  const [, guestId, eventId, expRaw, sig] = parts;
  if (!guestId || !eventId || !expRaw || !sig || !/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= Date.now()) return null;
  const expected = Buffer.from(signCheckin(guestId, eventId, exp, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { guestId, eventId };
}
