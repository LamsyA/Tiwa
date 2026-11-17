// App-wide upload ceiling (D-X58). Every per-feature limit is capped by this,
// on the server and in the browser. Client-safe: no node or prisma imports.
export const UPLOAD_MAX_BYTES = 1024 * 1024;

export function capUpload(bytes: number): number {
  return Math.min(bytes, UPLOAD_MAX_BYTES);
}

/**
 * Images are compressed on the device to at most this (D-X81: 95% quality,
 * smaller pixel size when needed); the server refuses any image above it.
 */
export const IMAGE_UPLOAD_MAX_BYTES = 800 * 1024;

export function capImage(bytes: number): number {
  return Math.min(bytes, IMAGE_UPLOAD_MAX_BYTES);
}

/** For uploads that take images and documents: images must fit the image cap. */
export function refineImageSize(
  value: { mime: string; sizeBytes: number },
  ctx: { addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void },
): void {
  if (value.mime.startsWith('image/') && value.sizeBytes > IMAGE_UPLOAD_MAX_BYTES) {
    ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: 'tooLarge' });
  }
}
