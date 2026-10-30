import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSms, TermiiSms, smsSegments } from './sms.js';

describe('smsSegments', () => {
  it('counts GSM-7 messages (160/153)', () => {
    expect(smsSegments('')).toBe(0);
    expect(smsSegments('Hello Ada')).toBe(1);
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('a'.repeat(306))).toBe(2);
    expect(smsSegments('a'.repeat(307))).toBe(3);
  });

  it('counts extension-table characters as two septets', () => {
    expect(smsSegments(`Price: €50 [today]`)).toBe(1);
    expect(smsSegments('['.repeat(80))).toBe(1);
    expect(smsSegments('['.repeat(81))).toBe(2);
  });

  it('counts unicode messages as UCS-2 (70/67)', () => {
    expect(smsSegments('Hello Ada 🎉')).toBe(1);
    expect(smsSegments('🎉'.repeat(70))).toBe(1);
    expect(smsSegments('🎉'.repeat(71))).toBe(2);
  });
});

describe('FakeSms', () => {
  it('records sends with fake ids', async () => {
    const sms = new FakeSms();
    const result = await sms.send({ to: '+2348012345678', text: 'hi' });
    expect(result.id).toBe('fake-sms-1');
    expect(sms.sent).toEqual([{ to: '+2348012345678', text: 'hi', id: 'fake-sms-1' }]);
    sms.clear();
    expect(sms.sent).toEqual([]);
  });
});

describe('TermiiSms', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the Termii payload and returns the message id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message_id: 'msg-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sms = new TermiiSms({ apiKey: 'key', senderId: 'Tiwa' });
    const result = await sms.send({ to: '+2348012345678', text: 'hello' });
    expect(result).toEqual({ id: 'msg-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.termii.com/api/sms/send');
    expect(JSON.parse(init.body as string)).toMatchObject({
      api_key: 'key',
      to: '2348012345678',
      from: 'Tiwa',
      sms: 'hello',
    });
  });

  it('throws on provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const sms = new TermiiSms({ apiKey: 'key', senderId: 'Tiwa' });
    await expect(sms.send({ to: '+2348012345678', text: 'hello' })).rejects.toThrow('HTTP 500');
  });
});
