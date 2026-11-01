import type { BookingStatus } from '@tiwa/db';
import { InvalidTransitionError } from '../shared/errors.js';

// Booking state machine (Backend.md §5.1). Creation lands on ACCEPTED (no
// deposit milestone) or DEPOSIT_DUE (deposit milestone + hold); the rest are
// transitions. DISPUTED is entered from CONFIRMED / IN_PROGRESS / DELIVERED
// and left only by the admin decision (P8/P16).

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  DEPOSIT_DUE: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!(BOOKING_TRANSITIONS[from] ?? []).includes(to)) {
    throw new InvalidTransitionError(`Cannot move booking from ${from} to ${to}`, { from, to });
  }
}
