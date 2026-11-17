import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tiwa/db';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { requireEventAccess } from '../events/access.js';
import { bookingMoney } from '../payments/status.js';
import { calcQuoteTotals } from '../quotes/totals.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { audit } from '../shared/outbox.js';
import { requestBookingChange, respondBookingChange } from './changes.js';

// Guest-count change (D-X84), the planner's showcase workflow: the guest
// count moves (150 → 180), Tiwa finds every booked line priced per guest,
// drafts the change for each vendor with the new quantity and price, and
// gives each vendor a signed link (shared on WhatsApp) to approve it from a
// phone without signing in. Approval re-balances the payment schedule, so
// both sides see the new balance at once. Built on booking change requests:
// the link only ever decides that one PROPOSED version.

type UserActor = Extract<Actor, { kind: 'user' }>;

const CLOSED = ['CANCELLED', 'COMPLETED', 'DISPUTED'];

interface ScopeItem {
  name: string;
  qty: number;
  unitMinor: string;
}
interface StoredScope {
  items: ScopeItem[];
  notes: string | null;
  serviceDate: string | null;
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY' | null;
  spaceId: string | null;
  taxBps?: number;
  serviceBps?: number;
  travelFeeMinor?: string;
}

export interface GuestChangeLine {
  name: string;
  from: number;
  to: number;
  unitMinor: string;
}

export interface GuestChangeRow {
  bookingId: string;
  vendorName: string;
  category: string;
  currency: string;
  lines: GuestChangeLine[];
  currentTotalMinor: string;
  newTotalMinor: string;
  diffMinor: string;
  paidMinor: string;
  newBalanceMinor: string;
  /** Why this booking can't be changed now (another change waiting), else null. */
  blocked: 'pendingChange' | null;
}

export interface GuestChangePreview {
  eventName: string;
  fromCount: number;
  toCount: number;
  affected: GuestChangeRow[];
  /** Booked vendors with nothing priced per guest (a DJ, a venue hire…). */
  unaffected: { bookingId: string; vendorName: string; category: string }[];
}

export const guestChangeSchema = z.object({
  eventId: z.string().uuid(),
  newCount: z.number().int().min(1, 'countInvalid').max(100_000, 'countInvalid'),
});

/** A line scales with the guest count when its quantity is the current count (150 portions, 150 chairs…). */
function scaleItems(items: ScopeItem[], from: number, to: number): { items: ScopeItem[]; lines: GuestChangeLine[] } {
  const lines: GuestChangeLine[] = [];
  const scaled = items.map((item) => {
    if (from > 0 && item.qty === from && to !== from) {
      lines.push({ name: item.name, from, to, unitMinor: item.unitMinor });
      return { ...item, qty: to };
    }
    return item;
  });
  return { items: scaled, lines };
}

async function buildPreview(
  eventId: string,
  toCount: number,
): Promise<GuestChangePreview & { scopes: Map<string, StoredScope> }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { name: true, expectedGuests: true },
  });
  const fromCount = event.expectedGuests ?? 0;
  const bookings = await prisma.booking.findMany({
    where: { eventId, status: { notIn: CLOSED as never } },
    select: {
      id: true,
      category: true,
      currency: true,
      totalMinor: true,
      vendorOrgId: true,
      versions: { where: { status: { in: ['ACCEPTED', 'PROPOSED'] } }, select: { status: true, scope: true } },
      milestones: { select: { state: true, amountMinor: true } },
    },
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: bookings.map((row) => row.vendorOrgId) } },
    select: { id: true, name: true },
  });
  const names = new Map(orgs.map((org) => [org.id, org.name]));
  const affected: GuestChangeRow[] = [];
  const unaffected: GuestChangePreview['unaffected'] = [];
  const scopes = new Map<string, StoredScope>();
  for (const booking of bookings) {
    const accepted = booking.versions.find((row) => row.status === 'ACCEPTED');
    if (!accepted) continue;
    const scope = accepted.scope as unknown as StoredScope;
    const { items, lines } = scaleItems(scope.items ?? [], fromCount, toCount);
    const vendorName = names.get(booking.vendorOrgId) ?? '';
    if (lines.length === 0) {
      unaffected.push({ bookingId: booking.id, vendorName, category: booking.category });
      continue;
    }
    scopes.set(booking.id, { ...scope, items });
    const totals = calcQuoteTotals(items, scope.taxBps ?? 0, scope.serviceBps ?? 0, scope.travelFeeMinor ?? '0');
    const paid = bookingMoney(booking.milestones).securedMinor;
    affected.push({
      bookingId: booking.id,
      vendorName,
      category: booking.category,
      currency: booking.currency,
      lines,
      currentTotalMinor: booking.totalMinor.toString(),
      newTotalMinor: totals.totalMinor.toString(),
      diffMinor: (totals.totalMinor - booking.totalMinor).toString(),
      paidMinor: paid.toString(),
      newBalanceMinor: (totals.totalMinor - paid).toString(),
      blocked: booking.versions.some((row) => row.status === 'PROPOSED') ? 'pendingChange' : null,
    });
  }
  return { eventName: event.name, fromCount, toCount, affected, unaffected, scopes };
}

/** What a new guest count would change, booking by booking. Changes nothing. */
export async function guestChangePreview(
  actor: UserActor,
  raw: z.input<typeof guestChangeSchema>,
): Promise<GuestChangePreview> {
  const input = guestChangeSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const { scopes: _scopes, ...preview } = await buildPreview(input.eventId, input.newCount);
  void _scopes;
  return preview;
}

export const applyGuestChangeSchema = guestChangeSchema.extend({
  bookingIds: z.array(z.string().uuid()).max(50),
});

export interface GuestChangeSent {
  bookingId: string;
  versionId: string;
  vendorName: string;
  /** The vendor owner's phone, for a WhatsApp chat link (null when unknown). */
  vendorPhone: string | null;
  diffMinor: string;
  newBalanceMinor: string;
  currency: string;
  token: string;
}

/**
 * Update the event's guest count and send the drafted change to each picked
 * vendor. Each vendor gets a signed approve link (14 days, single decision).
 */
export async function applyGuestChange(
  actor: UserActor,
  raw: z.input<typeof applyGuestChangeSchema>,
  secret: string,
): Promise<{ sent: GuestChangeSent[]; skipped: string[] }> {
  const input = applyGuestChangeSchema.parse(raw);
  await requireEventAccess(actor, input.eventId, 'event.edit');
  const preview = await buildPreview(input.eventId, input.newCount);
  if (preview.fromCount === input.newCount) {
    throw new ValidationError('The guest count did not change', { field: 'newCount', key: 'sameCount' });
  }
  const reason = `Guest count changed from ${preview.fromCount} to ${input.newCount}.`;
  const sent: GuestChangeSent[] = [];
  const skipped: string[] = [];
  for (const bookingId of input.bookingIds) {
    const row = preview.affected.find((entry) => entry.bookingId === bookingId);
    const scope = preview.scopes.get(bookingId);
    if (!row || !scope || row.blocked) {
      skipped.push(bookingId);
      continue;
    }
    const result = await requestBookingChange(actor, {
      bookingId,
      reason,
      scope: {
        items: scope.items,
        notes: scope.notes ?? null,
        serviceDate: scope.serviceDate ?? null,
        slot: scope.slot ?? null,
        spaceId: scope.spaceId ?? null,
      },
    });
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { vendorOrgId: true } });
    const owner = await prisma.membership.findFirst({
      where: { orgId: booking.vendorOrgId, role: 'OWNER' },
      select: { user: { select: { phone: true } } },
    });
    sent.push({
      bookingId,
      versionId: result.versionId,
      vendorName: row.vendorName,
      vendorPhone: owner?.user.phone ?? null,
      diffMinor: row.diffMinor,
      newBalanceMinor: row.newBalanceMinor,
      currency: row.currency,
      token: issueChangeToken(result.versionId, secret).token,
    });
  }
  await prisma.event.update({ where: { id: input.eventId }, data: { expectedGuests: input.newCount } });
  await audit(prisma, {
    actor,
    action: 'event.guestCountChanged',
    targetType: 'Event',
    targetId: input.eventId,
    data: { eventId: input.eventId, from: preview.fromCount, to: input.newCount, sent: sent.length },
  });
  return { sent, skipped };
}

// ───────────── Signed approve link (stateless, like the headcount link) ─────────────

const TOKEN_DAYS = 14;
const b64u = {
  encode: (value: string) => Buffer.from(value, 'utf8').toString('base64url'),
  decode: (value: string) => Buffer.from(value, 'base64url').toString('utf8'),
};

function sign(versionId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`change-approve-v1:${versionId}:${exp}`, 'utf8').digest('base64url');
}

export function issueChangeToken(
  versionId: string,
  secret: string,
  now = new Date(),
): { token: string; expiresAt: Date } {
  const exp = now.getTime() + TOKEN_DAYS * 86_400_000;
  return {
    token: `${b64u.encode(versionId)}.${b64u.encode(String(exp))}.${sign(versionId, exp, secret)}`,
    expiresAt: new Date(exp),
  };
}

export function verifyChangeToken(token: string, secret: string, now = new Date()): string | null {
  const [idPart, expPart, mac] = token.split('.');
  if (!idPart || !expPart || !mac) return null;
  const versionId = b64u.decode(idPart);
  const exp = Number(b64u.decode(expPart));
  if (!Number.isFinite(exp) || exp < now.getTime()) return null;
  const expected = Buffer.from(sign(versionId, exp, secret), 'utf8');
  const given = Buffer.from(mac, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return versionId;
}

export interface ChangeApprovalView {
  versionId: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'SUPERSEDED';
  eventName: string;
  eventDate: string | null;
  timezone: string;
  vendorName: string;
  requestedBy: string;
  reason: string | null;
  currency: string;
  lines: GuestChangeLine[];
  currentTotalMinor: string;
  newTotalMinor: string;
  diffMinor: string;
  paidMinor: string;
  balanceBeforeMinor: string;
  balanceAfterMinor: string;
}

/** Everything the vendor's phone page shows; the link was already verified. */
export async function changeApprovalView(versionId: string): Promise<ChangeApprovalView> {
  const version = await prisma.bookingVersion.findUnique({
    where: { id: versionId },
    include: {
      booking: {
        select: {
          id: true,
          vendorOrgId: true,
          currency: true,
          totalMinor: true,
          eventId: true,
          milestones: { select: { state: true, amountMinor: true } },
          versions: {
            where: { status: { in: ['ACCEPTED', 'SUPERSEDED'] } },
            orderBy: { version: 'desc' },
            select: { version: true, scope: true, totalMinor: true },
          },
        },
      },
    },
  });
  if (!version) throw new NotFoundError('Change not found');
  const [event, org, proposer] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: version.booking.eventId },
      select: { name: true, startsAt: true, timezone: true },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: version.booking.vendorOrgId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: version.proposedById }, select: { name: true } }),
  ]);
  // The version this change replaced: the one just below it.
  const previous = version.booking.versions.find((row) => row.version < version.version);
  const before = (previous?.scope as unknown as StoredScope | undefined)?.items ?? [];
  const after = (version.scope as unknown as StoredScope).items ?? [];
  const lines: GuestChangeLine[] = after
    .map((item) => {
      const was = before.find((row) => row.name === item.name);
      return was && was.qty !== item.qty
        ? { name: item.name, from: was.qty, to: item.qty, unitMinor: item.unitMinor }
        : null;
    })
    .filter((line): line is GuestChangeLine => line !== null);
  const previousTotal = previous?.totalMinor ?? version.booking.totalMinor;
  const paid = bookingMoney(version.booking.milestones).securedMinor;
  return {
    versionId,
    status: version.status as ChangeApprovalView['status'],
    eventName: event.name,
    eventDate: event.startsAt?.toISOString() ?? null,
    timezone: event.timezone,
    vendorName: org.name,
    requestedBy: proposer?.name ?? '',
    reason: version.reason,
    currency: version.booking.currency,
    lines,
    currentTotalMinor: previousTotal.toString(),
    newTotalMinor: version.totalMinor.toString(),
    diffMinor: (version.totalMinor - previousTotal).toString(),
    paidMinor: paid.toString(),
    balanceBeforeMinor: (previousTotal - paid).toString(),
    balanceAfterMinor: (version.totalMinor - paid).toString(),
  };
}

/**
 * The vendor decides from the link (no sign-in): the signed token stands in
 * for the vendor, so the decision is recorded as the business owner's.
 */
export async function decideChangeByToken(versionId: string, accept: boolean, opts?: { ip?: string }) {
  const version = await prisma.bookingVersion.findUnique({
    where: { id: versionId },
    select: { status: true, booking: { select: { vendorOrgId: true } } },
  });
  if (!version) throw new NotFoundError('Change not found');
  if (version.status !== 'PROPOSED') throw new ValidationError('Already decided', { key: 'alreadyDecided' });
  const owner = await prisma.membership.findFirst({
    where: { orgId: version.booking.vendorOrgId, role: 'OWNER' },
    select: { userId: true },
  });
  if (!owner) throw new NotFoundError('Vendor not found');
  return respondBookingChange({ kind: 'user', userId: owner.userId, isAdmin: false }, { versionId, accept }, opts);
}
