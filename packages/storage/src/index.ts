import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Object storage behind one interface (D-A04, Backend.md §9). Browsers upload
// directly with pre-signed URLs (D-A05); the app only signs and verifies.
// Documents (≤ 25 MB) use a single signed PUT; multipart for large media
// arrives with Moments (P5).

export interface StoredObjectInfo {
  sizeBytes: number;
  contentType: string | undefined;
}

export interface Storage {
  /** Signed PUT URL bound to the exact content type and length. */
  signPut(key: string, contentType: string, sizeBytes: number, ttlSec?: number): Promise<string>;
  /** Signed GET URL; `downloadName` sets Content-Disposition. */
  getSignedUrl(key: string, ttlSec?: number, downloadName?: string): Promise<string>;
  head(key: string): Promise<StoredObjectInfo | null>;
  /** First `bytes` of an object (magic-byte checks). */
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      // R2 and the local S3 mock both work with path-style addressing.
      forcePathStyle: true,
      ...(config.accessKeyId && config.secretAccessKey
        ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
        : {}),
    });
  }

  signPut(key: string, contentType: string, sizeBytes: number, ttlSec = 900): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  getSignedUrl(key: string, ttlSec = 300, downloadName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ...(downloadName
        ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSec });
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { sizeBytes: Number(result.ContentLength ?? 0), contentType: result.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async readStart(key: string, bytes: number): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

/** In-memory storage for tests: "signed" URLs are inert strings; `put` simulates the browser upload. */
export class FakeStorage implements Storage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async signPut(key: string, contentType: string, sizeBytes: number): Promise<string> {
    return `fake://put/${encodeURIComponent(key)}?type=${encodeURIComponent(contentType)}&size=${sizeBytes}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `fake://get/${encodeURIComponent(key)}`;
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.body.byteLength, contentType: object.contentType } : null;
  }

  async readStart(key: string, bytes: number): Promise<Uint8Array> {
    return this.objects.get(key)?.body.slice(0, bytes) ?? new Uint8Array();
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** Sniff the real type from leading bytes (Backend.md §12: never trust the declared MIME). */
export function sniffMime(head: Uint8Array): string | null {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => head[offset + index] === char.charCodeAt(0));
  if (ascii(0, '%PDF-')) return 'application/pdf';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftyp') && (ascii(8, 'heic') || ascii(8, 'heix') || ascii(8, 'mif1') || ascii(8, 'msf1'))) {
    return 'image/heic';
  }
  // Office Open XML files (docx, xlsx, pptx) are zip archives.
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'application/zip';
  return null;
}
