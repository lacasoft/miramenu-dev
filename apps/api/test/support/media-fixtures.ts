import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { CreatedMedia, Media, MediaKind } from '@miramenu/contracts';
import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { APP_CONFIG } from '../../src/infrastructure/config/config.module';
import {
  type AppConfig,
  parseEnvironment,
} from '../../src/infrastructure/config/environment';
import { WorkerModule } from '../../src/worker.module';
import type { AdminClient } from './admin-fixtures';

const run = promisify(execFile);
const ffmpeg = parseEnvironment(process.env).media.ffmpegPath;

/** A JPEG test card of the given size, generated locally: tests never download media. */
export async function makeImage(
  dir: string,
  name: string,
  width: number,
  height: number,
): Promise<string> {
  const path = join(dir, `${name}.jpg`);
  await run(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}`,
    '-frames:v',
    '1',
    '-y',
    path,
  ]);
  return path;
}

/** An MP4 (H.264 + AAC) test pattern of the given length and size. */
export async function makeVideo(
  dir: string,
  name: string,
  video: { seconds: number; width: number; height: number },
): Promise<string> {
  const path = join(dir, `${name}.mp4`);
  await run(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${video.width}x${video.height}:rate=24`,
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440',
    '-t',
    String(video.seconds),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    path,
  ]);
  return path;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  bin: 'image/jpeg',
};

/** Creates a medium under scope (e.g. /admin/businesses/<id>) and returns its signed upload. */
export async function createMedia(
  admin: AdminClient,
  scope: string,
  file: string,
  kind: MediaKind,
): Promise<CreatedMedia> {
  const contentType = CONTENT_TYPES[file.split('.').pop() ?? ''];
  const { size } = await stat(file);
  const response = await admin
    .send('post', `${scope}/media`, { kind, contentType, sizeBytes: size })
    .expect(201);
  return response.body as CreatedMedia;
}

/** Uploads the file straight to storage, as the admin app's browser does. */
export async function putToSignedUrl(
  created: CreatedMedia,
  file: string,
): Promise<number> {
  const response = await fetch(created.upload.url, {
    method: created.upload.method,
    headers: created.upload.headers,
    body: await readFile(file),
  });
  return response.status;
}

/** Create, upload and confirm: the medium is then processing. */
export async function uploadMedia(
  admin: AdminClient,
  scope: string,
  file: string,
  kind: MediaKind,
): Promise<Media> {
  const created = await createMedia(admin, scope, file, kind);
  const status = await putToSignedUrl(created, file);
  if (status !== 200) throw new Error(`upload answered ${status}`);
  const response = await admin
    .send('post', `${scope}/media/${created.media.id}/complete`)
    .expect(200);
  return response.body as Media;
}

/** The medium as listed under scope. */
export async function mediaIn(
  admin: AdminClient,
  scope: string,
  mediaId: string,
): Promise<Media | undefined> {
  const response = await admin
    .send('get', `${scope}/media?limit=50`)
    .expect(200);
  return (response.body as { items: Media[] }).items.find(
    (media) => media.id === mediaId,
  );
}

/** Polls until the check passes or the time runs out. */
export async function eventually<T>(
  check: () => Promise<T | undefined>,
  timeoutMs = 60_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== undefined) return value;
    await sleep(250);
  }
  throw new Error('timed out waiting');
}

/** Waits until the medium reaches one of the final states. */
export function settled(
  admin: AdminClient,
  scope: string,
  mediaId: string,
): Promise<Media> {
  return eventually(async () => {
    const media = await mediaIn(admin, scope, mediaId);
    return media && (media.status === 'ready' || media.status === 'failed')
      ? media
      : undefined;
  });
}

/**
 * The real worker process (WorkerModule) inside the test, with its BullMQ worker running.
 * Use the same queue prefix as the test's API app, so it takes only that file's jobs.
 */
export async function createTestWorker(
  configure: (config: AppConfig) => AppConfig,
  imports: (Type | DynamicModule)[] = [WorkerModule],
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({ imports })
    .overrideProvider(APP_CONFIG)
    .useValue(configure(parseEnvironment(process.env)))
    .compile();
  moduleRef.useLogger(false);
  await moduleRef.init();
  return moduleRef;
}
