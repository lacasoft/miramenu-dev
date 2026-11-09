import { randomBytes } from 'node:crypto';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseEnvironment } from '../src/infrastructure/config/environment';
import { S3ObjectStorage } from '../src/infrastructure/storage/s3-object-storage';

const config = parseEnvironment(process.env);

describe('S3 object storage against SeaweedFS (integration)', () => {
  const storage = new S3ObjectStorage(config);
  const admin = new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    forcePathStyle: config.storage.forcePathStyle,
    credentials: {
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
    },
  });
  const key = `e2e/${randomBytes(6).toString('hex')}/sample.txt`;
  const body = new TextEncoder().encode('miramenu e2e object');

  afterAll(async () => {
    await admin.send(
      new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }),
    );
    admin.destroy();
    storage.onApplicationShutdown();
  });

  it('reaches the bucket with the API credentials', async () => {
    await expect(storage.checkBucket()).resolves.toBeUndefined();
  });

  it('stores an object and describes it', async () => {
    await storage.put(key, body, 'text/plain');

    await expect(storage.head(key)).resolves.toEqual({
      size: body.byteLength,
      contentType: 'text/plain',
    });
  });

  it('reports a missing object as null', async () => {
    await expect(
      storage.head(`e2e/${randomBytes(6).toString('hex')}/missing.txt`),
    ).resolves.toBeNull();
  });

  it('serves the object anonymously from its public URL, as phones will read media', async () => {
    const response = await fetch(storage.publicUrl(key));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('miramenu e2e object');
  });

  it('refuses anonymous writes to the public bucket', async () => {
    const response = await fetch(
      storage.publicUrl(`e2e/${randomBytes(6).toString('hex')}/forged.txt`),
      {
        method: 'PUT',
        body: 'forged',
      },
    );

    expect(response.status).toBe(403);
  });
});
