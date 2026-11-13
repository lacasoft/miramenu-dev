import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  branchMenuDraftSchema,
  businessMenuDraftSchema,
  createdMediaSchema,
  type Media,
  mediaSchema,
} from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  type AppConfig,
  parseEnvironment,
} from '../src/infrastructure/config/environment';
import { S3ObjectStorage } from '../src/infrastructure/storage/s3-object-storage';
import { MEDIA_QUEUE } from '../src/modules/catalog/application/media-queue';
import {
  activateAdmin,
  ADMIN_PASSWORD,
  type AdminClient,
  type BusinessFixture,
  clientIp,
  createBranch,
  createBusiness,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import { createCategory, PROFILE } from './support/catalog-fixtures';
import {
  createMedia,
  createTestWorker,
  makeImage,
  makeVideo,
  mediaIn,
  putToSignedUrl,
  settled,
  uploadMedia,
} from './support/media-fixtures';
import { createTestApp } from './support/test-app';

jest.setTimeout(180_000);

describe('Catalog media: upload and worker (e2e)', () => {
  // Jobs of this file live under their own prefix, so no other worker takes them.
  const queuePrefix = unique('e2e-media');
  const withQueue = (config: AppConfig): AppConfig => ({
    ...config,
    queue: { prefix: queuePrefix },
  });
  const ip = clientIp();
  const storage = new S3ObjectStorage(parseEnvironment(process.env));
  let app: INestApplication<App>;
  let worker: TestingModule | null = null;
  let superadmin: AdminClient;
  let business: BusinessFixture;
  let owner: AdminClient;
  let branchAdmin: AdminClient;
  let branch1: string;
  let branch2: string;
  let category: string;
  let dir: string;
  const files: Record<string, string> = {};

  const businessScope = () => `/admin/businesses/${business.id}`;
  const branchScope = (branchId: string) => `/admin/branches/${branchId}`;
  const startWorker = async () => {
    worker = await createTestWorker(withQueue);
  };
  const stopWorker = async () => {
    await worker?.close();
    worker = null;
  };
  beforeAll(async () => {
    app = await createTestApp({ configure: withQueue });
    await ensureSuperadmin();
    superadmin = await login(app, SUPERADMIN.email, SUPERADMIN.password, ip);
    business = await createBusiness(superadmin);
    owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
    branch1 = (await createBranch(owner, business.id)).id;
    branch2 = (await createBranch(owner, business.id)).id;
    const email = `${unique('branch-admin')}@example.test`;
    await owner
      .send('post', `/admin/businesses/${business.id}/users`, {
        email,
        name: 'Branch admin',
        role: { role: 'branch_admin', branchId: branch1 },
      })
      .expect(201);
    await activateAdmin(email);
    branchAdmin = await login(app, email, ADMIN_PASSWORD, ip);
    await owner
      .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
      .expect(200);
    category = await createCategory(owner, business.id);

    dir = await mkdtemp(join(tmpdir(), 'miramenu-media-e2e-'));
    files.photo = await makeImage(dir, 'photo', 1600, 1200);
    files.small = await makeImage(dir, 'small', 300, 200);
    files.video = await makeVideo(dir, 'video', {
      seconds: 3,
      width: 1280,
      height: 720,
    });
    files.long = await makeVideo(dir, 'long', {
      seconds: 61,
      width: 64,
      height: 64,
    });
    files.corrupt = join(dir, 'corrupt.bin');
    await writeFile(files.corrupt, randomBytes(4096));
  });

  afterAll(async () => {
    await stopWorker();
    await app
      .get<Queue>(getQueueToken(MEDIA_QUEUE))
      .obliterate({ force: true });
    await app.close();
    storage.onApplicationShutdown();
    await rm(dir, { recursive: true, force: true });
  });

  describe('upload (ADR-0038)', () => {
    it('signs a PUT straight to storage, and only confirms what arrived', async () => {
      const created = await createMedia(
        owner,
        businessScope(),
        files.photo,
        'image',
      );
      expect(createdMediaSchema.parse(created).media.status).toBe(
        'pending_upload',
      );
      const config = parseEnvironment(process.env);
      expect(created.upload.url.startsWith(config.storage.endpoint)).toBe(true);

      const early = await owner
        .send('post', `${businessScope()}/media/${created.media.id}/complete`)
        .expect(409);
      expect(early.body.code).toBe('MEDIA_NOT_UPLOADED');

      expect(await putToSignedUrl(created, files.photo)).toBe(200);
      for (let time = 0; time < 2; time += 1) {
        const confirmed = await owner
          .send('post', `${businessScope()}/media/${created.media.id}/complete`)
          .expect(200);
        expect(mediaSchema.parse(confirmed.body).status).toBe('processing');
      }
      files.photoId = created.media.id;
    });

    it('shows in the base draft the media it uses while they process, and none it does not use', async () => {
      const logo = await uploadMedia(
        owner,
        businessScope(),
        files.small,
        'image',
      );
      const unused = await uploadMedia(
        owner,
        businessScope(),
        files.small,
        'image',
      );
      for (const imageId of [files.photoId, files.photoId]) {
        await owner
          .send('post', `${businessScope()}/dishes`, {
            categoryId: category,
            name: 'Con foto',
            priceCents: 100,
            currency: 'MXN',
            imageId,
          })
          .expect(201);
      }
      await owner
        .send('put', `${businessScope()}/profile`, {
          ...PROFILE,
          logoId: logo.id,
        })
        .expect(200);

      const draft = businessMenuDraftSchema.parse(
        (await owner.send('get', `${businessScope()}/menu-draft`).expect(200))
          .body,
      );
      // Two dishes with the same photo list it once; the unused upload is not the draft's.
      expect(draft.media.map((media) => media.id).sort()).toEqual(
        [files.photoId, logo.id].sort(),
      );
      expect(
        draft.media.find((media) => media.id === files.photoId),
      ).toMatchObject({
        kind: 'image',
        status: 'processing',
        stalled: false,
        image: null,
      });
      expect(draft.media.map((media) => media.id)).not.toContain(unused.id);
      await owner
        .send('put', `${businessScope()}/profile`, PROFILE)
        .expect(200);
    });

    it('fails an upload that is not what was signed, and deletes it', async () => {
      const created = await createMedia(
        owner,
        businessScope(),
        files.photo,
        'image',
      );
      const key = `${business.id}/${created.media.id}/original`;
      await storage.put('originals', key, randomBytes(10), {
        contentType: 'image/jpeg',
      });
      const response = await owner
        .send('post', `${businessScope()}/media/${created.media.id}/complete`)
        .expect(422);
      expect(response.body.code).toBe('MEDIA_REJECTED');
      expect(
        await mediaIn(owner, businessScope(), created.media.id),
      ).toMatchObject({ status: 'failed', failureReason: 'upload_mismatch' });
      await expect(storage.head('originals', key)).resolves.toBeNull();
    });

    it('refuses a medium that is not uploaded, of the wrong kind or of another business', async () => {
      const pending = await createMedia(
        owner,
        businessScope(),
        files.small,
        'image',
      );
      const video = await uploadMedia(
        owner,
        businessScope(),
        files.video,
        'video',
      );
      files.videoId = video.id;
      const other = await createBusiness(superadmin);
      const otherOwner = await login(app, other.adminEmail, ADMIN_PASSWORD, ip);
      const foreign = await uploadMedia(
        otherOwner,
        `/admin/businesses/${other.id}`,
        files.small,
        'image',
      );

      const attach = (imageId: string) =>
        owner.send('post', `${businessScope()}/dishes`, {
          categoryId: category,
          name: 'Tacos',
          priceCents: 100,
          currency: 'MXN',
          imageId,
        });
      expect((await attach(pending.media.id)).body.code).toBe(
        'MEDIA_NOT_UPLOADED',
      );
      expect((await attach(video.id)).body.code).toBe('MEDIA_KIND_MISMATCH');
      expect((await attach(foreign.id)).body.code).toBe('MEDIA_NOT_FOUND');
    });

    it("keeps a branch's media to that branch: never on the base menu or a sibling", async () => {
      const own = await uploadMedia(
        branchAdmin,
        branchScope(branch1),
        files.small,
        'image',
      );
      files.smallId = own.id;
      const ownDish = (branchId: string) =>
        owner.send('post', `${branchScope(branchId)}/dishes`, {
          categoryId: category,
          name: 'Own',
          priceCents: 100,
          currency: 'MXN',
          imageId: own.id,
        });
      expect((await ownDish(branch2)).body.code).toBe('MEDIA_NOT_FOUND');
      expect((await ownDish(branch1)).status).toBe(201);
      const base = await owner.send('post', `${businessScope()}/dishes`, {
        categoryId: category,
        name: 'Base',
        priceCents: 100,
        currency: 'MXN',
        imageId: own.id,
      });
      expect(base.body.code).toBe('MEDIA_NOT_FOUND');

      const sibling = await owner
        .send('get', `${branchScope(branch2)}/media?limit=50`)
        .expect(200);
      const ids = sibling.body.items.map((item: Media) => item.id);
      expect(ids).toContain(files.photoId);
      expect(ids).not.toContain(own.id);

      await branchAdmin
        .send('post', `${businessScope()}/media`, {
          kind: 'image',
          contentType: 'image/jpeg',
          sizeBytes: 10,
        })
        .expect(403);

      // Its draft carries the media of its own dishes; a sibling's draft does not.
      const draftOf = async (branchId: string) =>
        branchMenuDraftSchema.parse(
          (
            await owner
              .send('get', `${branchScope(branchId)}/menu-draft`)
              .expect(200)
          ).body,
        );
      expect((await draftOf(branch1)).media.map((media) => media.id)).toEqual([
        own.id,
      ]);
      expect((await draftOf(branch2)).media).toEqual([]);
    });

    it('lists media stalled past the limit as a problem (design: Cae el worker)', async () => {
      const strict = await createTestApp({
        configure: (config) =>
          withQueue({
            ...config,
            media: { ...config.media, stalledMinutes: 0 },
          }),
      });
      try {
        const listed = await request(strict.getHttpServer())
          .get(`${businessScope()}/media?problem=true&limit=50`)
          .set('Cookie', owner.cookieHeader)
          .expect(200);
        const photo = (listed.body.items as Media[]).find(
          (item) => item.id === files.photoId,
        );
        expect(photo).toMatchObject({ status: 'processing', stalled: true });
      } finally {
        await strict.close();
      }
    });
  });

  describe('worker (ADR-0006)', () => {
    beforeAll(startWorker);

    it('optimizes a photo into public WebP variants, without enlarging it', async () => {
      const photo = await settled(owner, businessScope(), files.photoId);
      expect(photo.status).toBe('ready');
      expect(photo.image?.sources.map((s) => s.width)).toEqual([
        480, 960, 1440,
      ]);
      expect(photo.image).toMatchObject({ width: 1440, height: 1080 });
      for (const source of photo.image?.sources ?? []) {
        const response = await fetch(source.url);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/webp');
      }
      const small = await settled(
        branchAdmin,
        branchScope(branch1),
        files.smallId,
      );
      expect(small.image?.sources.map((s) => s.width)).toEqual([300]);
    });

    it('optimizes a video into MP4 with its poster', async () => {
      const video = await settled(owner, businessScope(), files.videoId);
      expect(video.status).toBe('ready');
      expect(video.video).toMatchObject({ width: 1280, height: 720 });
      expect(Math.abs((video.video?.durationMs ?? 0) - 3000)).toBeLessThan(300);
      expect(video.video?.poster.sources.map((s) => s.width)).toEqual([
        480, 960,
      ]);
      const response = await fetch(video.video?.url ?? '');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('video/mp4');
    });

    it('shows in the base draft the media it uses once ready, to its branch admins too', async () => {
      await owner
        .send('post', `${businessScope()}/dishes`, {
          categoryId: category,
          name: 'Con video',
          priceCents: 100,
          currency: 'MXN',
          imageId: files.photoId,
          videoId: files.videoId,
        })
        .expect(201);
      for (const reader of [owner, branchAdmin]) {
        const draft = businessMenuDraftSchema.parse(
          (
            await reader
              .send('get', `${businessScope()}/menu-draft`)
              .expect(200)
          ).body,
        );
        const byId = new Map(draft.media.map((media) => [media.id, media]));
        expect([...byId.keys()].sort()).toEqual(
          [files.photoId, files.videoId].sort(),
        );
        expect(byId.get(files.photoId)?.image?.sources.length).toBe(3);
        expect(byId.get(files.videoId)).toMatchObject({ status: 'ready' });
        expect(byId.get(files.videoId)?.video?.poster.sources.length).toBe(2);
      }
    });

    it('fails an unreadable file and a video over the limit, without retrying', async () => {
      const corrupt = await uploadMedia(
        owner,
        businessScope(),
        files.corrupt,
        'image',
      );
      const long = await uploadMedia(
        owner,
        businessScope(),
        files.long,
        'video',
      );
      expect(await settled(owner, businessScope(), corrupt.id)).toMatchObject({
        status: 'failed',
        failureReason: 'unsupported_format',
      });
      expect(await settled(owner, businessScope(), long.id)).toMatchObject({
        status: 'failed',
        failureReason: 'too_long',
      });
    });
  });
});
