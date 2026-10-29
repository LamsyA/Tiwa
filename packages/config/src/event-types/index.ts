import { EVENT_TYPES } from './templates.js';
import type { EventFormat, EventTypeTemplate, FormatRules } from './types.js';

export * from './types.js';
export { VENDOR_CATEGORIES, type VendorCategory } from './vendor-categories.js';
export { EVENT_TYPES };

export const FORMAT_RULES: Record<EventFormat, FormatRules> = {
  PRIVATE_CELEBRATION: {
    label: 'Private celebrations',
    visibilities: ['PRIVATE', 'LINK_ONLY'],
    defaultVisibility: 'PRIVATE',
    ticketsAllowed: false,
  },
  CORPORATE: {
    label: 'Corporate',
    visibilities: ['PRIVATE', 'LINK_ONLY'],
    defaultVisibility: 'PRIVATE',
    ticketsAllowed: false,
  },
  PUBLIC_TICKETED: {
    label: 'Public & ticketed',
    visibilities: ['PRIVATE', 'LINK_ONLY', 'PUBLIC'],
    defaultVisibility: 'PUBLIC',
    ticketsAllowed: true,
  },
  COMMUNITY: {
    label: 'Community',
    visibilities: ['PRIVATE', 'LINK_ONLY', 'PUBLIC'],
    defaultVisibility: 'LINK_ONLY',
    ticketsAllowed: true,
  },
};

const BY_KEY = new Map(EVENT_TYPES.map((template) => [template.key, template]));

export function getEventType(key: string): EventTypeTemplate | undefined {
  return BY_KEY.get(key);
}

/** Lightweight list for type pickers (no checklists or budgets on the wire). */
export function eventTypeCards(): { key: string; format: EventFormat; label: string; blurb: string }[] {
  return EVENT_TYPES.map(({ key, format, label, blurb }) => ({ key, format, label, blurb }));
}

export function suggestEventName(template: EventTypeTemplate, firstName: string): string {
  const name = firstName.trim();
  if (!name) return template.label;
  return template.nameSuggestion.replace('{name}', name);
}
