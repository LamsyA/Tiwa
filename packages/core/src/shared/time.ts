// UTC primitives. Event timezones are a display concern (Frontend Intl);
// storage and comparisons always use these UTC helpers.

export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}

export function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

/** Milliseconds from `b` to `a` (negative when a is earlier). */
export function diffMs(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

export function isPast(date: Date, at: Date = new Date()): boolean {
  return date.getTime() < at.getTime();
}

export function isFuture(date: Date, at: Date = new Date()): boolean {
  return date.getTime() > at.getTime();
}

/** 00:00:00.000 UTC of the given day — used for day-bucket grouping. */
export function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}
