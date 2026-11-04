// App-wide upload ceiling (D-X58). Every per-feature limit is capped by this,
// on the server and in the browser. Client-safe: no node or prisma imports.
export const UPLOAD_MAX_BYTES = 1024 * 1024;

export function capUpload(bytes: number): number {
  return Math.min(bytes, UPLOAD_MAX_BYTES);
}
