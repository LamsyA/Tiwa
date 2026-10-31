'use client';

import type Uppy from '@uppy/core';
import * as React from 'react';
import { createGalleryUploader, UPLOAD_RETRY_DELAYS_MS, type GalleryUploaderOptions } from './gallery-uploader.js';
import type { UploadMeta } from './gallery-uploader.js';

export interface QueuedFile {
  id: string;
  name: string;
  size: number | undefined;
  progress: number;
  status: 'queued' | 'uploading' | 'paused' | 'complete' | 'error';
  error: string | null;
  isRestored: boolean;
}

export interface UploadQueue {
  uppy: Uppy<UploadMeta> | null;
  files: QueuedFile[];
  totalProgress: number;
  /** Files recovered from IndexedDB after a reload (Golden Retriever). */
  restoredCount: number;
  resume: () => void;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  retryFile: (id: string) => void;
  cancelAll: () => void;
}

const UploadQueueContext = React.createContext<UploadQueue | null>(null);

function snapshot(uppy: Uppy<UploadMeta>): QueuedFile[] {
  return uppy.getFiles().map((file) => {
    const done = file.progress?.uploadComplete === true;
    const failed = Boolean(file.error);
    const uploaded = Number(file.progress?.bytesUploaded ?? 0);
    const started = uploaded > 0 || file.progress?.uploadStarted != null;
    return {
      id: file.id,
      name: file.name ?? 'file',
      size: file.size ?? undefined,
      progress: done ? 1 : file.progress?.bytesTotal ? uploaded / file.progress.bytesTotal : 0,
      status: done ? 'complete' : failed ? 'error' : started ? 'uploading' : 'queued',
      error: failed ? (file.error ?? 'upload failed') : null,
      isRestored: Boolean(file.isRestored),
    };
  });
}

/**
 * UploadQueueProvider (Frontend §7.4): one Uppy instance per mounted gallery
 * section, with IndexedDB resume (Golden Retriever) and per-file retry with
 * backoff. Files are added via `addFiles` (file picker lives in T06/T07);
 * the queue survives client-side navigation while mounted.
 */
export function UploadQueueProvider({ children, ...options }: { children: React.ReactNode } & GalleryUploaderOptions) {
  const [uppy] = React.useState(() => createGalleryUploader(options));
  // DEBUG-ONLY: expose for e2e diagnostics (removed before gate).
  React.useEffect(() => {
    (globalThis as Record<string, unknown>).__uppyDebug = uppy;
  }, [uppy]);
  const [files, setFiles] = React.useState<QueuedFile[]>([]);
  const [restoredCount, setRestoredCount] = React.useState(0);
  const retryTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retryCounts = React.useRef(new Map<string, number>());

  const refresh = React.useCallback(() => {
    setFiles(snapshot(uppy));
  }, [uppy]);

  React.useEffect(() => {
    const timers = retryTimers.current;
    const onChange = () => refresh();
    const onRestored = () => {
      refresh();
      const pending = uppy.getFiles().filter((file) => !file.progress?.uploadComplete).length;
      setRestoredCount(pending);
    };
    const onError = (file: { id?: string } | undefined) => {
      const id = file?.id;
      if (!id) return;
      const attempts = (retryCounts.current.get(id) ?? 0) + 1;
      retryCounts.current.set(id, attempts);
      if (attempts <= UPLOAD_RETRY_DELAYS_MS.length) {
        const delay = UPLOAD_RETRY_DELAYS_MS[attempts - 1] ?? 10000;
        const timer = setTimeout(() => {
          retryCounts.current.delete(id);
          void uppy.retryUpload(id);
        }, delay);
        timers.set(id, timer);
      }
      refresh();
    };
    uppy.on('file-added', onChange);
    uppy.on('file-removed', onChange);
    uppy.on('upload-progress', onChange);
    uppy.on('upload-success', onChange);
    uppy.on('upload-error', onError);
    uppy.on('restored', onRestored);
    uppy.on('cancel-all', onChange);
    return () => {
      uppy.off('file-added', onChange);
      uppy.off('file-removed', onChange);
      uppy.off('upload-progress', onChange);
      uppy.off('upload-success', onChange);
      uppy.off('upload-error', onError);
      uppy.off('restored', onRestored);
      uppy.off('cancel-all', onChange);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [uppy, refresh]);

  // Golden Retriever resumes in the background on mount; do not auto-start
  // uploads — the sheet (T07) / gallery (T06) calls upload() explicitly.
  const value = React.useMemo<UploadQueue>(() => {
    const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    const done = files.reduce((sum, file) => sum + (file.size ?? 0) * file.progress, 0);
    return {
      uppy,
      files,
      totalProgress: total === 0 ? 0 : done / total,
      restoredCount,
      resume: () => {
        setRestoredCount(0);
        void uppy.upload();
      },
      addFiles: (picked: File[]) => {
        for (const file of picked) {
          try {
            uppy.addFile({ source: 'gallery-sheet', name: file.name, type: file.type, data: file });
          } catch {
            // Uppy dedupes by id; restored duplicates are skipped silently.
          }
        }
      },
      removeFile: (id: string) => {
        const timer = retryTimers.current.get(id);
        if (timer) clearTimeout(timer);
        retryTimers.current.delete(id);
        retryCounts.current.delete(id);
        uppy.removeFile(id);
      },
      retryFile: (id: string) => {
        retryCounts.current.delete(id);
        void uppy.retryUpload(id);
      },
      cancelAll: () => {
        uppy.cancelAll();
      },
    };
  }, [uppy, files, restoredCount]);

  return <UploadQueueContext.Provider value={value}>{children}</UploadQueueContext.Provider>;
}

export function useUploadQueue(): UploadQueue {
  const queue = React.useContext(UploadQueueContext);
  if (!queue) throw new Error('useUploadQueue must be used inside <UploadQueueProvider>');
  return queue;
}
