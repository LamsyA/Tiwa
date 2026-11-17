// Client-side image prep (Frontend §7.4): downscale the longest side and
// re-encode as WebP in a Web Worker, keeping the phone's main thread free.
// Falls back to the original file on any failure — an unresized upload
// always beats a failed one. Videos skip resizing entirely.

export const RESIZE_MAX_SIDE = 2048;
// D-X81: at most a 5% quality reduction; size comes down by dimensions, not quality.
export const RESIZE_QUALITY = 0.95;
/** Every image upload in the app ends up at or under this size. */
export const IMAGE_TARGET_BYTES = 800 * 1024;
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

const PASSTHROUGH = ['image/gif', 'image/svg+xml'];

/**
 * Shrink an image to at most IMAGE_TARGET_BYTES (D-X81). Files already under
 * the target go up untouched (no quality loss at all). Larger ones are
 * re-encoded at 95% quality; if still too big, only the pixel size steps
 * down (never the quality) until it fits. Returns the original when the
 * browser cannot decode it — the server then refuses anything over the cap.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || PASSTHROUGH.includes(file.type)) return file;
  if (file.size <= IMAGE_TARGET_BYTES) return file;
  let maxSide = 4096;
  let best: Blob | null = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const out = await resizeImageForUpload(file, file.type, maxSide, RESIZE_QUALITY);
    if (!out.resized) return file;
    best = out.blob;
    if (out.blob.size <= IMAGE_TARGET_BYTES) break;
    // Area scales with the square of the side: aim just under the target.
    maxSide = Math.max(480, Math.floor(maxSide * Math.sqrt(IMAGE_TARGET_BYTES / out.blob.size) * 0.95));
  }
  if (!best) return file;
  const ext = best.type === 'image/jpeg' ? 'jpg' : 'webp';
  const base = file.name.replace(/\.[a-zA-Z0-9]+$/, '') || 'photo';
  return new File([best], `${base}.${ext}`, { type: best.type, lastModified: file.lastModified });
}

/** WebP output name for a resized original ("IMG_1.HEIC" becomes "IMG_1.webp"). */
export function resizedFileName(name: string): string {
  const base = name.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${base || 'photo'}.webp`;
}
