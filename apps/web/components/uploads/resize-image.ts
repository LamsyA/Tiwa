// Client-side image prep (Frontend §7.4): downscale the longest side and
// re-encode as WebP in a Web Worker, keeping the phone's main thread free.
// Falls back to the original file on any failure — an unresized upload
// always beats a failed one. Videos skip resizing entirely.

export const RESIZE_MAX_SIDE = 2560;
export const RESIZE_QUALITY = 0.82;
const RESIZE_TIMEOUT_MS = 60_000;

export interface ResizeOutcome {
  blob: Blob;
  resized: boolean;
}

export function supportsClientResize(): boolean {
  return (
    typeof Worker !== 'undefined' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined'
  );
}

interface WorkerResult {
  ok: boolean;
  blob?: Blob | undefined;
}

export async function resizeImageForUpload(
  file: Blob,
  mime: string,
  maxSide = RESIZE_MAX_SIDE,
  quality = RESIZE_QUALITY,
): Promise<ResizeOutcome> {
  if (!mime.startsWith('image/') || !supportsClientResize()) return { blob: file, resized: false };
  try {
    const worker = new Worker(new URL('./resize-image.worker.ts', import.meta.url));
    try {
      const out = await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('resize timed out')), RESIZE_TIMEOUT_MS);
        worker.onmessage = (event: MessageEvent<WorkerResult>) => {
          clearTimeout(timer);
          if (event.data.ok && event.data.blob) resolve(event.data.blob);
          else reject(new Error('resize failed'));
        };
        worker.onerror = () => {
          clearTimeout(timer);
          reject(new Error('resize worker error'));
        };
        worker.postMessage({ blob: file, maxSide, quality });
      });
      return { blob: out, resized: true };
    } finally {
      worker.terminate();
    }
  } catch {
    // Unsupported format (e.g. HEIC on this browser) or worker failure:
    // upload the original; the server still validates and processes it.
    return { blob: file, resized: false };
  }
}

/** WebP output name for a resized original ("IMG_1.HEIC" becomes "IMG_1.webp"). */
export function resizedFileName(name: string): string {
  const base = name.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base || 'photo'}.webp`;
}
