import { describe, expect, it } from 'vitest';
import { emailAssetBase } from './layout.js';

describe('emailAssetBase', () => {
  it('never points email images at localhost (mail apps cannot reach it)', () => {
    expect(emailAssetBase('http://localhost:3000')).toBe('https://tiwa-events.vercel.app');
    expect(emailAssetBase('http://127.0.0.1:3100/')).toBe('https://tiwa-events.vercel.app');
  });
  it('uses the public app URL as is', () => {
    expect(emailAssetBase('https://tiwa.app/')).toBe('https://tiwa.app');
  });
});
