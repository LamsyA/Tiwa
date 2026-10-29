import { describe, expect, it } from 'vitest';
import { FakeStorage, S3Storage, sniffMime } from './index.js';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('sniffMime', () => {
  it('recognises the allowed document types by their bytes', () => {
    expect(sniffMime(ascii('%PDF-1.7\n'))).toBe('application/pdf');
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffMime(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('application/zip');
  });

  it('rejects anything else (e.g. an HTML file renamed .pdf)', () => {
    expect(sniffMime(ascii('<!doctype html>'))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});

describe('FakeStorage', () => {
  it('stores, reads the start, heads and deletes', async () => {
    const storage = new FakeStorage();
    await storage.put('a/b.pdf', ascii('%PDF-1.4 hello'), 'application/pdf');
    expect(await storage.head('a/b.pdf')).toEqual({ sizeBytes: 14, contentType: 'application/pdf' });
    expect(new TextDecoder().decode(await storage.readStart('a/b.pdf', 5))).toBe('%PDF-');
    await storage.delete('a/b.pdf');
    expect(await storage.head('a/b.pdf')).toBeNull();
  });
});

// Runs against the local S3 mock from infra/docker-compose.yml when it is up.
const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9090';
const reachable = await fetch(endpoint, { signal: AbortSignal.timeout(1000) }).then(
  () => true,
  () => false,
);

describe.runIf(reachable)('S3Storage against the local S3 mock', () => {
  const storage = new S3Storage({
    endpoint,
    region: 'auto',
    bucket: process.env.S3_BUCKET_PRIVATE ?? 'tiwa-media-private',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'test',
  });

  it('a signed PUT uploads exactly the signed size; head and range read work', async () => {
    const key = `tests/${Date.now()}.pdf`;
    const body = ascii('%PDF-1.4 signed upload');
    const url = await storage.signPut(key, 'application/pdf', body.byteLength);
    const response = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': 'application/pdf' } });
    expect(response.ok).toBe(true);
    expect(await storage.head(key)).toMatchObject({ sizeBytes: body.byteLength });
    expect(sniffMime(await storage.readStart(key, 16))).toBe('application/pdf');
    const download = await fetch(await storage.getSignedUrl(key, 60, 'Contract.pdf'));
    expect(await download.text()).toBe('%PDF-1.4 signed upload');
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  });
});
