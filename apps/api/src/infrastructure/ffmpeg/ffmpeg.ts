import { execFile } from 'node:child_process';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';

/** A failed or timed-out ffmpeg/ffprobe run. stderr is cut short: it may echo file data. */
export class FfmpegError extends Error {
  constructor(
    readonly tool: string,
    readonly timedOut: boolean,
    stderr: string,
  ) {
    super(
      `${tool} ${timedOut ? 'timed out' : 'failed'}: ${stderr.trim().slice(0, 300)}`,
    );
    this.name = 'FfmpegError';
  }
}

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * Runs ffprobe and ffmpeg on untrusted uploads, contained (ADR-0038): no shell, no stdin,
 * local files only (no network or other protocols), a hard time limit and SIGKILL when it
 * passes. Paths must not contain "%", which the image2 demuxer reads as a pattern.
 */
@Injectable()
export class Ffmpeg {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.ffmpegPath = config.media.ffmpegPath;
    this.ffprobePath = config.media.ffprobePath;
  }

  /** ffprobe's description of a local file, as parsed JSON. */
  async probe(path: string, timeoutMs: number): Promise<unknown> {
    assertPlainPath(path);
    const stdout = await run(
      this.ffprobePath,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        path,
      ],
      timeoutMs,
    );
    return JSON.parse(stdout) as unknown;
  }

  /** Reads one local input and writes what outputArgs say (codecs, filters, output path). */
  async transcode(
    input: string,
    outputArgs: readonly string[],
    timeoutMs: number,
  ): Promise<void> {
    assertPlainPath(input);
    await run(
      this.ffmpegPath,
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-protocol_whitelist',
        'file',
        '-i',
        input,
        ...outputArgs,
      ],
      timeoutMs,
    );
  }
}

function assertPlainPath(path: string): void {
  if (!path.startsWith('/') || path.includes('%')) {
    throw new Error('ffmpeg inputs must be plain absolute paths');
  }
}

function run(
  tool: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      tool,
      args,
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new FfmpegError(tool, error.killed ?? false, String(stderr)));
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}
