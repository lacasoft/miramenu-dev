import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvironment } from '../src/infrastructure/config/environment';
import { S3ObjectStorage } from '../src/infrastructure/storage/s3-object-storage';

const config = parseEnvironment(process.env);
const anonymousUrl = (bucket: string, key: string) =>
  `${config.storage.endpoint}/${bucket}/${key}`;

describe('S3 object storage against SeaweedFS (integration)', () => {
  const storage = new S3ObjectStorage(config);
  const run = randomBytes(6).toString('hex');
  const key = `e2e/${run}/sample.txt`;
  const body = new TextEncoder().encode('miramenu e2e object');
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'miramenu-storage-'));
  });

  afterAll(async () => {
    for (const area of ['media', 'originals'] as const) {
      for (const suffix of [
        'sample.txt',
        'original.txt',
        'file.bin',
        'upload.bin',
      ]) {
        await storage.delete(area, `e2e/${run}/${suffix}`);
      }
    }
    await rm(workDir, { recursive: true, force: true });
    storage.onApplicationShutdown();
  });

  it('reaches both buckets with the API credentials', async () => {
    await expect(storage.checkBucket()).resolves.toBeUndefined();
  });

  it('stores an object, describes it and deletes it', async () => {
    await storage.put('media', key, body, { contentType: 'text/plain' });
    await expect(storage.head('media', key)).resolves.toEqual({
      size: body.byteLength,
      contentType: 'text/plain',
    });

    await storage.delete('media', key);
    await expect(storage.head('media', key)).resolves.toBeNull();
    await storage.put('media', key, body, { contentType: 'text/plain' });
  });

  it('serves media anonymously from its public URL, as phones will read it', async () => {
    const response = await fetch(storage.publicUrl(key));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('miramenu e2e object');
  });

  it('keeps originals in their private bucket: never served anonymously, they keep their EXIF (ADR-0038)', async () => {
    const originalKey = `e2e/${run}/original.txt`;
    await storage.put('originals', originalKey, body, {
      contentType: 'text/plain',
    });
    await expect(
      storage.head('originals', originalKey),
    ).resolves.not.toBeNull();

    const fromItsBucket = await fetch(
      anonymousUrl(config.storage.originalsBucket, originalKey),
    );
    expect(fromItsBucket.status).toBe(403);
    // And it never landed in the public bucket either.
    const fromPublicUrl = await fetch(storage.publicUrl(originalKey));
    expect(fromPublicUrl.status).toBe(404);
  });

  it('refuses anonymous writes to the public bucket', async () => {
    const response = await fetch(storage.publicUrl(`e2e/${run}/forged.txt`), {
      method: 'PUT',
      body: 'forged',
    });
    expect(response.status).toBe(403);
  });

  it('streams a file up and back down', async () => {
    const source = join(workDir, 'source.bin');
    const copy = join(workDir, 'copy.bin');
    const content = randomBytes(256 * 1024);
    await writeFile(source, content);

    await storage.putFile('originals', `e2e/${run}/file.bin`, source, {
      contentType: 'application/octet-stream',
    });
    await storage.download('originals', `e2e/${run}/file.bin`, copy);
    expect(Buffer.compare(await readFile(copy), content)).toBe(0);
  });

  describe('signed upload', () => {
    const uploadKey = `e2e/${run}/upload.bin`;
    const content = randomBytes(1024);
    const presign = () =>
      storage.presignPut('originals', uploadKey, {
        contentType: 'image/jpeg',
        sizeBytes: content.byteLength,
        expiresInSeconds: 60,
      });

    it('accepts exactly the signed type and size', async () => {
      const upload = await presign();
      const response = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers,
        body: content,
      });
      expect(response.status).toBe(200);
      await expect(storage.head('originals', uploadKey)).resolves.toEqual({
        size: content.byteLength,
        contentType: 'image/jpeg',
      });
    });

    it('refuses another content type', async () => {
      const upload = await presign();
      const response = await fetch(upload.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: content,
      });
      expect(response.status).toBe(403);
    });

    it('refuses a body of another size', async () => {
      const upload = await presign();
      const response = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers,
        body: randomBytes(content.byteLength + 1),
      });
      expect(response.status).toBe(403);
    });
  });
});
