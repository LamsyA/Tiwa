/// <reference lib="webworker" />

// Runs off the main thread: EXIF-aware downscale + WebP encode so phones
// upload kilobytes instead of tens of megabytes (Frontend §7.4). Anything
// createImageBitmap cannot decode (HEIC on some browsers, corrupt files)
// rejects, and the caller uploads the original instead.

export interface ResizeRequest {
  blob: Blob;
  maxSide: number;
  quality: number;
}

export interface ResizeResponse {
  ok: boolean;
  blob?: Blob | undefined;
  error?: string | undefined;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<ResizeRequest>) => {
  const { blob, maxSide, quality } = event.data;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await canvas.convertToBlob({ type: 'image/webp', quality });
    const result: ResizeResponse = { ok: true, blob: out };
    self.postMessage(result);
  } catch (error) {
    const result: ResizeResponse = { ok: false, error: error instanceof Error ? error.message : 'resize failed' };
    self.postMessage(result);
  }
};

export {};
