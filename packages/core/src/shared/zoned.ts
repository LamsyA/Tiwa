// Wall-clock time in an IANA timezone ↔ UTC instants, with Intl only (no
// date library: Frontend.md §9 and the same code runs on server and client).

function partsInZone(ms: number, timeZone: string): Record<string, number> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds. */
function offsetMs(ms: number, timeZone: string): number {
  const p = partsInZone(ms, timeZone);
  const asUtc = Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** `2026-12-12` + `18:30` in `Africa/Lagos` → the UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  const first = guess - offsetMs(guess, timeZone);
  // Re-check once so DST boundaries resolve to the right side.
  return new Date(guess - offsetMs(first, timeZone));
}

/** UTC instant → `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` on the wall clock of `timeZone`. */
export function utcToZoned(instant: Date, timeZone: string): { date: string; time: string } {
  const p = partsInZone(instant.getTime(), timeZone);
  const pad = (n: number | undefined) => String(n ?? 0).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}
