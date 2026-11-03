// Marketplace vendor categories (MKT-03). Templates reference these keys.
export const VENDOR_CATEGORIES = {
  venue: 'Venue',
  catering: 'Catering',
  small_chops: 'Small chops',
  drinks: 'Drinks and bar',
  cake: 'Cake and desserts',
  decor: 'Decor and styling',
  photography: 'Photography',
  videography: 'Videography',
  dj: 'DJ',
  live_band: 'Live band',
  mc: 'MC or host',
  sound_lighting: 'Sound and lighting',
  rentals: 'Chairs, tables and tents',
  makeup: 'Makeup and hair',
  fashion: 'Outfits and tailoring',
  printing: 'Printing and stationery',
  souvenirs: 'Souvenirs and gifts',
  security: 'Security',
  ushers: 'Ushers and hostesses',
  transport: 'Transport',
  av_production: 'AV and stage production',
  speakers: 'Speakers and talent',
  entertainment: 'Kids entertainment',
} as const;

export type VendorCategory = keyof typeof VENDOR_CATEGORIES;

/**
 * Budget line a booking in this vendor category counts against (P9, D-X28)
 * when the template has no budget category with the same key. Keys are tried
 * in order; the first one the event has wins, otherwise `misc`.
 */
export const VENDOR_BUDGET_KEYS: Partial<Record<VendorCategory, string[]>> = {
  small_chops: ['catering'],
  drinks: ['catering'],
  cake: ['catering'],
  photography: ['media'],
  videography: ['media'],
  dj: ['entertainment', 'music'],
  live_band: ['entertainment', 'music'],
  mc: ['entertainment'],
  sound_lighting: ['entertainment', 'production'],
  av_production: ['production', 'entertainment'],
  speakers: ['speakers', 'entertainment'],
  entertainment: ['entertainment'],
  makeup: ['attire'],
  fashion: ['attire'],
  rentals: ['decor', 'venue'],
  printing: ['printing', 'misc'],
};

/** The event's budget key for a booking category, or null when nothing fits (shown as "Other"). */
export function budgetKeyFor(vendorCategory: string, eventBudgetKeys: readonly string[]): string | null {
  const keys = new Set(eventBudgetKeys);
  if (keys.has(vendorCategory)) return vendorCategory;
  for (const key of VENDOR_BUDGET_KEYS[vendorCategory as VendorCategory] ?? []) if (keys.has(key)) return key;
  return keys.has('misc') ? 'misc' : null;
}

/**
 * Services that can only do one event at a time (D-X43): accepting a booking
 * blocks their calendar for that date, and a second booking on the same date
 * is refused. Others (caterers, drinks, printing…) can serve several events a day.
 */
export const DATE_EXCLUSIVE_CATEGORIES: readonly VendorCategory[] = [
  'venue',
  'photography',
  'videography',
  'dj',
  'live_band',
  'mc',
  'makeup',
  'sound_lighting',
  'av_production',
  'speakers',
  'entertainment',
];

export function isDateExclusive(category: string): boolean {
  return (DATE_EXCLUSIVE_CATEGORIES as readonly string[]).includes(category);
}

/** What a planner specialises in (D-X44): shown on planner profiles and searchable. */
export const PLANNER_SPECIALTIES = {
  weddings: 'Weddings',
  traditional: 'Traditional ceremonies',
  birthdays: 'Birthdays and parties',
  corporate: 'Corporate events',
  conferences: 'Conferences and launches',
  funerals: 'Funerals and memorials',
  religious: 'Church and religious programmes',
  reunions: 'Reunions and alumni',
  concerts: 'Concerts and shows',
  kids: 'Kids parties',
  destination: 'Destination events',
} as const;

export type PlannerSpecialty = keyof typeof PLANNER_SPECIALTIES;

/** Label for a vendor category or planner specialty key. */
export function serviceLabel(key: string): string {
  return (
    (VENDOR_CATEGORIES as Record<string, string>)[key] ?? (PLANNER_SPECIALTIES as Record<string, string>)[key] ?? key
  );
}
