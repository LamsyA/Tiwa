// Isomorphic randomness (Node 19+ and browsers) — no node:crypto import so
// packages/core stays usable in any runtime.

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    output += BASE64URL[a >> 2] ?? '';
    output += BASE64URL[((a & 0x03) << 4) | ((b ?? 0) >> 4)] ?? '';
    if (b !== undefined) output += BASE64URL[((b & 0x0f) << 2) | ((c ?? 0) >> 6)] ?? '';
    if (c !== undefined) output += BASE64URL[c & 0x3f] ?? '';
  }
  return output;
}

/**
 * RFC 9562 UUIDv7: 48-bit unix-ms timestamp + 74 random bits.
 * Time-ordered (lexicographic sort ≈ creation order) — good for queue/job ids.
 * Same-millisecond ids are unique but not guaranteed monotonic.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const rand = randomBytes(10);
  const timeHex = Math.max(0, Math.floor(nowMs)).toString(16).padStart(12, '0').slice(-12);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = parseInt(timeHex.slice(i * 2, i * 2 + 2), 16);
  }
  bytes[6] = 0x70 | ((rand[0] ?? 0) & 0x0f);
  bytes[7] = rand[1] ?? 0;
  bytes[8] = 0x80 | ((rand[2] ?? 0) & 0x3f);
  bytes.set(rand.slice(3), 9);

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * URL-safe random token. Default 32 bytes (256 bits); invitation, ticket and
 * gallery tokens need ≥ 16 bytes (128 bits) — always pass an explicit length
 * at those call sites.
 */
export function generateToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new RangeError(`generateToken requires at least 16 bytes, got ${bytes}`);
  }
  return toBase64Url(randomBytes(bytes));
}

/** Lowercase, hyphen-separated, safe for URLs. Diacritics are stripped (e.g. "Ada's 40th" → "adas-40th"). */
export function slugify(text: string, maxLength = 60): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** slugify + short random suffix so slugs are unique without a DB round-trip. */
export function uniqueSlug(text: string, maxLength = 60): string {
  const suffix = toBase64Url(randomBytes(6)).toLowerCase();
  const stem = slugify(text, Math.max(1, maxLength - suffix.length - 1));
  return `${stem}-${suffix}`;
}
