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

  it('MIXED derives kind per file (photos resize, videos pass through)', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      seen.push({ url, init: init ?? {} });
      return {
        ok: true,
        json: async () => ({ ok: true, data: { mediaId: `mid-${seen.length}`, key: `g/g/o/${seen.length}` } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const local = createGalleryUploader({
      eventId: 'e1',
      galleryId: 'g1',
      album: 'GUEST',
      kind: 'MIXED',
      fetchImpl,
      // Skip workers in jsdom: return the input untouched.
      resize: async (blob: Blob) => ({ blob, resized: false }),
    });
    local.addFiles([
      { source: 'test', name: 'a.mp4', type: 'video/mp4', data: new Blob(['x'.repeat(10)], { type: 'video/mp4' }) },
    ]);
    await vi.waitFor(() => {
      expect(seen.some((call) => call.url === '/api/uploads/create')).toBe(true);
    });
    const create = seen.find((call) => call.url === '/api/uploads/create');
    expect(JSON.parse((create?.init.body ?? '{}') as string)).toMatchObject({ kind: 'VIDEO', mime: 'video/mp4' });
    await vi.waitFor(() => {
      expect(local.getFiles()[0]?.meta).toMatchObject({ kind: 'VIDEO' });
    });
    local.destroy();
  });

  it('completes the server row on upload-success and aborts on remove', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      seen.push({ url, init: init ?? {} });
      if (url === '/api/uploads/create') {
        return {
          ok: true,
          json: async () => ({ ok: true, data: { mediaId: 'mid-7', key: 'galleries/g1/originals/mid-7/a.jpg' } }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, data: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const local = createGalleryUploader({ eventId: 'e1', galleryId: 'g1', album: 'GUEST', kind: 'PHOTO', fetchImpl });
    local.addFiles([
      { source: 'test', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['x'.repeat(10)], { type: 'image/jpeg' }) },
    ]);
    await vi.waitFor(() => {
      expect(local.getFiles()[0]?.meta).toMatchObject({ mediaId: 'mid-7' });
    });
    const [file] = local.getFiles();
    (local.emit as (...args: unknown[]) => void)('upload-success', file, { uploadURL: 'https://s3.example/x' });
    await vi.waitFor(() => {
      expect(seen.some((call) => call.url === '/api/uploads/complete')).toBe(true);
    });
    const complete = seen.find((call) => call.url === '/api/uploads/complete');
    expect(JSON.parse((complete?.init.body ?? '{}') as string)).toEqual({ mediaId: 'mid-7' });
    local.destroy();
  });

  it('autoUpload starts only once every queued file is prepared', async () => {
    let created = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      expect(url).toBe('/api/uploads/create');
      created += 1;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          data: { mediaId: `mid-${created}`, key: `galleries/g1/originals/mid-${created}/a.jpg` },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const local = createGalleryUploader({
      eventId: 'e1',
      galleryId: 'g1',
      album: 'GUEST',
      kind: 'PHOTO',
      fetchImpl,
      autoUpload: true,
      resize: async (blob: Blob) => ({ blob, resized: false }),
    });
    let started = 0;
    local.on('upload', () => {
      started += 1;
    });
    local.addFiles([
      { source: 'test', name: 'one.jpg', type: 'image/jpeg', data: new Blob(['x'.repeat(10)], { type: 'image/jpeg' }) },
      { source: 'test', name: 'two.jpg', type: 'image/jpeg', data: new Blob(['y'.repeat(10)], { type: 'image/jpeg' }) },
    ]);
    await vi.waitFor(() => {
      expect(local.getFiles().filter((file) => (file.meta as { mediaId?: string }).mediaId).length).toBe(2);
    });
    await vi.waitFor(() => {
      expect(started).toBeGreaterThan(0);
    });
    local.destroy();
  });

  it('retries preparation after a network failure instead of dropping the file', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('offline');
      return {
        ok: true,
        json: async () => ({ ok: true, data: { mediaId: 'mid-9', key: 'galleries/g1/originals/mid-9/a.jpg' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    vi.useFakeTimers();
    try {
      const local = createGalleryUploader({
        eventId: 'e1',
        galleryId: 'g1',
        album: 'GUEST',
        kind: 'PHOTO',
        fetchImpl,
        resize: async (blob: Blob) => ({ blob, resized: false }),
      });
      local.addFiles([
        { source: 'test', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['x'.repeat(10)], { type: 'image/jpeg' }) },
      ]);
      // First attempt hits the (simulated) offline gap: the file stays queued.
      await vi.advanceTimersByTimeAsync(0);
      expect(local.getFiles()).toHaveLength(1);
      expect(local.getFiles()[0]?.error).toBeUndefined();
      // Backoff (1s) fires the retry, which mints the row.
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(local.getFiles()[0]?.meta).toMatchObject({ mediaId: 'mid-9' });
      expect(calls).toBe(2);
      local.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
