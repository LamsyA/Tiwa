// UF-08-5: the .ics file must open in Google Calendar, Apple Calendar and
// Outlook. node-ical is an independent parser — if it reads UID/DTSTART/
// DTEND/SUMMARY back, the big three accept the file.
import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsDate, icsEvent } from './ics.js';

describe('ics', () => {
  it('builds a parseable VEVENT (validated with node-ical)', async () => {
    const { default: ical } = await import('node-ical');
    const text = icsEvent({
      uid: 'guest-1@tiwa.app',
      summary: "Ada's 40th",
      description: 'Hosted by Ngozi, 4–9 PM',
      location: 'The Hall, Lagos',
      startsAt: new Date('2031-03-01T15:00:00Z'),
      endsAt: new Date('2031-03-01T20:00:00Z'),
      url: 'https://tiwa.app/i/token',
    });
    expect(text).toContain("SUMMARY:Ada's 40th");
    const parsed = ical.parseICS(text) as Record<
      string,
      { type?: string; uid?: string; summary?: string; start?: Date; end?: Date }
    >;
    const event = Object.values(parsed).find((component) => component.type === 'VEVENT');
    expect(event?.uid).toBe('guest-1@tiwa.app');
    expect(event?.summary).toBe("Ada's 40th");
    expect(event?.start).toEqual(new Date('2031-03-01T15:00:00Z'));
    expect(event?.end).toEqual(new Date('2031-03-01T20:00:00Z'));
  });

  it('defaults missing ends to +4h and escapes commas/semicolons', async () => {
    const { default: ical } = await import('node-ical');
    const text = icsEvent({
      uid: 'a@b.c',
      summary: 'Party; bring friends, family',
      startsAt: new Date('2031-03-01T15:00:00Z'),
      endsAt: null,
    });
    const parsed = ical.parseICS(text) as Record<string, { type?: string; summary?: string; end?: Date }>;
    const event = Object.values(parsed).find((component) => component.type === 'VEVENT');
    expect(event?.summary).toBe('Party; bring friends, family');
    expect(event?.end).toEqual(new Date('2031-03-01T19:00:00Z'));
  });

  it('formats UTC basic dates and Google links', () => {
    expect(icsDate(new Date('2031-03-01T15:00:00Z'))).toBe('20310301T150000Z');
    const url = googleCalendarUrl({ title: 'P', startsAt: new Date('2031-03-01T15:00:00Z'), endsAt: null });
    expect(url).toContain('dates=20310301T150000Z%2F20310301T190000Z');
  });
});
