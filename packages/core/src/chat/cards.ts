import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';

// Booking chat cards (QTE-06, P7-T12): quotes, bookings, changes and site
// visits post CARD messages so the booking timeline mirrors into chat. The
// booking thread (CLIENT host + VENDOR org) is created on demand; the
// event-team thread is only mirrored into when it already exists.

type UserActor = Extract<Actor, { kind: 'user' }>;

export type CardType = 'quote' | 'booking' | 'change' | 'site_visit' | 'decision';

export async function ensureBookingThread(bookingId: string): Promise<string> {
  const existing = await prisma.thread.findFirst({
    where: { kind: 'BOOKING', context: 'BOOKING', contextId: bookingId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { eventId: true, vendorOrgId: true, event: { select: { createdById: true } } },
  });
  const thread = await prisma.thread.create({
    data: {
      kind: 'BOOKING',
      context: 'BOOKING',
      contextId: bookingId,
      eventId: booking.eventId,
      bookingId,
      createdById: booking.event.createdById,
      lastMessageAt: new Date(),
      participants: {
        create: [
          { userId: booking.event.createdById, side: 'CLIENT', lastReadAt: new Date() },
          { orgId: booking.vendorOrgId, side: 'VENDOR' },
        ],
      },
    },
    select: { id: true },
  });
  return thread.id;
}

export async function findEventTeamThread(eventId: string): Promise<string | null> {
  const thread = await prisma.thread.findFirst({
    where: { kind: 'EVENT', eventId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return thread?.id ?? null;
}

export type CardSnapshot = {
  vendorName?: string;
  category?: string;
  totalMinor?: string;
  currency?: string;
  version?: number;
  diffMinor?: string;
  date?: string;
  /** D-X101: where the host opens it (shown to the other side only). */
  href?: string;
  /** D-X107 decision cards: what was decided, and about what. */
  decision?: 'approved' | 'declined' | 'changes' | 'received' | 'not_received' | 'recorded';
  subject?: 'proposal' | 'quote' | 'request' | 'change' | 'payment';
  label?: string;
  note?: string;
};

export async function postCard(
  actor: UserActor,
  input: { threadId: string; type: CardType; refId: string; snapshot?: CardSnapshot },
): Promise<{ messageId: string }> {
  const message = await prisma.message.create({
    data: {
      threadId: input.threadId,
      authorUserId: actor.userId,
      clientMessageId: uuidv7(),
      kind: 'CARD',
      card: { type: input.type, id: input.refId, ...(input.snapshot ?? {}) },
    },
    select: { id: true },
  });
  await prisma.thread.update({ where: { id: input.threadId }, data: { lastMessageAt: new Date() } });
  await audit(prisma, {
    actor,
    action: 'chat.postCard',
    targetType: 'Thread',
    targetId: input.threadId,
    data: { card: input.type, ref: input.refId },
  });
  return { messageId: message.id };
}

/** Mirror a card into the event-team thread when one already exists. */
export async function mirrorToEventTeam(
  actor: UserActor,
  eventId: string,
  type: CardType,
  refId: string,
  snapshot?: CardSnapshot,
): Promise<void> {
  const threadId = await findEventTeamThread(eventId);
  if (!threadId) return;
  await postCard(actor, snapshot ? { threadId, type, refId, snapshot } : { threadId, type, refId });
}

/**
 * D-X107: the conversation a host and a business actually use for an event:
 * their direct chat about it (chat-first hiring) if there is one, otherwise
 * the booking's chat (created on demand when a booking exists).
 */
export async function conversationFor(input: {
  eventId: string;
  orgId: string;
  bookingId?: string | null;
  /** Only the direct chat (the booking chat already got its own card). */
  directOnly?: boolean;
}): Promise<string[]> {
  const direct = await prisma.thread.findMany({
    where: {
      kind: 'DIRECT',
      eventId: input.eventId,
      participants: { some: { orgId: input.orgId, leftAt: null } },
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
    take: 1,
  });
  if (direct[0]) return [direct[0].id];
  if (input.directOnly || !input.bookingId) return [];
  return [await ensureBookingThread(input.bookingId)];
}

/** D-X107: an approval or rejection between the two sides, posted into their chat. Never fails the action. */
export async function postDecision(
  actor: UserActor,
  input: {
    eventId: string;
    orgId: string;
    bookingId?: string | null;
    directOnly?: boolean;
    refId: string;
    snapshot: CardSnapshot;
  },
): Promise<void> {
  try {
    for (const threadId of await conversationFor(input)) {
      await postCard(actor, { threadId, type: 'decision', refId: input.refId, snapshot: input.snapshot });
    }
  } catch {
    // The decision stands; the chat card is a courtesy.
  }
}
