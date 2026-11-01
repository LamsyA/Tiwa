import type { BookingStatus } from '@tiwa/db';
import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '../shared/errors.js';
import { BOOKING_TRANSITIONS, assertBookingTransition } from './state.js';

const ALL: BookingStatus[] = [
  'ACCEPTED',
  'DEPOSIT_DUE',
  'CONFIRMED',
  'IN_PROGRESS',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
];

describe('booking state machine', () => {
  it('walks the happy path deposit -> confirmed -> delivered -> completed', () => {
    assertBookingTransition('DEPOSIT_DUE', 'CONFIRMED');
    assertBookingTransition('CONFIRMED', 'IN_PROGRESS');
    assertBookingTransition('IN_PROGRESS', 'DELIVERED');
    assertBookingTransition('DELIVERED', 'COMPLETED');
  });

  it('holds expire and disputes resolve only through decide', () => {
    assertBookingTransition('DEPOSIT_DUE', 'CANCELLED');
    assertBookingTransition('CONFIRMED', 'DISPUTED');
    assertBookingTransition('DISPUTED', 'COMPLETED');
    assertBookingTransition('DISPUTED', 'CANCELLED');
  });

  it('accepts every listed transition and rejects everything else', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = (BOOKING_TRANSITIONS[from] ?? []).includes(to);
        if (allowed) {
          expect(() => assertBookingTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertBookingTransition(from, to)).toThrow(InvalidTransitionError);
        }
      }
    }
  });
});
