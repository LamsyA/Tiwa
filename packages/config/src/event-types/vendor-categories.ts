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
