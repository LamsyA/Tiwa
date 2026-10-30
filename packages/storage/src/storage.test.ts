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

  it('completes a multipart upload in order and drops aborted ones', async () => {
    const storage = new FakeStorage();
    const { uploadId } = await storage.createMultipart('g/o.bin', 'application/octet-stream');
    expect(await storage.signPart('g/o.bin', uploadId, 1)).toContain('fake://part/');
    storage.seedPart('g/o.bin', uploadId, 2, new Uint8Array([3, 4]));
    storage.seedPart('g/o.bin', uploadId, 1, new Uint8Array([1, 2]));
    await storage.completeMultipart('g/o.bin', uploadId, [
      { eTag: 'a', partNumber: 1 },
      { eTag: 'b', partNumber: 2 },
    ]);
    expect(await storage.head('g/o.bin')).toEqual({ sizeBytes: 4, contentType: 'application/octet-stream' });
    expect([...(await storage.readStart('g/o.bin', 4))]).toEqual([1, 2, 3, 4]);

    const again = await storage.createMultipart('g/o2.bin', 'application/octet-stream');
    await storage.abortMultipart('g/o2.bin', again.uploadId);
    await expect(storage.completeMultipart('g/o2.bin', again.uploadId, [{ eTag: 'a', partNumber: 1 }])).rejects.toThrow(
      /unknown multipart/,
    );
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
