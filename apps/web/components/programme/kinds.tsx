import {
  Camera,
  Coffee,
  DoorOpen,
  HandHeart,
  Mic,
  Music,
  PartyPopper,
  Sparkles,
  Star,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';

// D-X92: one icon and tint per programme item kind, shared by the host
// editor and the guest page. Tints are soft so the page stays calm.

export const PROGRAMME_KIND_LIST = [
  'arrival',
  'speech',
  'prayer',
  'music',
  'dance',
  'meal',
  'toast',
  'ceremony',
  'entertainment',
  'photos',
  'break',
  'other',
] as const;
export type Kind = (typeof PROGRAMME_KIND_LIST)[number];

export const KIND_ICON: Record<Kind, LucideIcon> = {
  arrival: DoorOpen,
  speech: Mic,
  prayer: HandHeart,
  music: Music,
  dance: PartyPopper,
  meal: UtensilsCrossed,
  toast: Wine,
  ceremony: Sparkles,
  entertainment: Star,
  photos: Camera,
  break: Coffee,
  other: Sparkles,
};

/** Tailwind classes for the icon bubble of each kind. */
export const KIND_TINT: Record<Kind, string> = {
  arrival: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  speech: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  prayer: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  music: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
  dance: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300',
  meal: 'bg-orange-500/14 text-orange-700 dark:text-orange-300',
  toast: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  ceremony: 'bg-brand-soft text-brand-strong',
  entertainment: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  photos: 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
  break: 'bg-stone-500/12 text-stone-700 dark:text-stone-300',
  other: 'bg-surface-2 text-muted',
};

/** D-X93: the host's own type name for `custom:<label>` kinds, else null. */
export function customLabel(kind: string | null | undefined): string | null {
  return kind?.startsWith('custom:') ? kind.slice('custom:'.length) : null;
}

export function asKind(value: string | null | undefined): Kind {
  return (PROGRAMME_KIND_LIST as readonly string[]).includes(value ?? '') ? (value as Kind) : 'other';
}

export function KindIcon({ kind, className = 'size-10' }: { kind: string | null | undefined; className?: string }) {
  const k = asKind(kind);
  const Icon = KIND_ICON[k];
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl ${KIND_TINT[k]} ${className}`} aria-hidden>
      <Icon className="size-[45%]" />
    </span>
  );
}
