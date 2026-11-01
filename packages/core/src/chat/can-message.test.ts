import { describe, expect, it } from 'vitest';
import { NO_FACTS, canMessage, type MessageFacts, type PartyKind } from './can-message.js';

// One case per row of Backend.md §9a.1, with the allowing condition and its
// absence. `f()` builds facts from NO_FACTS plus overrides.
const f = (overrides: Partial<MessageFacts> = {}): MessageFacts => ({ ...NO_FACTS, ...overrides });

const GUEST_OK = f({
  eventEnded: true,
  businessWorkedOnEvent: true,
  guestAttended: true,
  allowGuestEnquiries: true,
  phoneVerified: true,
});

type Row = [string, PartyKind, PartyKind, MessageFacts, boolean];

const ROWS: Row[] = [
  // Client (host / co-host with permission) → vendor, venue or planner: always
  ['client → vendor with chat permission', 'CLIENT', 'VENDOR', f({ clientMayChat: true }), true],
  ['client → planner with chat permission', 'CLIENT', 'PLANNER', f({ clientMayChat: true }), true],
  ['co-host without chat permission → vendor', 'CLIENT', 'VENDOR', f(), false],

  // Planner → own client or lead
  ['planner → client on a hired event', 'PLANNER', 'CLIENT', f({ plannerOnClientEvent: true }), true],
  ['planner → client in CRM', 'PLANNER', 'CLIENT', f({ inPlannerCrm: true }), true],
  ['planner replying to a client', 'PLANNER', 'CLIENT', f({ replying: true }), true],
  ['planner → unrelated client', 'PLANNER', 'CLIENT', f(), false],

  // Planner → vendor or venue business: always
  ['planner → vendor', 'PLANNER', 'VENDOR', f(), true],

  // Vendor/venue → client or planner: reply, or a shared quote request/quote/booking/visit
  ['vendor replying to client', 'VENDOR', 'CLIENT', f({ replying: true }), true],
  ['vendor → client sharing a quote', 'VENDOR', 'CLIENT', f({ sharedObject: true }), true],
  ['vendor cold-messaging a client', 'VENDOR', 'CLIENT', f(), false],
  ['vendor replying to planner', 'VENDOR', 'PLANNER', f({ replying: true }), true],
  ['vendor cold-messaging a planner', 'VENDOR', 'PLANNER', f(), false],

  // Vendor ↔ vendor: only inside a shared event or booking thread
  ['vendor ↔ vendor in a shared booking', 'VENDOR', 'VENDOR', f({ sharedEventOrBooking: true }), true],
  ['vendor ↔ vendor otherwise', 'VENDOR', 'VENDOR', f(), false],

  // Guest → vendor or planner: after the event, business worked on it, attended, allowed, phone verified
  ['guest → vendor, all conditions met', 'GUEST', 'VENDOR', GUEST_OK, true],
  ['guest → planner, all conditions met', 'GUEST', 'PLANNER', GUEST_OK, true],
  ['guest → vendor before the event ends', 'GUEST', 'VENDOR', { ...GUEST_OK, eventEnded: false }, false],
  ['guest → vendor that did not work on it', 'GUEST', 'VENDOR', { ...GUEST_OK, businessWorkedOnEvent: false }, false],
  ['guest who did not attend → vendor', 'GUEST', 'VENDOR', { ...GUEST_OK, guestAttended: false }, false],
  ['guest → vendor with enquiries off', 'GUEST', 'VENDOR', { ...GUEST_OK, allowGuestEnquiries: false }, false],
  ['guest without verified phone → vendor', 'GUEST', 'VENDOR', { ...GUEST_OK, phoneVerified: false }, false],

  // Vendor or planner → guest: reply only, never first
  ['vendor replying to a guest', 'VENDOR', 'GUEST', f({ replying: true }), true],
  ['vendor messaging a guest first', 'VENDOR', 'GUEST', f(), false],
  ['planner replying to a guest', 'PLANNER', 'GUEST', f({ replying: true }), true],
  ['planner messaging a guest first', 'PLANNER', 'GUEST', f(), false],

  // Guest ↔ guest, guest → host via chat: not allowed
  ['guest ↔ guest', 'GUEST', 'GUEST', GUEST_OK, false],
  ['guest → host', 'GUEST', 'CLIENT', GUEST_OK, false],
  ['host → guest', 'CLIENT', 'GUEST', f({ clientMayChat: true }), false],
];

describe('canMessage (Backend.md §9a.1)', () => {
  it.each(ROWS)('%s', (_name, from, to, facts, allowed) => {
    expect(canMessage(from, to, facts).allowed).toBe(allowed);
  });

  // Anyone → someone who blocked them: not allowed, whatever else is true.
  const everything: MessageFacts = {
    ...GUEST_OK,
    replying: true,
    clientMayChat: true,
    sharedObject: true,
    sharedEventOrBooking: true,
    plannerOnClientEvent: true,
    inPlannerCrm: true,
  };
  const pairs: [PartyKind, PartyKind][] = [
    ['CLIENT', 'VENDOR'],
    ['PLANNER', 'CLIENT'],
    ['PLANNER', 'VENDOR'],
    ['VENDOR', 'CLIENT'],
    ['VENDOR', 'VENDOR'],
    ['GUEST', 'VENDOR'],
    ['VENDOR', 'GUEST'],
  ];
  it.each(pairs)('a block stops %s → %s even when every other condition holds', (from, to) => {
    expect(canMessage(from, to, everything).allowed).toBe(true);
    expect(canMessage(from, to, { ...everything, blocked: true })).toEqual({ allowed: false, reason: 'blocked' });
  });

  it('explains refusals with a stable reason', () => {
    expect(canMessage('VENDOR', 'CLIENT', f()).reason).toBe('vendor-reply-or-shared-object-only');
    expect(canMessage('GUEST', 'VENDOR', f()).reason).toBe('guest-enquiry-not-allowed');
  });
});
