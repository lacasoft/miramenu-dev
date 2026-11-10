import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication, Module } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { PublishedMenu } from '@miramenu/contracts';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ConfigModule } from '../src/infrastructure/config/config.module';
import type { AppConfig } from '../src/infrastructure/config/environment';
import { DatabaseModule } from '../src/infrastructure/database/database.module';
import { RedisModule } from '../src/infrastructure/redis/redis.module';
import { StorageModule } from '../src/infrastructure/storage/storage.module';
import { MEDIA_QUEUE } from '../src/modules/catalog/application/media-queue';
import { MediaReadyService } from '../src/modules/catalog/application/media-ready.service';
import { PublishedMenuService } from '../src/modules/catalog/application/published-menu.service';
import type { MediaVariants } from '../src/modules/catalog/domain/media-rules';
import {
  ADMIN_PASSWORD,
  type AdminClient,
  asOwner,
  type BusinessFixture,
  clientIp,
  createBranch,
  createBusiness,
  ensureSuperadmin,
  login,
  SUPERADMIN,
  unique,
} from './support/admin-fixtures';
import {
  createCategory,
  createDish,
  PROFILE,
  publishBusiness,
} from './support/catalog-fixtures';
import {
  createTestWorker,
  eventually,
  makeImage,
  makeVideo,
  settled,
  uploadMedia,
} from './support/media-fixtures';
import { createTestApp } from './support/test-app';

jest.setTimeout(180_000);

/** Catalog's media services without a running worker, to drive ADR-0015 step by step. */
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, StorageModule],
  providers: [MediaReadyService, PublishedMenuService],
})
class ReadyServicesModule {}

describe('Menu versions when a medium becomes ready, ADR-0015 (e2e)', () => {
  // Jobs of this file live under their own prefix, so no other worker takes them.
  const queuePrefix = unique('e2e-versions');
  const withQueue = (config: AppConfig): AppConfig => ({
    ...config,
    queue: { prefix: queuePrefix },
  });
  const ip = clientIp();
  let app: INestApplication<App>;
  let worker: TestingModule | null = null;
  let services: TestingModule;
  let business: BusinessFixture;
  let owner: AdminClient;
  let branch1: string;
  let branch2: string;
  let category: string;
  let dir: string;
  const files: Record<string, string> = {};

  const businessScope = () => `/admin/businesses/${business.id}`;
  const menuOf = async (branchId: string): Promise<PublishedMenu> =>
    (
      await request(app.getHttpServer())
        .get(`/branches/${branchId}/menu`)
        .expect(200)
    ).body as PublishedMenu;
  const dishIn = (menu: PublishedMenu, dishId: string) =>
    menu.categories.flatMap((c) => c.dishes).find((d) => d.id === dishId);
  const startWorker = async () => {
    worker = await createTestWorker(withQueue);
  };
  const stopWorker = async () => {
    await worker?.close();
    worker = null;
  };
  const variantsOf = (mediaId: string) =>
    asOwner(async (client) => {
      const result = await client.query<{ variants: MediaVariants }>(
        `SELECT variants FROM catalog.media_asset WHERE id = $1`,
        [mediaId],
      );
      return result.rows[0].variants;
    });
  const latestMenuRow = (branchId: string) =>
    asOwner(async (client) => {
      const result = await client.query<{
        version: number;
        origin: string;
        media_id: string | null;
        base_version: number;
        pending_media: string[];
      }>(
        `SELECT version, origin, media_id, base_version, pending_media::text[] AS pending_media
         FROM catalog.published_menu WHERE branch_id = $1 ORDER BY version DESC LIMIT 1`,
        [branchId],
      );
      return result.rows[0];
    });

  beforeAll(async () => {
    app = await createTestApp({ configure: withQueue });
    services = await createTestWorker(withQueue, [ReadyServicesModule]);
    await ensureSuperadmin();
    const superadmin = await login(
      app,
      SUPERADMIN.email,
      SUPERADMIN.password,
      ip,
    );
    business = await createBusiness(superadmin);
    owner = await login(app, business.adminEmail, ADMIN_PASSWORD, ip);
    branch1 = (await createBranch(owner, business.id)).id;
    branch2 = (await createBranch(owner, business.id)).id;
    await owner
      .send('put', `/admin/businesses/${business.id}/profile`, PROFILE)
      .expect(200);
    category = await createCategory(owner, business.id);

    dir = await mkdtemp(join(tmpdir(), 'miramenu-versions-e2e-'));
    files.video = await makeVideo(dir, 'video', {
      seconds: 3,
      width: 1280,
      height: 720,
    });
    // A ready photo to start from: the worker runs only while it is processed.
    const photo = await uploadMedia(
      owner,
      businessScope(),
      await makeImage(dir, 'photo', 1600, 1200),
      'image',
    );
    await startWorker();
    expect((await settled(owner, businessScope(), photo.id)).status).toBe(
      'ready',
    );
    await stopWorker();
    files.photoId = photo.id;
  });

  afterAll(async () => {
    await stopWorker();
    await app
      .get<Queue>(getQueueToken(MEDIA_QUEUE))
      .obliterate({ force: true });
    await services.close();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  let dish: string;

  it('publishes with the photo while the video processes, then adds the video in its own version', async () => {
    await stopWorker();
    const video = await uploadMedia(
      owner,
      businessScope(),
      files.video,
      'video',
    );
    dish = await createDish(owner, business.id, category, { name: 'Pastor' });
    await owner
      .send('patch', `${businessScope()}/dishes/${dish}`, {
        imageId: files.photoId,
        videoId: video.id,
      })
      .expect(200);
    await owner
      .send('put', `${businessScope()}/profile`, {
        ...PROFILE,
        logoId: files.photoId,
      })
      .expect(200);
    expect((await publishBusiness(owner, business.id)).status).toBe(201);

    const before = await menuOf(branch1);
    expect(dishIn(before, dish)).toMatchObject({ video: null });
    expect(dishIn(before, dish)?.image).not.toBeNull();
    expect(before.profile.logo).not.toBeNull();
    const published = await latestMenuRow(branch1);
    expect(published).toMatchObject({
      origin: 'publication',
      pending_media: [video.id],
    });
    // A draft change meanwhile must not ride along: the new version copies what was published.
    await owner
      .send('patch', `${businessScope()}/dishes/${dish}`, {
        name: 'Pastor (draft)',
      })
      .expect(200);

    await startWorker();
    const after = await eventually(async () => {
      const menu = await menuOf(branch1);
      return menu.version > before.version ? menu : undefined;
    });
    expect(after.version).toBe(before.version + 1);
    expect(dishIn(after, dish)?.video?.url).toMatch(/video\.mp4$/);
    expect(dishIn(after, dish)).toMatchObject({ name: 'Pastor' });
    expect(JSON.stringify(after)).not.toContain('(draft)');
    expect(await latestMenuRow(branch1)).toMatchObject({
      origin: 'media_ready',
      media_id: video.id,
      base_version: published.base_version,
      pending_media: [],
    });
    expect((await latestMenuRow(branch2)).origin).toBe('media_ready');
    files.readyVideoId = video.id;
  });

  it('never makes a second version for the same medium when the call is retried', async () => {
    const ready = services.get(MediaReadyService);
    const variants = await variantsOf(files.readyVideoId);
    const before = await menuOf(branch1);
    await asOwner((client) =>
      client.query(
        `UPDATE catalog.media_asset SET status = 'processing', variants = NULL WHERE id = $1`,
        [files.readyVideoId],
      ),
    );
    await ready.markReady(files.readyVideoId, variants);
    await ready.markReady(files.readyVideoId, variants);
    expect((await menuOf(branch1)).version).toBe(before.version);
  });

  it('keeps both changes when a publication and a ready medium meet', async () => {
    await stopWorker();
    const ready = services.get(MediaReadyService);
    const video = await uploadMedia(
      owner,
      businessScope(),
      files.video,
      'video',
    );
    await owner
      .send('patch', `${businessScope()}/dishes/${dish}`, {
        videoId: video.id,
      })
      .expect(200);
    expect((await publishBusiness(owner, business.id)).status).toBe(201);
    await owner
      .send('patch', `${businessScope()}/dishes/${dish}`, {
        name: 'Pastor de trompo',
      })
      .expect(200);

    const [publication] = await Promise.all([
      publishBusiness(owner, business.id),
      ready.markReady(video.id, await variantsOf(files.readyVideoId)),
    ]);
    expect(publication.status).toBe(201);
    const latest = await menuOf(branch1);
    expect(dishIn(latest, dish)).toMatchObject({ name: 'Pastor de trompo' });
    expect(dishIn(latest, dish)?.video).not.toBeNull();
  });

  it('keeps the photo and makes no version when the video fails', async () => {
    const ready = services.get(MediaReadyService);
    const video = await uploadMedia(
      owner,
      businessScope(),
      files.video,
      'video',
    );
    await owner
      .send('patch', `${businessScope()}/dishes/${dish}`, {
        videoId: video.id,
      })
      .expect(200);
    expect((await publishBusiness(owner, business.id)).status).toBe(201);
    const before = await menuOf(branch1);

    await ready.markFailed(video.id, 'processing_error');
    const after = await menuOf(branch1);
    expect(after.version).toBe(before.version);
    expect(dishIn(after, dish)).toMatchObject({ video: null });
    expect(dishIn(after, dish)?.image).not.toBeNull();
  });
});
