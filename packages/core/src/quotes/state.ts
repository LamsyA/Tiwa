import type { QuoteStatus } from '@tiwa/db';
import { InvalidTransitionError } from '../shared/errors.js';

// Quote state machine (Backend.md §5.2):
// DRAFT → SENT → (CHANGES_REQUESTED → SENT)* → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN.
// EXPIRED is set by the expiry job; WITHDRAWN is the vendor pulling a quote
// back before it is decided.

const TERMINAL: QuoteStatus[] = ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'];

export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'WITHDRAWN', 'EXPIRED'],
  SENT: ['CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
  CHANGES_REQUESTED: ['SENT', 'WITHDRAWN', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return TERMINAL.includes(status);
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!(QUOTE_TRANSITIONS[from] ?? []).includes(to)) {
    throw new InvalidTransitionError(`Cannot move quote from ${from} to ${to}`, { from, to });
  }
}
