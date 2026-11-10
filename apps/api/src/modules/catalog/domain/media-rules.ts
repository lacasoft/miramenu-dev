import {
  MEDIA_LIMITS,
  type MediaFailureReason,
  type MediaKind,
  type MediaStatus,
  type MenuImage,
  type MenuVideo,
} from '@miramenu/contracts';
import { z } from 'zod';

/** Variant widths (ADR-0038); a source is never enlarged. */
export const IMAGE_WIDTHS = [480, 960, 1440] as const;
export const POSTER_WIDTHS = [480, 960] as const;
/** A video's shorter side is at most this, in pixels. */
export const VIDEO_SHORT_SIDE = 720;

/** Containers and codecs accepted per kind, as ffprobe names them. Anything else fails. */
const IMAGE_FORMATS = new Set(['jpeg_pipe', 'png_pipe', 'webp_pipe', 'image2']);
const IMAGE_CODECS = new Set(['mjpeg', 'png', 'webp']);
const VIDEO_FORMATS = new Set(['mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm']);
const VIDEO_CODECS = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1']);

const probeSchema = z.object({
  format: z.object({
    format_name: z.string(),
    duration: z.coerce.number().optional(),
  }),
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      side_data_list: z
        .array(z.object({ rotation: z.number().optional() }))
        .optional(),
    }),
  ),
});

export interface ProbedMedia {
  /** As displayed, after the rotation the file declares. */
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
}

export type ProbeVerdict =
  { ok: true; media: ProbedMedia } | { ok: false; reason: MediaFailureReason };

const refuse = (reason: MediaFailureReason): ProbeVerdict => ({
  ok: false,
  reason,
});

/**
 * Judges an upload from ffprobe's output before anything decodes it further: the container
 * and codec must be allowed for its kind, its size within MEDIA_LIMITS and, for a video,
 * its duration too. The uploader's declared type is never trusted.
 */
export function judgeProbe(kind: MediaKind, probe: unknown): ProbeVerdict {
  const parsed = probeSchema.safeParse(probe);
  if (!parsed.success) return refuse('unsupported_format');
  const { format, streams } = parsed.data;
  const visual = streams.filter((stream) => stream.codec_type === 'video');
  const [main] = visual;
  if (!main?.width || !main.height || !main.codec_name) {
    return refuse('unsupported_format');
  }

  const allowed =
    kind === 'image'
      ? IMAGE_FORMATS.has(format.format_name) &&
        IMAGE_CODECS.has(main.codec_name) &&
        visual.length === 1
      : VIDEO_FORMATS.has(format.format_name) &&
        VIDEO_CODECS.has(main.codec_name);
  if (!allowed) return refuse('unsupported_format');

  const quarterTurns = Math.round(
    (main.side_data_list?.find((data) => data.rotation !== undefined)
      ?.rotation ?? 0) / 90,
  );
  const sideways = Math.abs(quarterTurns) % 2 === 1;
  const width = sideways ? main.height : main.width;
  const height = sideways ? main.width : main.height;
  if (Math.max(width, height) > MEDIA_LIMITS.maxDimension) {
    return refuse('too_large');
  }

  const durationMs = Math.round((format.duration ?? 0) * 1000);
  if (kind === 'video') {
    if (durationMs <= 0) return refuse('unsupported_format');
    if (durationMs > MEDIA_LIMITS.videoMaxSeconds * 1000) {
      return refuse('too_long');
    }
  }
  return {
    ok: true,
    media: {
      width,
      height,
      durationMs: kind === 'video' ? durationMs : 0,
      hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    },
  };
}

/** The variant widths for a source of this width: the targets that fit, or the source's own. */
export function variantWidths(
  sourceWidth: number,
  targets: readonly number[],
): number[] {
  const fitting = targets.filter((width) => width <= sourceWidth);
  return fitting.length > 0 ? fitting : [sourceWidth];
}

/** Still processing past the allowed time: the worker may be down (design: Cae el worker). */
export function isStalled(
  status: MediaStatus,
  processingSince: Date | null,
  now: Date,
  stalledMinutes: number,
): boolean {
  return (
    status === 'processing' &&
    processingSince !== null &&
    now.getTime() - processingSince.getTime() >= stalledMinutes * 60_000
  );
}

/** An optimized image as stored: object keys, resolved to URLs only when served. */
export interface StoredImage {
  width: number;
  height: number;
  sources: { width: number; key: string }[];
}

export type MediaVariants =
  | { kind: 'image'; image: StoredImage }
  | {
      kind: 'video';
      video: {
        key: string;
        width: number;
        height: number;
        durationMs: number;
        poster: StoredImage;
      };
    };

export function resolveImage(
  image: StoredImage,
  publicUrl: (key: string) => string,
): MenuImage {
  return {
    width: image.width,
    height: image.height,
    sources: image.sources.map((source) => ({
      width: source.width,
      url: publicUrl(source.key),
    })),
  };
}

export function resolveVariants(
  variants: MediaVariants,
  publicUrl: (key: string) => string,
): { image: MenuImage; video: null } | { image: null; video: MenuVideo } {
  if (variants.kind === 'image') {
    return { image: resolveImage(variants.image, publicUrl), video: null };
  }
  const { video } = variants;
  return {
    image: null,
    video: {
      url: publicUrl(video.key),
      width: video.width,
      height: video.height,
      durationMs: video.durationMs,
      poster: resolveImage(video.poster, publicUrl),
    },
  };
}
