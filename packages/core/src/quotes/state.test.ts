import type { QuoteStatus } from '@tiwa/db';
import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '../shared/errors.js';
import { QUOTE_TRANSITIONS, assertQuoteTransition } from './state.js';

const ALL: QuoteStatus[] = ['DRAFT', 'SENT', 'CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'];

describe('quote state machine', () => {
  it('allows the documented loop SENT <-> CHANGES_REQUESTED', () => {
    assertQuoteTransition('DRAFT', 'SENT');
    assertQuoteTransition('SENT', 'CHANGES_REQUESTED');
    assertQuoteTransition('CHANGES_REQUESTED', 'SENT');
    assertQuoteTransition('SENT', 'ACCEPTED');
  });

  it('accepts every listed transition and rejects everything else', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = (QUOTE_TRANSITIONS[from] ?? []).includes(to);
        if (allowed) {
          expect(() => assertQuoteTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertQuoteTransition(from, to)).toThrow(InvalidTransitionError);
        }
      }
    }
  });

  it('terminal states have no outgoing transitions', () => {
    for (const terminal of ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'] as const) {
      expect(QUOTE_TRANSITIONS[terminal]).toEqual([]);
    }
  });
});
