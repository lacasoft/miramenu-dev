import { VIDEO_SHORT_SIDE } from '../domain/media-rules';

/** ffmpeg output arguments for each variant (ADR-0038). Inputs are added by the adapter. */

const WEBP_QUALITY = '80';

/** One WebP frame of the given width, with no metadata (EXIF, GPS) carried over. */
export function webpArgs(width: number, output: string): string[] {
  return [
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
    '-vf',
    `scale=${width}:-1`,
    '-c:v',
    'libwebp',
    '-quality',
    WEBP_QUALITY,
    '-map_metadata',
    '-1',
    output,
  ];
}

/** A video's poster: the frame at the given second, as WebP. */
export function posterArgs(
  width: number,
  atSeconds: number,
  output: string,
): string[] {
  return ['-ss', atSeconds.toFixed(2), ...webpArgs(width, output)];
}

/**
 * MP4 H.264 for every phone: the shorter side at most 720 px and even (yuv420p needs it),
 * AAC audio when there is any, the index up front so playback starts before the download
 * ends, and no metadata.
 */
export function videoArgs(output: string): string[] {
  const side = (dimension: string) =>
    `trunc(min(${VIDEO_SHORT_SIDE},${dimension})/2)*2`;
  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `scale='if(gt(iw,ih),-2,${side('iw')})':'if(gt(iw,ih),${side('ih')},-2)'`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-map_metadata',
    '-1',
    output,
  ];
}
