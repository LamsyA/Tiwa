// Minimal .ics builder (GST-15, UF-08-5): VEVENT with UID, DTSTAMP,
// DTSTART/DTEND, SUMMARY, DESCRIPTION, LOCATION. Escapes per RFC 5545
// (\, ;, newlines) and folds lines at 75 octets. Validated against an ics
// parser in tests (Google/Apple/Outlook consume this subset).

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  startsAt: Date;
  endsAt: Date | null;
  url?: string | undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** UTC basic format: 20310301T150000Z. */
export function icsDate(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes <= 75) return line;
  // Fold on UTF-8 boundaries: never split a multi-byte character.
  let out = '';
  let count = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (count + size > 75) {
      out += '\r\n ';
      count = 1; // the leading space
    }
    out += char;
    count += size;
  }
  return out;
}

export function icsEvent(event: IcsEvent): string {
  const endsAt = event.endsAt ?? new Date(event.startsAt.getTime() + 4 * 60 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tiwa//Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    `DTEND:${icsDate(endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Google Calendar template link (GST-15: "Add to calendar"). Basic-format dates need no separators. */
export function googleCalendarUrl(input: {
  title: string;
  details?: string | undefined;
  location?: string | undefined;
  startsAt: Date;
  endsAt: Date | null;
}): string {
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + 4 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${icsDate(input.startsAt)}/${icsDate(endsAt)}`,
    ...(input.details ? { details: input.details } : {}),
    ...(input.location ? { location: input.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
