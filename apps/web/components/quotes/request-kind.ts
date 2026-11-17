import {
  Building2,
  Camera,
  ClipboardList,
  Music,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// D-X80: every request reads like what it is. A venue gets a booking request
// (date, hours, capacity), a photographer a coverage request, a caterer a food
// order, a DJ a performance booking — not one generic brief for everyone.
export type RequestKind = 'venue' | 'coverage' | 'food' | 'performance' | 'styling' | 'planning' | 'service';

const KIND_BY_CATEGORY: Record<string, RequestKind> = {
  venue: 'venue',
  photography: 'coverage',
  videography: 'coverage',
  av_production: 'coverage',
  catering: 'food',
  small_chops: 'food',
  cake: 'food',
  drinks: 'food',
  dj: 'performance',
  live_band: 'performance',
  mc: 'performance',
  sound_lighting: 'performance',
  speakers: 'performance',
  entertainment: 'performance',
  decor: 'styling',
  makeup: 'styling',
  fashion: 'styling',
  rentals: 'styling',
  planning: 'planning',
};

export function requestKind(category: string): RequestKind {
  return KIND_BY_CATEGORY[category] ?? 'service';
}

export interface KindStyle {
  icon: LucideIcon;
  /** Soft chip + strong text, used for the badge and icon tile. */
  chip: string;
  /** Left accent bar on cards. */
  bar: string;
  /** Header wash on the brief card. */
  wash: string;
}

export const KIND_STYLE: Record<RequestKind, KindStyle> = {
  venue: {
    icon: Building2,
    chip: 'bg-teal-soft text-teal-strong',
    bar: 'bg-teal',
    wash: 'from-[color-mix(in_oklab,var(--teal)_14%,transparent)]',
  },
  coverage: {
    icon: Camera,
    chip: 'bg-brand-soft text-brand-strong',
    bar: 'bg-brand',
    wash: 'from-[color-mix(in_oklab,var(--brand)_12%,transparent)]',
  },
  food: {
    icon: UtensilsCrossed,
    chip: 'bg-warning-soft text-warning',
    bar: 'bg-[var(--accent)]',
    wash: 'from-[color-mix(in_oklab,var(--accent)_16%,transparent)]',
  },
  performance: {
    icon: Music,
    chip: 'bg-[color-mix(in_oklab,#7c3aed_14%,transparent)] text-[#6d28d9] dark:text-[#c4b5fd]',
    bar: 'bg-[#7c3aed]',
    wash: 'from-[color-mix(in_oklab,#7c3aed_12%,transparent)]',
  },
  styling: {
    icon: Sparkles,
    chip: 'bg-[color-mix(in_oklab,#db2777_12%,transparent)] text-[#be185d] dark:text-[#f9a8d4]',
    bar: 'bg-[#db2777]',
    wash: 'from-[color-mix(in_oklab,#db2777_10%,transparent)]',
  },
  planning: {
    icon: ClipboardList,
    chip: 'bg-accent/15 text-[#8a6500] dark:text-[#f2b705]',
    bar: 'bg-[var(--accent)]',
    wash: 'from-[color-mix(in_oklab,var(--accent)_16%,transparent)]',
  },
  service: {
    icon: Wrench,
    chip: 'bg-surface-2 text-text',
    bar: 'bg-border',
    wash: 'from-[color-mix(in_oklab,var(--text)_5%,transparent)]',
  },
};

/** Lines a vendor of this kind usually quotes; `perGuest` lines start at the guest count. */
export const KIND_SUGGESTIONS: Record<RequestKind, { key: string; perGuest?: boolean }[]> = {
  venue: [{ key: 'hallHire' }, { key: 'chairsTables', perGuest: true }, { key: 'security' }, { key: 'cleaning' }],
  coverage: [{ key: 'coverage' }, { key: 'editedPhotos' }, { key: 'highlightVideo' }, { key: 'album' }],
  food: [{ key: 'portions', perGuest: true }, { key: 'servers' }, { key: 'delivery' }, { key: 'setup' }],
  performance: [{ key: 'performance' }, { key: 'soundSystem' }, { key: 'extraHour' }, { key: 'transport' }],
  styling: [{ key: 'design' }, { key: 'setupTeardown' }, { key: 'materials' }, { key: 'transport' }],
  planning: [],
  service: [{ key: 'service' }, { key: 'transport' }],
};

/** What to check before quoting, per kind. */
export const KIND_CHECKS: Record<RequestKind, string[]> = {
  venue: ['dateFree', 'capacity', 'layout', 'accessHours'],
  coverage: ['dateFree', 'hours', 'deliverables', 'travel'],
  food: ['portions', 'dietary', 'servingTime', 'delivery'],
  performance: ['dateFree', 'setTimes', 'power', 'travel'],
  styling: ['dateFree', 'theme', 'setupTime', 'travel'],
  planning: [],
  service: ['dateFree', 'scope', 'travel'],
};
