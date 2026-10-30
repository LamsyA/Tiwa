import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadQueueProvider, useUploadQueue } from './upload-queue.js';

function mockFetch() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, data: { mediaId: 'mid-1', key: 'galleries/g1/originals/mid-1/a.jpg' } }),
  })) as unknown as typeof fetch;
}

function wrapper(eventId = 'e1') {
  const fetchImpl = mockFetch();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <UploadQueueProvider eventId={eventId} galleryId="g1" album="GUEST" kind="PHOTO" fetchImpl={fetchImpl}>
      {children}
    </UploadQueueProvider>
  );
  return { Wrapper, fetchImpl };
}

describe('useUploadQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts empty and exposes an uploader', () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useUploadQueue(), { wrapper: Wrapper });
    expect(result.current.files).toEqual([]);
    expect(result.current.totalProgress).toBe(0);
    expect(result.current.restoredCount).toBe(0);
    expect(result.current.uppy).not.toBeNull();
    unmount();
  });

  it('throws outside the provider', () => {
    expect(() => renderHook(() => useUploadQueue())).toThrow('useUploadQueue must be used inside');
  });

  it('adds files (minting media rows) and removes them', async () => {
    const { Wrapper, fetchImpl } = wrapper();
    const { result, unmount } = renderHook(() => useUploadQueue(), { wrapper: Wrapper });
    const blob = () => new Blob(['x'.repeat(10)], { type: 'image/jpeg' });
    act(() => {
      result.current.addFiles([
        new File([blob()], 'one.jpg', { type: 'image/jpeg' }),
        new File([blob()], 'two.jpg', { type: 'image/jpeg' }),
      ]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[0]).toMatchObject({ name: 'one.jpg', progress: 0 });
    const [first] = result.current.files;
    act(() => {
      result.current.removeFile(first?.id ?? '');
    });
    expect(result.current.files).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenLastCalledWith('/api/uploads/abort', expect.objectContaining({ method: 'POST' }));
    unmount();
  });

  it('retries failed uploads with backoff, then gives up', async () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useUploadQueue(), { wrapper: Wrapper });
    const uppy = result.current.uppy;
    if (!uppy) throw new Error('no uppy instance');
    const retry = vi.spyOn(uppy, 'retryUpload').mockResolvedValue(undefined as never);
    act(() => {
      uppy.addFile({ source: 'test', name: 'a.jpg', type: 'image/jpeg', data: new Blob(['x']) });
    });
    const [file] = uppy.getFiles();
    if (!file) throw new Error('file not added');
    const emitError = () =>
      act(() => {
        (uppy.emit as (...args: unknown[]) => void)('upload-error', file, new Error('boom'));
      });

    emitError();
    // First retry after ~1s, not immediately.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(retry).toHaveBeenCalledTimes(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenLastCalledWith(file.id);
    unmount();
  });
});
