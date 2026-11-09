import {
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import {
  assertSafeObjectKey,
  ObjectStorage,
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
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    const storage = config.storage;
    this.bucket = storage.bucket;
    this.publicBaseUrl = storage.publicBaseUrl;
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    assertSafeObjectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async head(key: string): Promise<StoredObject | null> {
    assertSafeObjectKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
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

  publicUrl(key: string): string {
    assertSafeObjectKey(key);
    return `${this.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async checkBucket(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
