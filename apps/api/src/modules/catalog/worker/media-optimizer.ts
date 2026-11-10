import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { MediaFailureReason } from '@miramenu/contracts';
import { Ffmpeg, FfmpegError } from '../../../infrastructure/ffmpeg/ffmpeg';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import {
  IMAGE_WIDTHS,
  judgeProbe,
  type MediaVariants,
  POSTER_WIDTHS,
  type ProbedMedia,
  type StoredImage,
  variantWidths,
} from '../domain/media-rules';
import { variantKey } from '../application/media-keys';
import type { ProcessingMedia } from '../application/media-ready.service';
import { posterArgs, videoArgs, webpArgs } from './transcode-args';

/** The upload itself is unacceptable: retrying cannot help. */
export class InvalidMediaError extends Error {
  constructor(readonly reason: MediaFailureReason) {
    super(`Invalid media: ${reason}`);
    this.name = 'InvalidMediaError';
  }
}

const PROBE_TIMEOUT_MS = 30_000;
const IMAGE_TIMEOUT_MS = 60_000;
const VIDEO_TIMEOUT_MS = 10 * 60_000;
/** Variant keys are never reused, so phones and the CDN may keep them forever. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Turns an original into its variants (ADR-0038): downloads it to a private temporary
 * directory, judges it with ffprobe before decoding anything else, transcodes, uploads the
 * variants to the public area and always removes the directory.
 */
@Injectable()
export class MediaOptimizer {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly ffmpeg: Ffmpeg,
  ) {}

  async optimize(media: ProcessingMedia): Promise<MediaVariants> {
    const dir = await mkdtemp(join(tmpdir(), 'miramenu-media-'));
    try {
      const original = join(dir, 'original');
      await this.storage.download('originals', media.originalKey, original);
      const verdict = judgeProbe(media.kind, await this.probe(original));
      if (!verdict.ok) throw new InvalidMediaError(verdict.reason);
      if (media.kind === 'image') {
        const image = await this.images(media, original, dir, {
          prefix: 'image',
          targets: IMAGE_WIDTHS,
          sourceWidth: verdict.media.width,
        });
        return { kind: 'image', image };
      }
      return {
        kind: 'video',
        video: await this.video(media, original, dir, verdict.media),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** ffprobe failing on a file means it is not media; timing out is worth a retry. */
  private async probe(path: string): Promise<unknown> {
    try {
      return await this.ffmpeg.probe(path, PROBE_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof FfmpegError && !error.timedOut) {
        throw new InvalidMediaError('unsupported_format');
      }
      throw error;
    }
  }

  private async video(
    media: ProcessingMedia,
    original: string,
    dir: string,
    probed: ProbedMedia,
  ) {
    const output = join(dir, 'video.mp4');
    await this.ffmpeg.transcode(original, videoArgs(output), VIDEO_TIMEOUT_MS);
    const size = await this.dimensionsOf(output);
    const key = variantKey(media.businessId, media.id, 'video.mp4');
    await this.storage.putFile('media', key, output, {
      contentType: 'video/mp4',
      cacheControl: IMMUTABLE,
    });
    const poster = await this.images(media, original, dir, {
      prefix: 'poster',
      targets: POSTER_WIDTHS,
      sourceWidth: probed.width,
      atSeconds: Math.min(0.5, probed.durationMs / 2000),
    });
    return { key, ...size, durationMs: probed.durationMs, poster };
  }

  private async images(
    media: ProcessingMedia,
    input: string,
    dir: string,
    plan: {
      prefix: string;
      targets: readonly number[];
      sourceWidth: number;
      atSeconds?: number;
    },
  ): Promise<StoredImage> {
    const sources: { width: number; height: number; key: string }[] = [];
    for (const width of variantWidths(plan.sourceWidth, plan.targets)) {
      const file = `${plan.prefix}-${width}.webp`;
      const output = join(dir, file);
      const args =
        plan.atSeconds === undefined
          ? webpArgs(width, output)
          : posterArgs(width, plan.atSeconds, output);
      await this.ffmpeg.transcode(input, args, IMAGE_TIMEOUT_MS);
      const size = await this.dimensionsOf(output);
      const key = variantKey(media.businessId, media.id, file);
      await this.storage.putFile('media', key, output, {
        contentType: 'image/webp',
        cacheControl: IMMUTABLE,
      });
      sources.push({ ...size, key });
    }
    const largest = sources[sources.length - 1];
    return {
      width: largest.width,
      height: largest.height,
      sources: sources.map(({ width, key }) => ({ width, key })),
    };
  }

  /** What ffmpeg actually wrote, read back rather than predicted. */
  private async dimensionsOf(
    path: string,
  ): Promise<{ width: number; height: number }> {
    const probe = (await this.ffmpeg.probe(path, PROBE_TIMEOUT_MS)) as {
      streams?: { codec_type?: string; width?: number; height?: number }[];
    };
    const stream = probe.streams?.find((s) => s.codec_type === 'video');
    if (!stream?.width || !stream.height) {
      throw new Error('ffmpeg wrote a variant without dimensions');
    }
    return { width: stream.width, height: stream.height };
  }
}
