import { posterArgs, videoArgs, webpArgs } from './transcode-args';

const valueAfter = (args: string[], flag: string) =>
  args[args.indexOf(flag) + 1];

describe('transcode arguments (ADR-0038)', () => {
  it('writes WebP at the given width, one frame, without metadata', () => {
    const args = webpArgs(960, '/tmp/x/image-960.webp');
    expect(valueAfter(args, '-vf')).toBe('scale=960:-1');
    expect(valueAfter(args, '-c:v')).toBe('libwebp');
    expect(valueAfter(args, '-frames:v')).toBe('1');
    expect(valueAfter(args, '-map_metadata')).toBe('-1');
    expect(args.at(-1)).toBe('/tmp/x/image-960.webp');
  });

  it('takes the poster frame at the given second', () => {
    const args = posterArgs(480, 0.5, '/tmp/x/poster-480.webp');
    expect(valueAfter(args, '-ss')).toBe('0.50');
    expect(valueAfter(args, '-vf')).toBe('scale=480:-1');
  });

  it('writes H.264 MP4 that starts playing early, with optional audio and no metadata', () => {
    const args = videoArgs('/tmp/x/video.mp4');
    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueAfter(args, '-movflags')).toBe('+faststart');
    expect(valueAfter(args, '-map_metadata')).toBe('-1');
    expect(args).toContain('0:a:0?');
  });

  it('caps the shorter side at 720 px, even, on either orientation', () => {
    const scale = valueAfter(videoArgs('/tmp/x/video.mp4'), '-vf');
    expect(scale).toBe(
      "scale='if(gt(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gt(iw,ih),trunc(min(720,ih)/2)*2,-2)'",
    );
  });
});
