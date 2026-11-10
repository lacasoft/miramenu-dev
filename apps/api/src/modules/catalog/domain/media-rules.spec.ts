import { MEDIA_LIMITS } from '@miramenu/contracts';
import {
  IMAGE_WIDTHS,
  isStalled,
  judgeProbe,
  resolveVariants,
  variantWidths,
} from './media-rules';

const jpeg = (width: number, height: number, extra: object = {}) => ({
  format: { format_name: 'jpeg_pipe' },
  streams: [
    { codec_type: 'video', codec_name: 'mjpeg', width, height, ...extra },
  ],
});

const mp4 = (
  seconds: number,
  stream: object = {},
  format = 'mov,mp4,m4a,3gp,3g2,mj2',
) => ({
  format: { format_name: format, duration: String(seconds) },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      ...stream,
    },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
});

describe('judgeProbe (ADR-0038)', () => {
  it('accepts an allowed image and reports its size', () => {
    expect(judgeProbe('image', jpeg(4032, 3024))).toEqual({
      ok: true,
      media: { width: 4032, height: 3024, durationMs: 0, hasAudio: false },
    });
  });

  it('accepts an allowed video within the duration limit', () => {
    expect(judgeProbe('video', mp4(12.5))).toEqual({
      ok: true,
      media: { width: 1920, height: 1080, durationMs: 12500, hasAudio: true },
    });
  });

  it('swaps width and height for a video recorded sideways', () => {
    const verdict = judgeProbe(
      'video',
      mp4(5, { side_data_list: [{ rotation: -90 }] }),
    );
    expect(verdict).toEqual({
      ok: true,
      media: expect.objectContaining({ width: 1080, height: 1920 }),
    });
  });

  it('refuses a video longer than the limit', () => {
    expect(
      judgeProbe('video', mp4(MEDIA_LIMITS.videoMaxSeconds + 0.5)),
    ).toEqual({ ok: false, reason: 'too_long' });
  });

  it('refuses an image or video larger than the maximum dimension', () => {
    expect(
      judgeProbe('image', jpeg(MEDIA_LIMITS.maxDimension + 1, 10)),
    ).toEqual({ ok: false, reason: 'too_large' });
  });

  it('never trusts the declared type: a video sent as an image is refused', () => {
    expect(judgeProbe('image', mp4(3))).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
    expect(judgeProbe('video', jpeg(100, 100))).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
  });

  it('refuses containers and codecs outside the list, and unreadable output', () => {
    for (const probe of [
      mp4(3, {}, 'avi'),
      mp4(3, { codec_name: 'mpeg4' }),
      { format: { format_name: 'svg_pipe' }, streams: [] },
      {
        format: { format_name: 'jpeg_pipe' },
        streams: [{ codec_type: 'video', codec_name: 'mjpeg' }],
      },
      mp4(0),
      'not json',
      null,
    ]) {
      expect(judgeProbe('video', probe)).toEqual({
        ok: false,
        reason: 'unsupported_format',
      });
    }
  });
});

describe('variantWidths', () => {
  it('never enlarges: only the targets that fit', () => {
    expect(variantWidths(4032, IMAGE_WIDTHS)).toEqual([480, 960, 1440]);
    expect(variantWidths(1000, IMAGE_WIDTHS)).toEqual([480, 960]);
    expect(variantWidths(480, IMAGE_WIDTHS)).toEqual([480]);
  });

  it("keeps the source's own width when it is smaller than every target", () => {
    expect(variantWidths(300, IMAGE_WIDTHS)).toEqual([300]);
  });
});

describe('isStalled', () => {
  const since = new Date('2026-11-10T10:00:00Z');
  const at = (minutes: number) => new Date(since.getTime() + minutes * 60_000);

  it('flags media still processing past the limit, and nothing else', () => {
    expect(isStalled('processing', since, at(10), 10)).toBe(true);
    expect(isStalled('processing', since, at(9.9), 10)).toBe(false);
    expect(isStalled('ready', since, at(60), 10)).toBe(false);
    expect(isStalled('pending_upload', null, at(60), 10)).toBe(false);
  });
});

describe('resolveVariants', () => {
  const url = (key: string) => `https://media.example.test/${key}`;

  it('turns stored keys into public URLs', () => {
    expect(
      resolveVariants(
        {
          kind: 'video',
          video: {
            key: 'm/v.mp4',
            width: 720,
            height: 1280,
            durationMs: 9000,
            poster: {
              width: 480,
              height: 853,
              sources: [{ width: 480, key: 'm/p.webp' }],
            },
          },
        },
        url,
      ),
    ).toEqual({
      image: null,
      video: {
        url: 'https://media.example.test/m/v.mp4',
        width: 720,
        height: 1280,
        durationMs: 9000,
        poster: {
          width: 480,
          height: 853,
          sources: [{ width: 480, url: 'https://media.example.test/m/p.webp' }],
        },
      },
    });
  });
});
