import { prisma, type Prisma } from '@tiwa/db';
import { fromStoredPermissions } from '../events/access.js';
import { NotFoundError } from '../shared/errors.js';
import { NO_FACTS, type MessageFacts, type PartyKind } from './can-message.js';

// Chat parties and the facts canMessage() needs (Backend.md §9a.1), loaded
// from the database. A party is a person (userId) or a whole business (orgId).

type Db = Prisma.TransactionClient | typeof prisma;

export interface Party {
  kind: PartyKind;
  userId?: string;
  orgId?: string;
}

/** A person-party always carries a userId; this states it for the type checker. */
const uid = (party: Pick<Party, 'userId'>): string => party.userId ?? '';

/** Business parties are PLANNER or VENDOR by their organisation kind. */
export async function orgParty(db: Db, orgId: string): Promise<Party> {
  const org = await db.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { kind: true } });
  if (!org || org.kind === 'HOST_ORG') throw new NotFoundError('Business not found', { orgId });
  return { kind: org.kind === 'PLANNER' ? 'PLANNER' : 'VENDOR', orgId };
}

/** Either side blocked the other (person or business, in any combination). */
export async function isBlocked(
  db: Db,
  a: Pick<Party, 'userId' | 'orgId'>,
  b: Pick<Party, 'userId' | 'orgId'>,
): Promise<boolean> {
  const side = (party: Pick<Party, 'userId' | 'orgId'>, prefix: 'blocker' | 'blocked') =>
    party.orgId ? { [`${prefix}OrgId`]: party.orgId } : { [`${prefix}UserId`]: party.userId };
  const count = await db.userBlock.count({
    where: {
      OR: [{ AND: [side(a, 'blocker'), side(b, 'blocked')] }, { AND: [side(b, 'blocker'), side(a, 'blocked')] }],
    },
  });
  return count > 0;
}

/**
 * The facts for `from` → `to`, optionally about one event. Loads only what the
 * pair of kinds can need. `existingThreadId` lets "replying" see the thread.
 */
export async function loadMessageFacts(
  db: Db,
  from: Party,
  to: Party,
  eventId: string | null,
  existingThreadId: string | null,
  now = new Date(),
): Promise<MessageFacts> {
  const facts: MessageFacts = { ...NO_FACTS, blocked: await isBlocked(db, from, to) };

  if (existingThreadId) {
    const targetRow = await db.threadParticipant.findFirst({
      where: { threadId: existingThreadId, ...(to.orgId ? { orgId: to.orgId } : { userId: uid(to), orgId: null }) },
    });
    if (targetRow) {
      const fromTarget = await db.message.count({
        where: {
          threadId: existingThreadId,
          ...(to.orgId ? { authorOrgId: to.orgId } : { authorUserId: uid(to), authorOrgId: null }),
        },
      });
      facts.replying = fromTarget > 0;
    }
  }

  if (from.kind === 'CLIENT') {
    if (!eventId)
      facts.clientMayChat = true; // acting for themselves, no event context
    else {
      const row = await db.eventParticipant.findFirst({
        where: { eventId, userId: uid(from), removedAt: null, role: { in: ['HOST', 'CO_HOST'] } },
      });
      facts.clientMayChat = row !== null && (row.role === 'HOST' || fromStoredPermissions(row.permissions).chat);
    }
  }

  if (eventId) {
    const onEvent = async (party: Party) =>
      (await db.eventParticipant.count({
        where: {
          eventId,
          removedAt: null,
          ...(party.orgId ? { orgId: party.orgId } : { userId: uid(party) }),
        },
      })) > 0;
    facts.sharedEventOrBooking = (await onEvent(from)) && (await onEvent(to));
  }

  if (from.kind === 'PLANNER' && to.kind === 'CLIENT' && from.orgId && to.userId) {
    // Planner hired on any event where the target is host or co-host.
    const [onEvent, target] = await Promise.all([
      db.eventParticipant.count({
        where: {
          orgId: from.orgId,
          role: 'PLANNER',
          removedAt: null,
          event: { participants: { some: { userId: to.userId, role: { in: ['HOST', 'CO_HOST'] }, removedAt: null } } },
        },
      }),
      db.user.findUnique({ where: { id: to.userId }, select: { phone: true, email: true } }),
    ]);
    facts.plannerOnClientEvent = onEvent > 0;
    // The client is in the planner's CRM (P10): match the target's verified
    // contact against the CRM rows. Leads without contact details never match.
    if (target && (target.phone || target.email)) {
      const or: { phone?: string; email?: string }[] = [];
      if (target.phone) or.push({ phone: target.phone });
      if (target.email) or.push({ email: target.email });
      facts.inPlannerCrm = (await db.client.count({ where: { orgId: from.orgId, OR: or } })) > 0;
    }
  }

  if (from.kind === 'GUEST' && to.orgId && from.userId && eventId) {
    const [event, worked, profile, user] = await Promise.all([
      db.event.findUnique({ where: { id: eventId }, select: { startsAt: true, endsAt: true } }),
      db.eventParticipant.count({
        where: { eventId, orgId: to.orgId, removedAt: null, role: { in: ['VENDOR', 'PHOTOGRAPHER', 'PLANNER'] } },
      }),
      db.businessProfile.findUnique({ where: { orgId: to.orgId }, select: { allowGuestEnquiries: true } }),
      db.user.findUnique({ where: { id: from.userId }, select: { phone: true, phoneVerified: true } }),
    ]);
    const ended = event?.endsAt ?? event?.startsAt;
    facts.eventEnded = ended !== null && ended !== undefined && ended < now;
    facts.businessWorkedOnEvent = worked > 0;
    facts.allowGuestEnquiries = profile?.allowGuestEnquiries ?? true;
    facts.phoneVerified = user?.phoneVerified ?? false;
    // Attended: RSVP yes or checked in (matched by verified phone), or uploaded to Moments.
    const [guestRows, uploads] = await Promise.all([
      user?.phone
        ? db.guest.count({
            where: {
              eventId,
              phone: user.phone,
              deletedAt: null,
              OR: [{ rsvp: 'YES' }, { checkedInAt: { not: null } }],
            },
          })
        : Promise.resolve(0),
      db.mediaItem.count({ where: { uploaderUserId: from.userId, gallery: { eventId } } }),
    ]);
    facts.guestAttended = guestRows + uploads > 0;
  }

  return facts;
}
