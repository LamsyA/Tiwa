import AwsS3 from '@uppy/aws-s3';
import Uppy, { type UppyFile } from '@uppy/core';
import GoldenRetriever from '@uppy/golden-retriever';
import { UPLOAD_MAX_BYTES } from '@tiwa/core/shared/upload-limit.js';
// Client-safe copy of packages/core moments/uploads limits.
// Do not import from '@tiwa/core' here: the barrel pulls node:crypto +
// prisma and breaks the client webpack build (node: scheme).
const IMAGE_MAX_BYTES = UPLOAD_MAX_BYTES;
const VIDEO_MAX_BYTES = UPLOAD_MAX_BYTES;
import { resizeImageForUpload, resizedFileName } from './resize-image.js';

// Uppy wiring for Moments uploads (Frontend §7.4): multipart with 5 MB
// parts, up to 3 files at once, retries with backoff. Signing goes through
// our own /api/uploads/sign endpoint (S3 URLs stay server-generated);
// Golden Retriever persists the queue in IndexedDB so a reload offers
// "Resume N uploads" instead of losing the batch.

export const UPLOAD_LIMIT = 3;
export const UPLOAD_RETRY_DELAYS_MS = [1000, 3000, 5000, 10000, 20000];
export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'];

export type UploadMeta = Record<string, unknown> & {
  name?: string | undefined;
  mediaId?: string | undefined;
  key?: string | undefined;
  completed?: boolean | undefined;
  eventId: string;
  galleryId: string;
  album: 'OFFICIAL' | 'GUEST';
  kind: 'PHOTO' | 'VIDEO';
};

export type UploadFile = UppyFile<UploadMeta, Record<string, never>>;

export interface GalleryUploaderOptions {
  eventId: string;
  galleryId: string;
  album: 'OFFICIAL' | 'GUEST';
  /** PHOTO or VIDEO restricts to that kind; MIXED (guest sheet) accepts both and derives kind per file. */
  kind: 'PHOTO' | 'VIDEO' | 'MIXED';
  fetchImpl?: typeof fetch;
  resize?: typeof resizeImageForUpload;
  /**
   * Start uploading automatically once every queued file is prepared
   * (resized + server-minted). Off by default: callers that manage their
   * own start button leave it off; sheet flows opt in.
   */
  autoUpload?: boolean;
}

export interface CreateMediaResponse {
  mediaId: string;
  key: string;
}

/** POST /api/uploads/create — mints the MediaItem row and storage key first. */
export async function createMediaRecord(
  fetchImpl: typeof fetch,
  opts: {
    eventId: string;
    album: 'OFFICIAL' | 'GUEST';
    kind: 'PHOTO' | 'VIDEO';
    fileName: string;
    mime: string;
    sizeBytes: number;
  },
): Promise<CreateMediaResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetchImpl('/api/uploads/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: { mediaId?: string; key?: string } | undefined;
  } | null;
  if (!response.ok || !body?.ok || typeof body.data?.mediaId !== 'string' || typeof body.data?.key !== 'string') {
    throw new Error('upload slot unavailable');
  }
  return { mediaId: body.data.mediaId, key: body.data.key };
}

interface SignRequestShape {
  method: string;
  key: string;
  uploadId?: string | undefined;
  partNumber?: number | undefined;
}

/** Translate an @uppy/aws-s3 sign call into our /api/uploads/sign endpoint. */
/**
 * Body sent to POST /api/uploads/sign. The mediaId is intentionally absent:
 * the server recovers it from the key (`galleries/{id}/originals/{mediaId}/…`)
 * and verifies ownership itself, so a tampered body buys nothing.
 */
export function toSignRequestBody(input: SignRequestShape): {
  key: string;
  method: string;
  uploadId?: string | undefined;
  partNumber?: number | undefined;
} {
  if (typeof input.key !== 'string' || input.key.length === 0) throw new Error('missing object key');
  return {
    key: input.key,
    method: input.method,
    ...(input.uploadId !== undefined ? { uploadId: input.uploadId } : {}),
    ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
  };
}

export function createGalleryUploader(options: GalleryUploaderOptions): Uppy<UploadMeta> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const resize = options.resize ?? resizeImageForUpload;
  const mixed = options.kind === 'MIXED';
  const isPhoto = options.kind === 'PHOTO';

  const uppy = new Uppy<UploadMeta>({
    autoProceed: false,
    restrictions: {
      // Photos are checked after resizing (prepareFileInner); the server
      // re-checks every size against UPLOAD_MAX_BYTES (D-X58).
      maxFileSize: options.kind === 'VIDEO' ? VIDEO_MAX_BYTES : null,
      allowedFileTypes: mixed ? [...IMAGE_MIMES, ...VIDEO_MIMES] : isPhoto ? IMAGE_MIMES : VIDEO_MIMES,
    },
    meta: {
      eventId: options.eventId,
      galleryId: options.galleryId,
      album: options.album,
      kind: options.kind,
    } as UploadMeta,
    // Safety net: files added programmatically (or restored) may not have
    // gone through the file-added hook yet. Uploads never start until every
    // file has a server-minted row + key. Only autoUpload/resume call
    // uppy.upload(); retries bypass this gate via retryUpload, so an unready
    // file can never deadlock the rest.
    onBeforeUpload: (files) => {
      const ready = Object.values(files).every(
        (file) =>
          typeof (file.meta as Record<string, unknown> | undefined)?.mediaId === 'string' &&
          typeof (file.meta as Record<string, unknown> | undefined)?.key === 'string',
      );
      return ready ? files : false;
    },
  });

  // Resize + mint a MediaItem row *before* the S3 multipart upload starts,
  // so every part is keyed to a real row from the first byte. All Uppy
  // mutations are guarded: the async setup can outlive the uploader
  // (unmount, removeFile, destroy) and must never throw unhandled.
  const alive = (id: string): boolean => {
    try {
      return uppy.getFile(id) !== undefined;
    } catch {
      return false;
    }
  };
  // In-flight preparations, keyed by file id: the file-added hook and the
  // onBeforeUpload gate can race on the same file; only one may mint a row.
  const preparing = new Map<string, Promise<boolean>>();
  async function prepareFile(file: { id: string }): Promise<boolean> {
    const ongoing = preparing.get(file.id);
    if (ongoing) return ongoing;
    const run = (async (): Promise<boolean> => {
      try {
        return await prepareFileInner(file);
      } finally {
        preparing.delete(file.id);
      }
    })();
    preparing.set(file.id, run);
    return run;
  }
  async function prepareFileInner(file: { id: string }): Promise<boolean> {
    const current = (() => {
      try {
        return uppy.getFile(file.id);
      } catch {
        return undefined;
      }
    })();
    if (!current) return false;
    if (typeof (current.meta as Record<string, unknown> | undefined)?.mediaId === 'string') return true;
    try {
      // MIXED (guest sheet) derives kind per file; fixed uploaders keep theirs.
      const rawKind = mixed ? (current.type?.startsWith('video/') ? 'VIDEO' : 'PHOTO') : options.kind;
      const fileKind: 'PHOTO' | 'VIDEO' = rawKind === 'MIXED' ? 'PHOTO' : rawKind;
      const source = (current.data as Blob | undefined) ?? new Blob();
      const resized =
        fileKind === 'PHOTO' ? await resize(source, current.type || 'image/jpeg') : { blob: source, resized: false };
      if (!alive(file.id)) return false;
      if (resized.blob.size > (fileKind === 'PHOTO' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES)) {
        throw new Error('File too large');
      }
      const name = resized.resized ? resizedFileName(current.name ?? 'photo') : (current.name ?? 'photo');
      const record = await createMediaRecord(fetchImpl, {
        eventId: options.eventId,
        album: options.album,
        kind: fileKind,
        fileName: name,
        mime: resized.resized ? 'image/webp' : current.type || 'application/octet-stream',
        sizeBytes: Math.max(1, resized.blob.size),
      });
      if (!alive(file.id)) return false;
      uppy.setFileState(file.id, {
        data: resized.blob,
        name,
        type: resized.resized ? 'image/webp' : current.type,
        size: resized.blob.size,
        meta: {
          name,
          eventId: options.eventId,
          galleryId: options.galleryId,
          album: options.album,
          kind: fileKind,
          mediaId: record.mediaId,
          key: record.key,
        } satisfies UploadMeta,
      });
      maybeAutoUpload();
      return true;
    } catch (error) {
      if (!alive(file.id)) return false;
      // Network failures (offline tunnels, captive portals, timeouts) keep
      // the file queued and retry with backoff — uploads are never silently
      // dropped (UF-10-2). Anything else is a real setup failure: surface it
      // and drop the row-less file.
      const transient =
        error instanceof TypeError ||
        (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError');
      if (transient) {
        const attempts = (prepareAttempts.get(file.id) ?? 0) + 1;
        prepareAttempts.set(file.id, attempts);
        if (attempts <= UPLOAD_RETRY_DELAYS_MS.length) {
          const delay = UPLOAD_RETRY_DELAYS_MS[attempts - 1] ?? 10000;
          setTimeout(() => {
            prepareAttempts.delete(file.id);
            if (alive(file.id)) void prepareFile(file);
          }, delay);
          return false;
        }
        prepareAttempts.delete(file.id);
      }
      try {
        uppy.setFileState(file.id, {
          error: error instanceof Error ? error.message : 'Upload setup failed',
        });
        uppy.removeFile(file.id);
      } catch {
        // Uppy went away mid-setup; nothing left to clean up.
      }
      return false;
    }
  }
  const prepareAttempts = new Map<string, number>();
  uppy.on('file-added', (file) => {
    void prepareFile(file);
  });

  // Auto-start (P5-T13 fix): preparation is async, so nothing may call
  // upload() until every queued file carries a server-minted row. Every
  // preparation completion re-checks; concurrent upload() calls are safe
  // (Uppy only picks up files that never started).
  const maybeAutoUpload = () => {
    if (!options.autoUpload) return;
    let files: UploadFile[];
    try {
      files = uppy.getFiles();
    } catch {
      return;
    }
    if (files.length === 0) return;
    const ready = files.every(
      (file) =>
        typeof (file.meta as Record<string, unknown> | undefined)?.mediaId === 'string' &&
        typeof (file.meta as Record<string, unknown> | undefined)?.key === 'string',
    );
    if (!ready) return;
    void uppy.upload().catch(() => undefined);
  };

  async function postMedia(path: 'complete' | 'abort', mediaId: string): Promise<boolean> {
    try {
      const response = await fetchImpl(`/api/uploads/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      return response.ok && body?.ok === true;
    } catch {
      return false;
    }
  }

  // Server handoff (P5-T07): the S3 multipart finishing only lands the
  // bytes. `complete` verifies the object, moves the row to PROCESSING and
  // enqueues the worker; `abort` drops rows whose files never finished.
  // Complete is retried with backoff (same delays as upload retries): an
  // offline gap mid-handoff must recover on its own (UF-10-2).
  const completeAttempts = new Map<string, number>();
  uppy.on('upload-success', (file) => {
    const meta = file?.meta as UploadMeta | undefined;
    if (!file || !meta || typeof meta.mediaId !== 'string' || meta.completed) return;
    const mediaId = meta.mediaId;
    const withName: UploadMeta & { name: string } = { ...meta, name: meta.name ?? file.name ?? 'file' };
    void (async () => {
      const done = await postMedia('complete', mediaId);
      if (!alive(file.id)) return;
      if (done) {
        completeAttempts.delete(file.id);
        try {
          uppy.setFileState(file.id, { meta: { ...withName, completed: true } } as Partial<UploadFile>);
        } catch {
          // Uppy went away mid-handoff; nothing left to clean up.
        }
        return;
      }
      const attempts = (completeAttempts.get(file.id) ?? 0) + 1;
      completeAttempts.set(file.id, attempts);
      if (attempts > UPLOAD_RETRY_DELAYS_MS.length) {
        try {
          uppy.setFileState(file.id, { error: 'Processing failed — tap retry' } as Partial<UploadFile>);
        } catch {
          // Uppy went away mid-handoff; nothing left to clean up.
        }
        return;
      }
      const delay = UPLOAD_RETRY_DELAYS_MS[attempts - 1] ?? 10000;
      setTimeout(() => {
        if (!alive(file.id)) return;
        try {
          void uppy.retryUpload(file.id);
        } catch {
          // Uppy went away; the provider-level retry covers the rest.
        }
      }, delay);
    })();
  });
  uppy.on('file-removed', (file) => {
    const meta = file?.meta as UploadMeta | undefined;
    const mediaId = meta?.mediaId;
    if (!file || typeof mediaId !== 'string' || meta?.completed) return;
    void postMedia('abort', mediaId);
  });

  uppy.use(AwsS3, {
    shouldUseMultipart: () => true,
    limit: UPLOAD_LIMIT,
    getChunkSize: () => UPLOAD_CHUNK_SIZE,
    allowedMetaFields: [],
    generateObjectKey: (file) => {
      const key = (file.meta as Record<string, unknown> | undefined)?.key;
      if (typeof key !== 'string' || key.length === 0) throw new Error('upload key missing: media row not created');
      return key;
    },
    signRequest: async (request: SignRequestShape) => {
      const response = await fetchImpl('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSignRequestBody(request)),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: { url?: string } } | null;
      if (!response.ok || !body?.ok || typeof body.data?.url !== 'string') throw new Error('signing failed');
      return { url: body.data.url };
    },
  });

  if (typeof indexedDB !== 'undefined') {
    uppy.use(GoldenRetriever, { serviceWorker: false });
  }

  return uppy;
}
