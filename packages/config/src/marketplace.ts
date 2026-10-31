// Venue space constants (P6-T08). Pure data — safe to import in client
// components (unlike @tiwa/core, which pulls node:crypto into the bundle).

export const VENUE_AMENITY_KEYS = [
  'parking',
  'power_backup',
  'air_conditioning',
  'stage',
  'changing_room',
  'kitchen',
  'sound_system',
  'wheelchair_access',
] as const;

export type VenueAmenity = (typeof VENUE_AMENITY_KEYS)[number];

export const DAY_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'] as const;

export type DaySlot = (typeof DAY_SLOTS)[number];
