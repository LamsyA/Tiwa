import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGalleryUploader, createMediaRecord, toSignRequestBody } from './gallery-uploader.js';

function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const result = handler(url, init ?? {});
    return {
      ok: true,
      json: async () => result,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('createMediaRecord', () => {
  it('posts the create payload and returns mediaId + key', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = mockFetch((url, init) => {
      seen.push({ url, init });
      return { ok: true, data: { mediaId: 'mid-1', key: 'galleries/g1/originals/mid-1/a.jpg' } };
    });
    const result = await createMediaRecord(fetchImpl, {
      eventId: 'event-1',
      album: 'GUEST',
      kind: 'PHOTO',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 123,
    });
    expect(result).toEqual({ mediaId: 'mid-1', key: 'galleries/g1/originals/mid-1/a.jpg' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('/api/uploads/create');
    expect(JSON.parse((seen[0]?.init.body ?? '{}') as string)).toEqual({
      eventId: 'event-1',
      album: 'GUEST',
      kind: 'PHOTO',
      fileName: 'a.jpg',
      mime: 'image/jpeg',
      sizeBytes: 123,
    });
  });

  it('throws a friendly error when the server refuses', async () => {
    const fetchImpl = mockFetch(() => ({ ok: false, error: { code: 'LIMIT' } }));
    await expect(
      createMediaRecord(fetchImpl, {
        eventId: 'event-1',
        album: 'GUEST',
        kind: 'PHOTO',
        fileName: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 10,
      }),
    ).rejects.toThrow('upload slot unavailable');
  });
});

describe('toSignRequestBody', () => {
  it('passes through the S3 request shape and rejects missing keys', () => {
    expect(toSignRequestBody({ method: 'POST', key: 'galleries/g1/originals/m1/a.jpg' })).toEqual({
      key: 'galleries/g1/originals/m1/a.jpg',
      method: 'POST',
    });
    expect(toSignRequestBody({ method: 'PUT', key: 'k', uploadId: 'u', partNumber: 3 })).toEqual({
      key: 'k',
      method: 'PUT',
      uploadId: 'u',
      partNumber: 3,
    });
    expect(() => toSignRequestBody({ method: 'PUT', key: '' })).toThrow('missing object key');
  });
});

describe('createGalleryUploader', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let uppy: ReturnType<typeof createGalleryUploader> | undefined;
  beforeEach(() => {
    calls.length = 0;
    uppy?.destroy();
    uppy = undefined;
  });

  it('registers files and enforces photo limits', () => {
    const fetchImpl = mockFetch(() => {
      throw new Error('no network in unit tests');
    });
    uppy = createGalleryUploader({ eventId: 'e1', galleryId: 'g1', album: 'GUEST', kind: 'PHOTO', fetchImpl });
    expect(uppy.getFiles()).toHaveLength(0);
    uppy.addFiles([
      { source: 'test', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['x'], { type: 'image/jpeg' }) },
    ]);
    expect(uppy.getFiles()).toHaveLength(1);
    // Uppy v6 rejects out-of-scope files with an event, not an exception.
    let restricted: unknown[] = [];
    uppy?.on('restriction-failed', (...args: unknown[]) => {
      restricted = args;
    });
    uppy?.addFiles([
      { source: 'test', name: 'huge.mp4', type: 'video/mp4', data: new Blob(['x'], { type: 'video/mp4' }) },
    ]);
    expect(uppy.getFiles()).toHaveLength(1);
    expect(restricted.length).toBeGreaterThan(0);
    uppy?.destroy();
  });

  it('wires the sign endpoint through generateObjectKey-gated uploads', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      seen.push({ url, init: init ?? {} });
      if (url === '/api/uploads/create') {
        return {
          ok: true,
          json: async () => ({ ok: true, data: { mediaId: 'mid-9', key: 'galleries/g1/originals/mid-9/a.jpg' } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ ok: true, data: { url: 'https://s3.example/signed' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const local = createGalleryUploader({ eventId: 'e1', galleryId: 'g1', album: 'GUEST', kind: 'PHOTO', fetchImpl });
    local.addFiles([
      { source: 'test', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['x'.repeat(10)], { type: 'image/jpeg' }) },
    ]);
    // Allow the async onFileAdded (resize fallback + create) to settle.
    await vi.waitFor(() => {
      expect(seen.some((call) => call.url === '/api/uploads/create')).toBe(true);
    });
    await vi.waitFor(() => {
      expect(local.getFiles()[0]?.meta).toMatchObject({ mediaId: 'mid-9', key: 'galleries/g1/originals/mid-9/a.jpg' });
    });
    local.destroy();
  });
});
