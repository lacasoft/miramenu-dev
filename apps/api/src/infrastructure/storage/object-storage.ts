export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * Two areas (ADR-0038). media: the optimized variants, public and served straight to the
 * phone, never through the API (ADR-0006). originals: the uploads as they came, with their
 * EXIF, private to the API and the worker.
 */
export type StorageArea = 'media' | 'originals';

export interface PresignedUpload {
  url: string;
  /** Headers the browser must send exactly as given; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PutOptions {
  contentType: string;
  /** e.g. immutable for variants, whose keys are never reused. */
  cacheControl?: string;
}

/** Port for the object storage that holds media originals and variants (ADR-0006). */
export abstract class ObjectStorage {
  abstract put(
    area: StorageArea,
    key: string,
    body: Uint8Array,
    options: PutOptions,
  ): Promise<void>;
  /** Streams a local file up, so large videos never sit in memory. */
  abstract putFile(
    area: StorageArea,
    key: string,
    path: string,
    options: PutOptions,
  ): Promise<void>;
  /** Streams the object down to a local file. */
  abstract download(
    area: StorageArea,
    key: string,
    path: string,
  ): Promise<void>;
  abstract head(area: StorageArea, key: string): Promise<StoredObject | null>;
  abstract delete(area: StorageArea, key: string): Promise<void>;
  /** A short-lived PUT whose content type and length are signed, so nothing else fits. */
  abstract presignPut(
    area: StorageArea,
    key: string,
    upload: {
      contentType: string;
      sizeBytes: number;
      expiresInSeconds: number;
    },
  ): Promise<PresignedUpload>;
  /** Where phones read a media object; originals have no public URL. */
  abstract publicUrl(key: string): string;
  /** Throws if a bucket cannot be reached with the configured credentials. */
  abstract checkBucket(): Promise<void>;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Keys are relative paths of plain segments: no leading slash, no empty segments and
 * no "." or "..", so a key built from input can never escape its prefix.
 */
export function assertSafeObjectKey(key: string): void {
  const segments = key.split('/');
  const safe =
    key.length > 0 &&
    key.length <= 1024 &&
    segments.every((segment) => SAFE_SEGMENT.test(segment) && segment !== '..');
  if (!safe) {
    throw new Error('Unsafe object key');
  }
}
