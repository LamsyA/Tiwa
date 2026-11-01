// Who may message whom (Backend.md §9a.1). Pure: the caller loads the facts
// (blocks, shared events, attendance, …) and this decides. Kept free of the
// database so every row of the spec is covered by a table-driven test.

/** The side a party is on in this conversation. */
export type PartyKind = 'CLIENT' | 'PLANNER' | 'VENDOR' | 'GUEST';

export interface MessageFacts {
  /** Either side has blocked the other. */
  blocked: boolean;
  /** The target already wrote to the sender in this context (the sender is replying). */
  replying: boolean;
  /** Client side only: host, or a co-host whose permissions include chat. */
  clientMayChat: boolean;
  /** A quote request, quote, booking or site visit links the two parties. */
  sharedObject: boolean;
  /** Both are participants of the same event or booking thread. */
  sharedEventOrBooking: boolean;
  /** Planner → client: the planner is hired on one of the client's events. */
  plannerOnClientEvent: boolean;
  /** Planner → client: the client is in the planner's CRM (P10). */
  inPlannerCrm: boolean;
  /** Guest enquiries: the event has ended. */
  eventEnded: boolean;
  /** Guest enquiries: the business worked on that event. */
  businessWorkedOnEvent: boolean;
  /** Guest enquiries: RSVP yes, checked in, or uploaded to Moments. */
  guestAttended: boolean;
  /** Guest enquiries: the business allows them (BusinessProfile.allowGuestEnquiries). */
  allowGuestEnquiries: boolean;
  /** Guest enquiries: the guest verified a phone number with OTP. */
  phoneVerified: boolean;
}

export const NO_FACTS: MessageFacts = {
  blocked: false,
  replying: false,
  clientMayChat: false,
  sharedObject: false,
  sharedEventOrBooking: false,
  plannerOnClientEvent: false,
  inPlannerCrm: false,
  eventEnded: false,
  businessWorkedOnEvent: false,
  guestAttended: false,
  allowGuestEnquiries: false,
  phoneVerified: false,
};

export type CanMessageReason =
  | 'ok'
  | 'blocked'
  | 'client-needs-chat-permission'
  | 'planner-needs-client-link'
  | 'vendor-reply-or-shared-object-only'
  | 'peers-need-shared-event'
  | 'guest-enquiry-not-allowed'
  | 'reply-only-to-guests'
  | 'not-allowed';

export interface CanMessageResult {
  allowed: boolean;
  reason: CanMessageReason;
}

const yes: CanMessageResult = { allowed: true, reason: 'ok' };
const no = (reason: CanMessageReason): CanMessageResult => ({ allowed: false, reason });

/** May `from` send a message to `to`? Blocks always win. */
export function canMessage(from: PartyKind, to: PartyKind, facts: MessageFacts): CanMessageResult {
  if (facts.blocked) return no('blocked');

  switch (from) {
    case 'CLIENT':
      // → vendor, venue or planner business: always (from a profile, request, quote, booking, visit).
      if (to === 'VENDOR' || to === 'PLANNER') {
        return facts.clientMayChat ? yes : no('client-needs-chat-permission');
      }
      // Clients talk to each other in the event-team thread; guests use invites and Moments.
      return to === 'CLIENT' && facts.sharedEventOrBooking ? yes : no('not-allowed');

    case 'PLANNER':
      if (to === 'CLIENT') {
        return facts.plannerOnClientEvent || facts.inPlannerCrm || facts.replying
          ? yes
          : no('planner-needs-client-link');
      }
      if (to === 'VENDOR') return yes; // business to business
      if (to === 'GUEST') return facts.replying ? yes : no('reply-only-to-guests');
      return facts.sharedEventOrBooking ? yes : no('peers-need-shared-event'); // planner ↔ planner

    case 'VENDOR':
      if (to === 'CLIENT' || to === 'PLANNER') {
        return facts.replying || facts.sharedObject ? yes : no('vendor-reply-or-shared-object-only');
      }
      if (to === 'GUEST') return facts.replying ? yes : no('reply-only-to-guests');
      return facts.sharedEventOrBooking ? yes : no('peers-need-shared-event'); // vendor ↔ vendor

    case 'GUEST':
      if (to === 'VENDOR' || to === 'PLANNER') {
        const ok =
          facts.eventEnded &&
          facts.businessWorkedOnEvent &&
          facts.guestAttended &&
          facts.allowGuestEnquiries &&
          facts.phoneVerified;
        return ok ? yes : no('guest-enquiry-not-allowed');
      }
      return no('not-allowed'); // guest ↔ guest, guest → host
  }
}
