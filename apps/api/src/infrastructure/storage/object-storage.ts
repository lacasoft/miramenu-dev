export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * Port for the object storage that holds media originals and variants (ADR-0006).
 * Objects are served straight to the phone from publicUrl, never through the API.
 */
export abstract class ObjectStorage {
  abstract put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void>;
  abstract head(key: string): Promise<StoredObject | null>;
  abstract publicUrl(key: string): string;
  /** Throws if the bucket cannot be reached with the configured credentials. */
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
