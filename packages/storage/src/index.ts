import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
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
  /** Whole object (worker-side processing). Null when missing. */
  get(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * S3-native presigned URLs for browser-driven multipart (arc §5; used with
   * @uppy/aws-s3 `signRequest`). The browser talks to S3 directly; the app
   * only mints MediaItem rows and signs. Part numbers start at 1.
   * Content-Type is deliberately never part of a signature: browsers report
   * types inconsistently (empty for some HEIC files) and S3 ignores unsigned
   * non-x-amz headers, so signing it would only create mismatches. Type
   * safety comes from the server allowlist at create and magic-byte
   * verification in the worker (Backend §12).
   */
  signCreateMultipart(key: string, ttlSec?: number): Promise<string>;
  signPart(key: string, uploadId: string, partNumber: number, ttlSec?: number): Promise<string>;
  signCompleteMultipart(key: string, uploadId: string, ttlSec?: number): Promise<string>;
  signAbortMultipart(key: string, uploadId: string, ttlSec?: number): Promise<string>;
  signListParts(key: string, uploadId: string, ttlSec?: number): Promise<string>;
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

  async get(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (!result.Body) return null;
      return { body: await result.Body.transformToByteArray(), contentType: result.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async signCreateMultipart(key: string, ttlSec = 900): Promise<string> {
    // Deliberately no Content-Type: the browser sends whatever its File API
    // reports (empty string for some HEIC files), and S3 ignores unsigned
    // non-x-amz headers. Type safety comes from the allowlist at create time
    // plus magic-byte verification in the worker — not from the signature.
    return getSignedUrl(this.client, new CreateMultipartUploadCommand({ Bucket: this.config.bucket, Key: key }), {
      expiresIn: ttlSec,
    });
  }

  async signPart(key: string, uploadId: string, partNumber: number, ttlSec = 900): Promise<string> {
    // No Content-Type is signed: S3 ignores unsigned non-x-amz headers, and
    // the browser sends none for Uint8Array chunk bodies.
    return getSignedUrl(
      this.client,
      new UploadPartCommand({ Bucket: this.config.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: ttlSec },
    );
  }

  async signCompleteMultipart(key: string, uploadId: string, ttlSec = 900): Promise<string> {
    // No Content-Type is signed: S3 ignores unsigned non-x-amz-* headers,
    // so the client's application/xml body header passes verification.
    return getSignedUrl(
      this.client,
      new CompleteMultipartUploadCommand({ Bucket: this.config.bucket, Key: key, UploadId: uploadId }),
      { expiresIn: ttlSec },
    );
  }

  async signAbortMultipart(key: string, uploadId: string, ttlSec = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new AbortMultipartUploadCommand({ Bucket: this.config.bucket, Key: key, UploadId: uploadId }),
      { expiresIn: ttlSec },
    );
  }

  async signListParts(key: string, uploadId: string, ttlSec = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new ListPartsCommand({ Bucket: this.config.bucket, Key: key, UploadId: uploadId }),
      { expiresIn: ttlSec },
    );
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

  async get(key: string): Promise<{ body: Uint8Array; contentType: string | undefined } | null> {
    const object = this.objects.get(key);
    return object ? { body: object.body, contentType: object.contentType } : null;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async signCreateMultipart(key: string): Promise<string> {
    return `fake://mpu-create/${encodeURIComponent(key)}`;
  }

  async signPart(key: string, uploadId: string, partNumber = 1): Promise<string> {
    return `fake://part/${encodeURIComponent(key)}?uploadId=${encodeURIComponent(uploadId)}&part=${partNumber}`;
  }

  async signCompleteMultipart(key: string, uploadId: string): Promise<string> {
    return `fake://mpu-complete/${encodeURIComponent(key)}?uploadId=${encodeURIComponent(uploadId)}`;
  }

  async signAbortMultipart(key: string, uploadId: string): Promise<string> {
    return `fake://mpu-abort/${encodeURIComponent(key)}?uploadId=${encodeURIComponent(uploadId)}`;
  }

  async signListParts(key: string, uploadId: string): Promise<string> {
    return `fake://mpu-list/${encodeURIComponent(key)}?uploadId=${encodeURIComponent(uploadId)}`;
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
