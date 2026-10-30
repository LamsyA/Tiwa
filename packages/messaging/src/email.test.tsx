import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeEmail, ResendEmail } from './email.js';
import { InviteEmail } from './templates/invite.js';
import { ReminderEmail } from './templates/reminder.js';
import { UpdateEmail } from './templates/update.js';

const invite = (
  <InviteEmail
    guestName="Ada"
    eventName="Ada's 40th"
    hostLine="Hosted by Ngozi"
    dateLine="Saturday, 1 March 2031 at 4:00 PM"
    venueLine="The Hall, Lagos"
    yesUrl="https://tiwa.app/i/tok?r=yes&sig=s"
    noUrl="https://tiwa.app/i/tok?r=no&sig=s"
    inviteUrl="https://tiwa.app/i/tok"
  />
);

describe('FakeEmail', () => {
  it('renders the template and records html + text', async () => {
    const email = new FakeEmail();
    const result = await email.send({ to: 'ada@example.com', subject: "You're invited", react: invite });
    expect(result.id).toBe('fake-email-1');
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.html).toContain("Ada&#x27;s 40th");
    expect(email.sent[0]?.html).toContain('https://tiwa.app/i/tok?r=yes&amp;sig=s');
    expect(email.sent[0]?.text).toContain("ADA'S 40TH");
    email.clear();
    expect(email.sent).toEqual([]);
  });
});

describe('ResendEmail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts rendered html + text to Resend', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const email = new ResendEmail({ apiKey: 'key', from: 'Tiwa <hello@tiwa.app>' });
    const result = await email.send({ to: 'ada@example.com', subject: 'Hi', react: invite });
    expect(result).toEqual({ id: 're_1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('Tiwa <hello@tiwa.app>');
    expect(body.to).toEqual(['ada@example.com']);
    expect(body.html).toContain('Ada');
    expect(body.text).toContain('Ada');
  });

  it('throws on provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })));
    const email = new ResendEmail({ apiKey: 'bad', from: 'Tiwa <hello@tiwa.app>' });
    await expect(email.send({ to: 'a@b.c', subject: 'x', react: invite })).rejects.toThrow('HTTP 422');
  });
});

describe('templates', () => {
  it('reminder and update render their copy and links', async () => {
    const email = new FakeEmail();
    await email.send({
      to: 'ada@example.com',
      subject: 'Reminder',
      react: (
        <ReminderEmail
          guestName="Ada"
          eventName="Ada's 40th"
          dateLine="Saturday at 4 PM"
          yesUrl="https://tiwa.app/i/tok?r=yes"
          noUrl="https://tiwa.app/i/tok?r=no"
        />
      ),
    });
    await email.send({
      to: 'ada@example.com',
      subject: 'Update',
      react: (
        <UpdateEmail
          guestName="Ada"
          eventName="Ada's 40th"
          headline="New start time"
          body="We now start at 5 PM."
          inviteUrl="https://tiwa.app/i/tok"
        />
      ),
    });
    expect(email.sent[0]?.html).toContain('Are you coming');
    expect(email.sent[1]?.html).toContain('New start time');
    expect(email.sent[1]?.text).toContain('We now start at 5 PM.');
  });
});
