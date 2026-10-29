// Event-type templates (PRD.md §3). Every event-specific word lives here,
// never in app code (D-P02): labels, checklists, budget splits, vendor
// categories, programme. Side-effect free so any runtime can import it.

export const EVENT_FORMATS = ['PRIVATE_CELEBRATION', 'CORPORATE', 'PUBLIC_TICKETED', 'COMMUNITY'] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export const VISIBILITIES = ['PRIVATE', 'LINK_ONLY', 'PUBLIC'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Checklist buckets, earliest first. The plan page groups tasks by these. */
export const TIMEFRAMES = ['12w', '8w', '4w', '2w', '1w', 'day', 'after'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Days before the event each bucket's tasks fall due (negative = after). */
export const TIMEFRAME_DAYS_BEFORE: Record<Timeframe, number> = {
  '12w': 84,
  '8w': 56,
  '4w': 28,
  '2w': 14,
  '1w': 7,
  day: 0,
  after: -3,
};

export interface ChecklistItem {
  key: string;
  title: string;
  timeframe: Timeframe;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface BudgetSplit {
  key: string;
  label: string;
  /** Whole percent of the planned budget; a template's splits sum to 100. */
  percent: number;
}

export interface ProgrammeTemplate {
  key: string;
  title: string;
  /** Minutes after the event start; omitted = untimed. */
  offsetMinutes?: number;
  durationMinutes?: number;
}

export interface FormatRules {
  label: string;
  /** Visibilities the wizard offers; PUBLIC only where the format allows it (UF-03 step 4). */
  visibilities: Visibility[];
  defaultVisibility: Visibility;
  /** Tickets need a public event (UF-03-4). */
  ticketsAllowed: boolean;
}

export interface EventTypeTemplate {
  key: string;
  format: EventFormat;
  label: string;
  /** Short line under the label on the type card. */
  blurb: string;
  /** Suggested event name; `{name}` is replaced with the host's first name. */
  nameSuggestion: string;
  defaultDurationHours: number;
  /** Multi-day by default (e.g. conferences, festivals). */
  days: number;
  features: { invites: boolean; moments: boolean; tickets: boolean };
  checklist: ChecklistItem[];
  budget: BudgetSplit[];
  vendorCategories: string[];
  programme: ProgrammeTemplate[];
}
