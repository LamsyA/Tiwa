import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudWhatsApp, FakeWhatsApp, parseWhatsAppWebhook, verifyWhatsAppSignature } from './whatsapp.js';

describe('FakeWhatsApp', () => {
  it('records template sends', async () => {
    const wa = new FakeWhatsApp();
    const result = await wa.sendTemplate({
      to: '+2348012345678',
      template: 'tiwa_invite_v1',
      lang: 'en',
      params: ['Ada', 'Party'],
    });
    expect(result.id).toBe('fake-wa-1');
    expect(wa.sent).toHaveLength(1);
    wa.clear();
    expect(wa.sent).toEqual([]);
  });
});

describe('CloudWhatsApp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts a template message to the Graph API', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const wa = new CloudWhatsApp({ token: 'tok', phoneNumberId: '123' });
    const result = await wa.sendTemplate({
      to: '+2348012345678',
      template: 'tiwa_invite_v1',
      lang: 'en',
      params: ['Ada'],
      buttons: [{ id: 'yes', title: "I'm coming" }],
    });
    expect(result).toEqual({ id: 'wamid.1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/messages');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348012345678',
      type: 'template',
      template: { name: 'tiwa_invite_v1', language: { code: 'en' } },
    });
    expect(body.template.components[0]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] });
  });

  it('throws on provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );
    const wa = new CloudWhatsApp({ token: 'bad', phoneNumberId: '123' });
    await expect(wa.sendTemplate({ to: '+2348012345678', template: 't', lang: 'en', params: [] })).rejects.toThrow(
      'HTTP 401',
    );
  });
});

describe('verifyWhatsAppSignature', () => {
  const secret = 'app-secret';
  const raw = '{"object":"whatsapp_business_account"}';
  const good = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;

  it('accepts a valid signature and rejects anything else', () => {
    expect(verifyWhatsAppSignature(raw, good, secret)).toBe(true);
    expect(verifyWhatsAppSignature(raw, 'sha256=deadbeef', secret)).toBe(false);
    expect(verifyWhatsAppSignature(raw, null, secret)).toBe(false);
    expect(verifyWhatsAppSignature('tampered', good, secret)).toBe(false);
  });
});

describe('parseWhatsAppWebhook', () => {
  it('parses delivery receipts and reply-button taps', () => {
    const events = parseWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'wamid.1', recipient_id: '2348012345678', status: 'delivered' },
                  {
                    id: 'wamid.2',
                    recipient_id: '2348098765432',
                    status: 'failed',
                    errors: [{ message: 'User is not on WhatsApp' }],
                  },
                ],
                messages: [
                  {
                    id: 'wamid.3',
                    from: '2348012345678',
                    type: 'interactive',
                    interactive: { button_reply: { id: 'rsvp:yes:guest-1', title: "I'm coming" } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: 'status', messageId: 'wamid.1', status: 'delivered', recipient: '2348012345678', error: undefined },
      {
        kind: 'status',
        messageId: 'wamid.2',
        status: 'failed',
        recipient: '2348098765432',
        error: 'User is not on WhatsApp',
      },
      { kind: 'reply', from: '2348012345678', messageId: 'wamid.3', payload: 'rsvp:yes:guest-1', text: "I'm coming" },
    ]);
  });

  it('skips unknown shapes instead of throwing', () => {
    expect(parseWhatsAppWebhook({})).toEqual([]);
    expect(
      parseWhatsAppWebhook({ entry: [{ changes: [{ value: { messages: [{ text: { body: 'hi' } }] } }] }] }),
    ).toEqual([]);
    expect(
      parseWhatsAppWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'weird' }] } }] }] }),
    ).toEqual([]);
  });
});
