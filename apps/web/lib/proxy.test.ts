import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../proxy.js';

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } });

describe('proxy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sends other production hosts to APP_URL, keeping path and query', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://tiwa-events.vercel.app');
    const res = proxy(req('https://tiwa-abc123.vercel.app/login?next=%2Fhome'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://tiwa-events.vercel.app/login?next=%2Fhome');
  });

  it('leaves public pages alone on the canonical host', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://tiwa-events.vercel.app');
    expect(proxy(req('https://tiwa-events.vercel.app/login')).headers.get('location')).toBeNull();
  });

  it('sends signed-out visitors on app pages to login', () => {
    vi.stubEnv('APP_ENV', 'development');
    const res = proxy(req('http://localhost:3000/events/1'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fevents%2F1');
  });
});
