import Link from 'next/link';

// Month-grouped agenda (D-X70): date tile, weekday and time, a countdown pill,
// past items dimmed. Used by the planner and vendor calendars.

export interface AgendaItem {
  id: string;
  title: string;
  href: string;
  startsAt: string | Date | null;
  timezone?: string | null;
  meta?: string | null;
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** A booking's service day is stored as midnight UTC with no time (D-X79): show the day, not "1:00 AM". */
function isDateOnly(date: Date): boolean {
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
}

/** "in 12 days", or months/years when far off — "In 1,910 days" helps nobody. */
function countdown(days: number, inDays: (count: number) => string): string {
  if (days <= 60) return inDays(days);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return days < 730 ? rtf.format(Math.round(days / 30), 'month') : rtf.format(Math.round(days / 365), 'year');
}

export function Agenda({
  items,
  labels,
}: {
  items: AgendaItem[];
  labels: { today: string; inDays: (count: number) => string; past: string; noDate: string };
}) {
  const groups = new Map<string, AgendaItem[]>();
  // Soonest first; undated last (D-X79: the list was in creation order).
  const sorted = [...items].sort((a, b) => {
    const at = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
    const bt = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
    return at - bt;
  });
  for (const item of sorted) {
    const key = item.startsAt
      ? new Intl.DateTimeFormat('en', {
          month: 'long',
          year: 'numeric',
          timeZone: isDateOnly(new Date(item.startsAt)) ? 'UTC' : (item.timezone ?? undefined),
        }).format(new Date(item.startsAt))
      : labels.noDate;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([month, rows]) => (
        <section key={month} className="flex flex-col gap-2">
          <h2 className="text-muted sticky top-0 z-10 px-1 text-xs font-semibold tracking-[0.14em] uppercase">
            {month}
          </h2>
          <ul className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]">
            {rows.map((item) => {
              const start = item.startsAt ? new Date(item.startsAt) : null;
              const days = start ? daysUntil(start) : null;
              const past = days !== null && days < 0;
              const dateOnly = start ? isDateOnly(start) : false;
              const tz = dateOnly ? 'UTC' : (item.timezone ?? undefined);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`hover:bg-surface-2/70 group flex items-center gap-3 px-3 py-2.5 transition sm:px-4 ${past ? 'opacity-60' : ''}`}
                  >
                    <span className="bg-bg border-border/70 flex w-12 shrink-0 flex-col items-center rounded-xl border py-1 shadow-[var(--shadow-1)]">
                      <span className="text-brand-strong text-[10px] font-bold uppercase">
                        {start ? new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: tz }).format(start) : '—'}
                      </span>
                      <span className="font-display text-lg leading-none font-bold">
                        {start ? new Intl.DateTimeFormat('en', { day: 'numeric', timeZone: tz }).format(start) : ''}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold group-hover:underline">{item.title}</span>
                      <span className="text-muted block truncate text-xs">
                        {[
                          start && !dateOnly
                            ? new Intl.DateTimeFormat('en', {
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: tz,
                              }).format(start)
                            : null,
                          item.meta,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {days !== null && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          past
                            ? 'bg-surface-2 text-muted'
                            : days <= 7
                              ? 'bg-brand-soft text-brand-strong'
                              : 'bg-teal-soft text-teal-strong'
                        }`}
                      >
                        {past ? labels.past : days === 0 ? labels.today : countdown(days, labels.inDays)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
