import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import {
  assertSafeObjectKey,
  ObjectStorage,
  type PresignedUpload,
  type PutOptions,
  type StorageArea,
  type StoredObject,
} from './object-storage';

const isNotFound = (error: unknown): boolean =>
  error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;

/** S3 adapter: SeaweedFS in development and CI (ADR-0030), any S3 service in production. */
@Injectable()
export class S3ObjectStorage
  extends ObjectStorage
  implements OnApplicationShutdown
{
  private readonly client: S3Client;
  private readonly buckets: Record<StorageArea, string>;
  private readonly publicBaseUrl: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    const storage = config.storage;
    this.buckets = {
      media: storage.bucket,
      originals: storage.originalsBucket,
    };
    this.publicBaseUrl = storage.publicBaseUrl;
    this.client = new S3Client({
      // Only when an operation requires it: by default the SDK adds a CRC32 of an empty
      // body to presigned URLs, and the real upload then fails with BadDigest.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async put(
    area: StorageArea,
    key: string,
    body: Uint8Array,
    options: PutOptions,
  ): Promise<void> {
    assertSafeObjectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[area],
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async putFile(
    area: StorageArea,
    key: string,
    path: string,
    options: PutOptions,
  ): Promise<void> {
    assertSafeObjectKey(key);
    const { size } = await stat(path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[area],
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async download(area: StorageArea, key: string, path: string): Promise<void> {
    assertSafeObjectKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[area], Key: key }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new Error('Unexpected object body');
    }
    await pipeline(result.Body, createWriteStream(path, { flags: 'wx' }));
  }

  async head(area: StorageArea, key: string): Promise<StoredObject | null> {
    assertSafeObjectKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[area], Key: key }),
      );
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(area: StorageArea, key: string): Promise<void> {
    assertSafeObjectKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.buckets[area], Key: key }),
    );
  }

  async presignPut(
    area: StorageArea,
    key: string,
    upload: {
      contentType: string;
      sizeBytes: number;
      expiresInSeconds: number;
    },
  ): Promise<PresignedUpload> {
    assertSafeObjectKey(key);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.buckets[area],
        Key: key,
        ContentType: upload.contentType,
        ContentLength: upload.sizeBytes,
      }),
      {
        expiresIn: upload.expiresInSeconds,
        // Signed as headers, so a different type or size breaks the signature.
        signableHeaders: new Set(['content-type', 'content-length']),
        unhoistableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return {
      url,
      headers: { 'Content-Type': upload.contentType },
      expiresAt: new Date(Date.now() + upload.expiresInSeconds * 1000),
    };
  }

  publicUrl(key: string): string {
    assertSafeObjectKey(key);
    return `${this.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async checkBucket(): Promise<void> {
    for (const bucket of Object.values(this.buckets)) {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
